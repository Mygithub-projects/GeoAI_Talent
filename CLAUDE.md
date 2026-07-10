# CLAUDE.md — GeoAI Talent Agent (project rules for Claude Code)

> Claude Code reads this every session. It holds the standing rules so I don't re-paste them.
> The step-by-step build lives in `GeoAI_Build_Prompts.md`; progress/state in `GeoAI_Progress.md`.

## What this is
A bilingual (English / Bahasa Melayu, one language at a time) geospatial web app for JPN Sarawak that
maps teacher expertise and recommends Master Trainers for training engagements, with travel-cost
estimation and a human-approved invitation workflow.
**Product name: "GeoAI Talent Agent" — identical in BOTH languages (brand names are not translated;
renamed 2026-07-08 from "GEO-TALENT AGENT" / BM "EJEN GEO-BAKAT" — never reintroduce the old names).**
The `geo-talent-agent/` folder, repo name, and `geo-talent-lang` cookie keep their old identifiers on
purpose (renaming the cookie would reset every user's saved language preference).

## At the start of every session
1. Read `GeoAI_Progress.md` (current phase + what's built) and `GEO_TALENT_AGENT_Architecture_Plan.md`.
2. Wait for me to paste a phase prompt. Build ONLY that phase, verify it, then STOP.

## Tech stack
- Next.js (App Router) + TypeScript + Tailwind v4; Supabase (PostgreSQL + PostGIS + Auth + RLS).
- Map: react-leaflet + OSM tiles + heat layer.
- LLM: OpenAI-compatible client, **Groq now** (`GROQ_API_KEY`, base `https://api.groq.com/openai/v1`,
  a tool-use model), swappable to Claude/OpenAI via `LLM_PROVIDER`/`LLM_BASE_URL`/`LLM_MODEL`. All LLM
  calls go behind `src/lib/llm.ts`: `llm()` (plain), `llmChat()` (tool use — Lexi orchestrator),
  `llmWebSearch()` (compound model). Handle 429s with backoff (3-key rotation built in). **Groq gotcha:**
  llama models stochastically 400 with `tool_use_failed` on tool calls — `recoverToolCall()` in llm.ts
  parses the intended call out of the error's `failed_generation`; do not remove it.
- Embeddings: Groq has none → Lexi's KB retrieval is fetch-and-rank in `src/lib/knowledgeBase.ts`
  (small interface — swap for FTS/pgvector later). KB rows live in `knowledge_base` (bilingual,
  seeded by migration 022, editable via `/admin/database`).
- Web search: Groq compound model — **`compound-beta` is retired**; use `groq/compound-mini`
  (env `LLM_SEARCH_MODEL`) for Lexi's general answers, or Tavily/SerpApi for fares.
- Email: `src/lib/email.ts` dispatches Resend (`RESEND_API_KEY`/`EMAIL_API_KEY`) → Nodemailer SMTP
  (requires `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` all set) → console-log dev fallback (which also
  prints the accept/decline links so flows are testable without a provider). **Current transport
  (2026-07-08): Gmail SMTP from `mich88lim@gmail.com` via App Password — a TESTING setup only**
  (~500/day cap, Gmail as sender); live outreach still needs a verified-domain provider. The earlier
  attempt to verify `send.iegcampus.com` via Resend + Cloudflare was abandoned and rolled back — do
  NOT resume it, and do NOT set `RESEND_API_KEY` without a Resend-verified `EMAIL_FROM` domain (a key
  with no verified sender makes every send fail 403 *silently*). `sendEmail()` returns the transport
  used; invite routes surface `email_delivered: false` to the UI when only the console fallback ran.
  Supabase Auth's own emails (signup/invite/reset) use Supabase's default built-in mailer.

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
- **Security.** RLS enforced in the DB: WRITE access to schools/master_trainers/trainer_skills/
  trainer_roles is admin-only (`is_admin()`). READ access to that data is open to every active
  authenticated user regardless of role or assigned district — `profiles.ppd_district` (including the
  `STATEWIDE` sentinel) only selects the map's default camera position on login, it does not gate what
  rows a query can return. Signed, single-use, expiring invitation tokens.
  Registration domain-restricted (@moe.gov.my) OR on the admin allowlist. Admin allowlist:
  wun@iegcampus.com, mich88lim@gmail.com, michelle.lim@gmail.com — auto-set to admin on sign-up.
  All other accounts start as role=user, status=pending. No self-promotion (role/status changes are
  admin-only). Never remove the last admin. Admins can Suspend (reversible, keeps history) or
  permanently Delete an account from User Management — Delete refuses up front if the account created
  any engagement or invitation rather than letting the DB's un-cascaded foreign keys fail it. Neither
  action may target the caller's own account or the last active admin. MFA for admins. Audit every
  sensitive action.
- **Identity.** One trainer = one person; many skills via `trainer_skills`. Trainer location derives from
  the school code.
- **Rescheduling an invited workshop resets trainer consent (2026-07-10 — replaces the old
  "dates locked once invited" rule).** `POST /api/engagements/update` allows title/venue edits on any
  non-Cancelled workshop; date edits are free while Draft, but once invitations are sent a date change
  requires `confirm_reschedule: true` (else 409 `RESCHEDULE_CONFIRM_REQUIRED`) because trainers
  accepted the OLD dates: every Pending Invite/Confirmed trainer is reset to Pending Invite
  (`responded_at` nulled, `invited_at` bumped), ALL outstanding tokens invalidated, fresh accept/decline
  pairs issued (expiry capped at the new start date), and a bilingual date-change email
  (`buildRescheduleEmail`, amber bar, old dates struck through) sent to each — Declined trainers
  untouched; rollup recomputed; audited as `engagement.reschedule`; creator gets an in-app
  `engagement_rescheduled` notification when an admin rescheduled someone else's workshop. Never
  change dates on an invited engagement without this flow. Hard deletion
  (`POST /api/engagements/delete`) is Draft-only; anything invited must use Cancel (soft, audited).
- **Admin Database Console** (`/admin/database`): direct CRUD over the 7 reference tables only, driven
  by the allowlist registry in `src/lib/adminTables.ts` — never add transactional tables
  (engagements/tokens/audit/profiles) or `admin_allowlist` to it. Every request is validated against
  the registry; every mutation is audit-logged.
- **Workshop Calendar** (`/calendar`): visible to ALL active users (deliberate product decision —
  matches what availability search already implies). Drafts hidden by default behind a toggle.
- **Lexi assistant** (Phase 7, live): `POST /api/assistant` orchestrator + 6 deterministic tools in
  `src/lib/assistantTools.ts` (KB search, find trainers, trainer history, availability, navigate,
  web search). The LLM only parses intent and phrases replies — every count/cost/date comes from a
  tool; Lexi has NO mutating tools and must never gain one that sends email, edits data, approves
  users, or changes settings (those stay behind the human-approval screens; offer navigation instead).
  General/web-search answers MUST keep the `generalKnowledge` flag → amber "general knowledge" label
  in the drawer; never route system-data questions through web_search. Trainer history costs are
  queried as the CALLER (RLS-scoped); admin screens are role-gated in the navigate tool. Prompt
  chips + all assistant copy live in the `lexi` i18n namespace (en+bm).
  **Conversation memory (2026-07-10):** history is server-authoritative — `POST /api/assistant`
  takes only `{message, locale}`; each turn persists to `assistant_messages` and older turns are
  condensed into a per-user rolling summary (`assistant_memory`), both from migration 023,
  maintained by `src/lib/assistantMemory.ts` and injected into the system prompt. The drawer
  replays history via `GET /api/assistant/history`; Clear = `DELETE` on the same route. All memory
  ops are best-effort (Lexi still answers if 023 isn't applied). Chats are private: RLS select-own
  only, deliberately NO admin-read-all policy; writes go through the admin client scoped to the
  caller. Exact figures must still come from tools — never from the memory summary.
- **In-app notifications**: `/api/invitations/respond` writes a bilingual `notifications` row for the
  engagement creator on trainer accept/decline (best-effort — must never break the response flow);
  TopBar `NotificationBell` + `GET/POST /api/notifications` (list own via RLS; mark-read via admin
  client scoped to the caller).
- **Never commit PII or secrets.** Real keys live in `.env.local` only. Keep the cleaned dataset out of
  git; load it into the database via the Phase 1 ingestion.
- **Never trigger a real email send to a fake/reserved address** (e.g. `@example.com`) — Supabase flagged
  this project for a high bounce rate after exactly that during testing, which risked the project's email
  sending being restricted entirely. For auth-flow testing, use `admin.generateLink()` +
  `/auth/v1/verify` token exchange (never sends anything) instead of `inviteUserByEmail()`/`signUp()`
  against invented addresses. If a real send genuinely needs testing, use a real inbox you control.

## Design system (apply to every screen)
Corporate, professional, dynamic — "polished corporate" per the 2026-07-08 redesign; **light mode only
(no dark mode — deliberate decision)**. The live map is the hero. Colours: Ink Navy #0E2F57 (brand),
Royal Blue #1E63C4 (interactive), Teal #12B5AC (geospatial accent), Amber #F2A341 (heat/alerts), Slate
#15233A (text), Surface #F6F8FB — plus tint scales (navy/blue/teal/amber 50–800) in `globals.css`.
Type: Plus Jakarta Sans (display), Inter (body), IBM Plex Mono (data). Logo in `/public`
(logo_horizontal / logo_icon / logo_dark — wordmark inside the SVGs reads "GeoAI Talent Agent").
App shell = gradient nav rail (teal active-indicator bar) + translucent blur top bar + full-bleed map +
assistant drawer. All tokens live in `globals.css` `@theme` (+ gradient/glass utilities: `.glass`,
`.geo-pattern`, `.bg-hero-gradient/.bg-rail-gradient/.bg-cta-gradient`, `.card-lift`, `.skeleton`,
`.animate-fade-up` + `.stagger-*`; shadows `shadow-card/card-hover/float/modal`). Reuse the primitives
in `src/components/ui/` (Button, Input, Alert, Card, Badge, EmptyState, Skeleton) instead of inline
Tailwind re-implementations. Map floating panels use the `.glass`/`shadow-float` treatment. Cards
12–16px radius, pill buttons, Mode A/B segmented control, colour-coded status badges. Subtle motion;
respect prefers-reduced-motion. WCAG AA, keyboard focus, responsive. Every new UI string goes into BOTH
`src/i18n/en.ts` and `bm.ts` (the `Translations` interface enforces parity) — no hardcoded UI text.

## Phase discipline
Build one phase only. When done: (1) update `GeoAI_Progress.md` (mark complete, log what was built, set
the next phase); (2) STOP; (3) print: "PHASE n COMPLETE ✅ — verified, progress updated. Paste the
Phase n+1 prompt when ready, or tell me to HOLD." Log any ad-hoc change in the Change Log too. If unsure,
ask before guessing.
