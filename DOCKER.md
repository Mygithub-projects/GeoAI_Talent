# Running GeoAI Talent Agent in Docker

The image packages the **Next.js app only**. Supabase (Postgres + PostGIS + Auth) stays
hosted; the FastAPI gateway in `fastapi-gateway/` is deliberately not part of this stack.

Everything configurable is injected at **runtime**, so one image runs unchanged on a laptop,
a JPN VM, or any container host.

---

## 1. One-time setup — create `.env.docker` and `.env`

Two files, because Next.js splits configuration across two moments:

| File | When | Contents |
|---|---|---|
| `.env` | **build** | the 3 `NEXT_PUBLIC_*` values, all non-secret |
| `.env.docker` | **run** | everything else — Supabase service key, SMTP, Groq keys, token secrets |

> **Why `NEXT_PUBLIC_*` can't be a runtime value.** Next inlines those into the bundle at build
> time — **server code included**, not just the client. Verified here: after a build, zero
> `process.env.NEXT_PUBLIC_*` references survive in `.next/server`, and the literal Supabase
> project ref is baked into 43 files. Setting them at runtime does nothing, which shows up as
> *"Your project's URL and Key are required to create a Supabase client!"* on the first request.
> Compose also only interpolates `${...}` from `.env`, never from `.env.docker`.

Neither file may be committed; both are gitignored **and** dockerignored, so no key can reach a
commit or survive in an image layer.

### 1a. `.env.docker` — runtime

`.env.local` is *not* a drop-in substitute:

> **`.env.local` puts explanatory comments on the same line as a value.** Next.js/dotenv strips
> those; Docker Compose's `env_file` parser may not, and `SUPABASE_SERVICE_KEY` would arrive with
> `   # service_role key…` appended — which fails auth in a way that looks exactly like a bad key.
> In `.env.docker`, **every value sits alone on its line.**

Start from the template and fill in real values:

```powershell
Copy-Item .env.docker.example .env.docker
notepad .env.docker
```

Or convert `.env.local` automatically — this strips inline comments and leaves whole-line
comments alone:

```powershell
Get-Content .env.local |
  ForEach-Object { $_ -replace '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*?)\s+#.*$', '$1=$2' } |
  Set-Content .env.docker -Encoding utf8
```

Check the result — this should print nothing:

```powershell
Select-String -Path .env.docker -Pattern '^\s*[A-Za-z_][A-Za-z0-9_]*=.*#'
```

### 1b. `.env` — build

Three lines, derived from `.env.docker` so the two can't drift:

```powershell
Select-String -Path .env.docker -Pattern '^(NEXT_PUBLIC_SITE_URL|NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY)=' |
  ForEach-Object { $_.Line } |
  Set-Content .env -Encoding utf8
Get-Content .env
```

Expected shape:

