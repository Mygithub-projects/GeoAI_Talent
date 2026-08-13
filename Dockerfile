# syntax=docker/dockerfile:1
# =============================================================================
#  GeoAI Talent Agent — production image (Next.js 16, standalone output)
#
#  Base: node:24-bookworm-slim to match .nvmrc (24).
#  Debian (glibc) rather than Alpine (musl) on purpose — the lockfile's Linux
#  binaries (@next/swc-linux-x64-gnu, @img/sharp-linux-x64,
#  @tailwindcss/oxide-linux-x64-gnu, lightningcss-linux-x64-gnu) are the -gnu
#  variants, and sharp needs one for Next's image optimisation.
#
#  Build:  docker compose build
#  Run:    docker compose up -d      (config comes from .env.docker at RUNTIME)
# =============================================================================

# ---------- Stage 1: dependencies -------------------------------------------
# Split from the build so `npm ci` is only re-run when the lockfile changes.
FROM node:24-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci


# ---------- Stage 2: build ---------------------------------------------------
FROM node:24-bookworm-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are INLINED BY NEXT AT BUILD TIME — in server code too,
# not just the client bundle. Verified on this codebase: after a build, zero
# `process.env.NEXT_PUBLIC_*` references survive in .next/server and the literal
# Supabase project ref is baked into 43 files. Supplying them at runtime does
# nothing, so they MUST be build args. All three are non-secret (project URL,
# publishable anon key, public site URL); real secrets stay runtime-only.
#
# Consequence: changing the public host means rebuilding the image.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# Fail loudly here rather than shipping an image that starts fine and then
# throws "Your project's URL and Key are required" on the first request.
RUN for v in NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY; do \
      eval "val=\$$v"; \
      if [ -z "$val" ]; then \
        echo "ERROR: build arg $v is empty."                                   >&2; \
        echo "These are inlined at build time and cannot be set at runtime."   >&2; \
        echo "Set them in .env at the repo root — see DOCKER.md section 1."    >&2; \
        exit 1; \
      fi; \
    done

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build


# ---------- Stage 3: runtime -------------------------------------------------
FROM node:24-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Non-root. The standalone server writes nothing to disk, so /app stays read-only
# to the app user apart from the files it owns.
RUN groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs nextjs

# `output: 'standalone'` emits a self-contained server.js plus only the traced
# node_modules. public/ and .next/static are NOT included — copy them ourselves.
COPY --from=builder            /app/public         ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static

USER nextjs
EXPOSE 3000

# node:*-slim ships neither curl nor wget, so probe with node's global fetch.
# /login is the only route that returns 200 without a session.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

# HOSTNAME=0.0.0.0 above is load-bearing: standalone server.js otherwise binds
# localhost inside the container, which the published port can never reach.
CMD ["node", "server.js"]
