# FastAPI Gateway

A transparent reverse proxy that sits **in front of** the Next.js app. Every request —
any method, path, query string, headers, cookies, body — is forwarded to the Next.js
server unchanged, and the response streams back byte-for-byte (status codes, redirects,
duplicate `Set-Cookie` headers and all). **No Next.js code is touched**; the app keeps
working exactly as before whether you access it directly or through the gateway.

```
Browser ──> FastAPI gateway (:8000) ──> Next.js app (:3000)
```

## Why

- A Python surface for future extensions (ML models, geospatial analytics, etc.) without
  touching the Next.js codebase — add new endpoints under the reserved `/gateway/*` prefix.
- OpenAPI/Swagger UI at `/gateway/docs`, health probe at `/gateway/health`.

## Run

```powershell
cd fastapi-gateway
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\uvicorn main:app --host 0.0.0.0 --port 8000
```

Then open http://localhost:8000 — the full app, identical flow.

| Env var | Default | Meaning |
|---|---|---|
| `NEXT_UPSTREAM` | `http://localhost:3000` | Where the Next.js app runs |

## Reserved paths (gateway-own, never proxied)

- `GET /gateway/health` — gateway + upstream liveness
- `GET /gateway/docs` — Swagger UI (OpenAPI at `/gateway/openapi.json`)

Everything else is proxied verbatim. New Python endpoints must be added under
`/gateway/…` so they can never shadow a Next.js route.

## Notes / limits

- **WebSockets are proxied too** — Next.js dev-mode HMR (`/_next/webpack-hmr`) works
  through the gateway, so the full dev experience (including hot reload and dev-mode
  dynamic chunk hydration, which depends on that socket) is identical on :8000.
  Production builds open no WebSockets at all.
- The gateway never follows redirects (the app's `307 → /login` and email-link redirects
  reach the browser untouched) and never rewrites cookies.
- `pg_cron`/Supabase call the app's cron route directly by URL — if you front the app
  with this gateway in production, the `app.settings.feedback_cron_url` GUC can point at
  either the gateway or the Next.js host; both hit the same route.