```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

A missing or blank value aborts the build with a readable message — first from Compose's `:?`
guard, then from a check inside the Dockerfile. It will never produce a broken image silently.

**Re-run this step whenever `NEXT_PUBLIC_SITE_URL` changes** (i.e. at deployment) and rebuild.

---

## 2. Build and run

```powershell
docker compose build      # first build takes a few minutes (npm ci + next build)
docker compose up -d
```

Open <http://localhost:3000>.

```powershell
docker compose ps         # STATUS should reach "healthy" after ~40s
docker compose logs -f app
docker compose down       # stop and remove the container
```

## 3. After changing application code

The image is a build artefact, not a live mount — rebuild it:

```powershell
docker compose up -d --build
```

Changing only `.env.docker` needs no rebuild, just `docker compose up -d --force-recreate`.
Changing anything in `.env` (the `NEXT_PUBLIC_*` trio) **does** need a rebuild — those are
compiled into the bundle.

For day-to-day development keep using `npm run dev` (or `start-server.bat`); the container is
for production-shaped runs and deployment.

---

## How the image is put together

| Stage | What it does |
|---|---|
| `deps` | `npm ci` from `package.json` + `package-lock.json` only — re-runs solely when the lockfile changes |
| `builder` | `npm run build` with `output: 'standalone'` (set in `next.config.ts`) |
| `runner` | copies `public/`, `.next/standalone`, `.next/static`; runs `node server.js` as non-root `nextjs` (uid 1001) |

- Base `node:24-bookworm-slim`, matching `.nvmrc`. Debian rather than Alpine because the
  lockfile's Linux binaries (`@next/swc-linux-x64-gnu`, `@img/sharp-linux-x64`,
  `@tailwindcss/oxide-linux-x64-gnu`, `lightningcss-linux-x64-gnu`) are glibc builds, and
  `sharp` needs one for Next's image optimisation.
- `HOSTNAME=0.0.0.0` in the runner is load-bearing — the standalone `server.js` otherwise binds
  `localhost` inside the container and the published port never reaches it.
- `HEALTHCHECK` probes `/login` with node's global `fetch` (the slim image has neither `curl`
  nor `wget`); `/login` is the only route that returns 200 with no session.
- The three `NEXT_PUBLIC_*` values are build args, not runtime env — see §1. This does tie the
  image to one Supabase project and one public host; all three are non-secret, and in practice
  the host is set once at deployment.

---

## Deploying to a real host — the remaining checklist

1. **`NEXT_PUBLIC_SITE_URL`** → the public HTTPS host, in **`.env.docker` and `.env`**, then
   `docker compose up -d --build` (it is compiled in — a restart alone will not pick it up).
   Every invitation, feedback and password-reset link in outgoing email is built from it; a
   `localhost` value sends trainers a link only your machine can open.
2. **Supabase auth redirect URLs** → add the same host under Authentication → URL Configuration,
   or the email confirmation and reset flows bounce.
3. **The two Phase 9 cron GUCs**, which have been blocked on there being a public host —
   run once per environment in the Supabase SQL Editor:
   ```sql
   ALTER DATABASE postgres SET app.settings.feedback_cron_url
     = 'https://<app-host>/api/cron/feedback-requests';
   ALTER DATABASE postgres SET app.settings.feedback_cron_secret
     = '<CRON_SECRET from .env.docker>';
   ```
   Until these are set, the daily `trigger-feedback-requests-daily` job cannot deliver
   (pg_net cannot reach `localhost`).
4. **Email transport.** Gmail SMTP is a testing setup (~500/day, Gmail as sender) and some
   networks block outbound SMTP entirely — the container uses the host's network, so a blocked
   network stays blocked. Production needs an HTTPS email API with a verified sender domain.
   Do not set `RESEND_API_KEY` without a Resend-verified `EMAIL_FROM` domain: a key with no
   verified sender makes every send fail 403 *silently*.
5. **TLS.** The container serves plain HTTP on 3000. Terminate TLS at a reverse proxy in front
   of it — Supabase auth cookies are `Secure`, so sign-in will not persist over plain HTTP on
   anything but `localhost`.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Container healthy, browser gets connection refused | `HOSTNAME` overridden to `localhost` in `.env.docker` — remove it; compose sets `0.0.0.0` |
| "Your project's URL and Key are required to create a Supabase client!" | the `NEXT_PUBLIC_*` trio was not passed at **build** time — check `.env` (§1b), then rebuild |
| Emailed links still point at the old host | `NEXT_PUBLIC_SITE_URL` is compiled in; update `.env` too and rebuild |
| "Invalid API key" from Supabase, but the key is right | trailing `# comment` on the value in `.env.docker` — see §1a |
| Sign-in redirects back to `/login` forever | serving over plain HTTP on a non-localhost host; Supabase's `Secure` cookies are dropped |
| Emails "sent" but never arrive | console fallback ran (`email_delivered: false` in the UI), or the network blocks SMTP 587 |
| `docker compose build` fails on a native module | building for a non-x64 platform; add `platform: linux/amd64` to the service |
