# CLAUDE.md — GEO-TALENT AGENT (project rules for Claude Code)

> Claude Code reads this every session. It holds the standing rules so I don't re-paste them.
> The step-by-step build lives in `GeoAI_Build_Prompts.md`; progress/state in `GeoAI_Progress.md`.

## What this is
A bilingual (English / Bahasa Melayu, one language at a time) geospatial web app for JPN Sarawak that
maps teacher expertise and recommends Master Trainers for training engagements, with travel-cost
estimation and a human-approved invitation workflow.

## At the start of every session
1. Read `GeoAI_Progress.md` (current phase + what's built) and `GEO_TALENT_AGENT_Architecture_Plan.md`.
2. Wait for me to paste a phase prompt. Build ONLY that phase, verify it, then STOP.

## Tech stack
- Next.js (App Router) + TypeScript + Tailwind v4; Supabase (PostgreSQL + PostGIS + Auth + RLS).
- Map: react-leaflet + OSM tiles + heat layer.
- LLM: OpenAI-compatible client, **Groq now** (`GROQ_API_KEY`, base `https://api.groq.com/openai/v1`,
  a tool-use model), swappable to Claude/OpenAI via `LLM_PROVIDER`/`LLM_BASE_URL`/`LLM_MODEL`. All LLM
  calls go behind one small `llm()` wrapper in `src/lib/llm.ts`. Handle 429s with backoff.
- Embeddings: Groq has none → RAG uses Postgres full-text search now (local-embedding pgvector later).
- Web search (flight fares): Groq compound model or Tavily/SerpApi.
- Email: Resend / Nodemailer.

## Non-negotiable rules
- **Deterministic maths.** All spatial queries and the LAND-cost formula are code, never the LLM.
  Land cost = RM1.00/km for 0–500 km, RM0.90/km for >500 km (rate by total distance bracket), read from
  `travel_rates` (config, never hardcoded). FLIGHT/BOAT fares have no per-km rate → estimate via web
  search/LLM, cache, label as estimate, admin-overridable; record `travel_logs.cost_source`.
- **Two modes, shared radius (0–500 km, default 50).** Mode A = no venue → trainer heatmap + subject/skill
  filter, centred on the user's own district by default (statewide for admins). Mode B = dynamic venue
  (geocode a place name / match registry / drop a map pin) → recommend within the radius.
- **Single active language + translate function.** Stored EN/BM are the translation source for fixed
  content; free text translated on demand via `/api/translate`. Never show both languages at once.
- **Security.** RLS enforced in the DB (district scope). Signed, single-use, expiring invitation tokens.
  Registration domain-restricted (@moe.gov.my) OR on the admin allowlist. Admin allowlist:
  wun@iegcampus.com, mich88lim@gmail.com, michelle.lim@gmail.com — auto-set to admin on sign-up.
  All other accounts start as role=user, status=pending. No self-promotion (role/status changes are
  admin-only). Never remove the last admin. MFA for admins. Audit every sensitive action.
- **Identity.** One trainer = one person; many skills via `trainer_skills`. Trainer location derives from
  the school code.
- **Never commit PII or secrets.** Real keys live in `.env.local` only. Keep the cleaned dataset out of
  git; load it into the database via the Phase 1 ingestion.

## Design system (apply to every screen)
Corporate, professional, dynamic. The live map is the hero. Colours: Ink Navy #0E2F57 (brand), Royal Blue
#1E63C4 (interactive), Teal #12B5AC (geospatial accent), Amber #F2A341 (heat/alerts), Slate #15233A
(text), Surface #F6F8FB. Type: Plus Jakarta Sans (display), Inter (body), IBM Plex Mono (data). Logo in
`/public` (logo_horizontal / logo_icon / logo_dark). App shell = nav rail + top bar + full-bleed map +
assistant drawer. Cards 12–16px radius, soft shadows, pill buttons, Mode A/B segmented control, colour-
coded status badges. Subtle motion; respect prefers-reduced-motion. WCAG AA, keyboard focus, responsive.

## Phase discipline
Build one phase only. When done: (1) update `GeoAI_Progress.md` (mark complete, log what was built, set
the next phase); (2) STOP; (3) print: "PHASE n COMPLETE ✅ — verified, progress updated. Paste the
Phase n+1 prompt when ready, or tell me to HOLD." Log any ad-hoc change in the Change Log too. If unsure,
ask before guessing.
