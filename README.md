# GeoAI Talent Agent

A bilingual (English / Bahasa Melayu) geospatial web application for **JPN Sarawak** that maps
teacher expertise across the state and recommends Master Trainers for training engagements —
with deterministic travel-cost estimation and a human-approved invitation workflow.

The problem it solves: Sarawak is geographically vast, and choosing who should run a workshop
means balancing skills, availability and travel cost across 30 PPD districts. That decision was
being made manually from spreadsheets. This app makes it a map-first, data-backed workflow while
keeping a human in the loop for every outbound communication.

**Status: feature-complete.** Phases 0–9 delivered, 58 routes, 28 applied database migrations.

---

## What it does

| | |
|---|---|
| **Talent heatmap (Mode A)** | Full-bleed live map of trainer density, filterable by skill/subject, drilling from a district heatmap down to individual trainer pins. Non-admins open centred on their own district. |
| **Venue-based recommendation (Mode B)** | Set a venue — geocode a place name, match a school from the registry, or drop a pin — then get a ranked list of available trainers within an adjustable 0–500 km radius. |
| **Availability & travel logistics** | Date-overlap checks exclude already-booked trainers; road distance comes from OSRM routing, with cost computed from configurable per-km tiers. Flight and boat fares, which have no per-km rate, are estimated separately and clearly labelled as estimates. |
| **Human-approved outreach** | Multi-trainer selection, a shared editable email draft with per-trainer merge tokens, then bilingual invitations carrying signed single-use accept/decline links. Nothing is sent without review. |
| **Closed-loop responses** | Trainer accept/decline updates the engagement automatically, invalidates the sibling token, recomputes the workshop rollup, emails an acknowledgement, and notifies the coordinator in-app and by email. |
| **Rescheduling with re-consent** | Changing dates after invitations have gone out resets every non-declined trainer to pending, rotates all tokens, and re-invites with the old dates struck through — consent is never silently carried over. |
| **Talent distribution analysis** | District coverage traffic-lights, talent-desert and congestion detection against deterministic thresholds, and an audited admin workflow for transferring a trainer's workstation. |
| **Reporting** | Role-scoped per-workshop reporting with server-side audited CSV export, plus AI-*suggested* fit classification that a human must approve — the label is never applied by the model alone. |
| **Post-workshop feedback** | A daily scheduled job emails confirmed trainers after their workshop ends; they complete a public token-authenticated form, and results roll up into a dashboard. |
| **Lexi, the assistant** | A conversational assistant over the project's own data, with persistent memory. Read-only by design (see below). |
| **Admin console** | Registry CRUD with soft-delete and restore, user management with approval flow and MFA, a filterable audit-log viewer, and a KPI analytics dashboard. |

Everything is bilingual, one language at a time, across roughly 620 interface-enforced
translation keys — including all outbound email, which is sent in each trainer's stored locale.

---

## Architecture

**Next.js 16** (App Router) · **TypeScript** · **Tailwind v4** · **React 19**
**Supabase** — PostgreSQL + **PostGIS** + Auth + Row Level Security
**react-leaflet** + OpenStreetMap tiles + heat layer
**Groq** (OpenAI-compatible client) for the assistant and non-numeric estimation

```
src/
  app/
    (auth)/         login, register, password reset — public
    (protected)/    dashboard, talent, reports, calendar, engagements, analytics, settings
    admin/          user management, database console, audit viewer
    api/            37 route handlers
    invitations/    public trainer accept/decline pages (no session, no route into the app)
    feedback/       public token-authenticated feedback form
  components/       34 components — map, shell, ui primitives, guided tour, effects
  lib/              29 modules — spatial queries, travel cost, email, tokens, LLM, i18n data
  i18n/             en.ts / bm.ts, parity enforced by a shared TypeScript interface
db/migrations/      29 SQL migrations, applied in order
```

### Design decisions worth calling out

**Spatial maths and money are code, never the model.** Every distance, cost, count and date
check is a PostGIS query or a pure function. The LLM parses intent, phrases replies, and
estimates fares that genuinely have no formula — and those are labelled as estimates in the UI.

**Email links must never mutate on GET.** Security scanners prefetch links in email, which was
silently auto-accepting invitations. Accept/decline links now land on a public confirmation page
and the state change is POST-only. The same validate-on-GET / mutate-on-POST split applies to
every email-triggered action.

**Access control lives in the database.** RLS policies enforce that write access to the registry
is admin-only, while reads are open to any active authenticated user. Server-side routes that
use the service role apply their own explicit scoping, so the query filter *is* the access
boundary and is written once in a shared builder used by both the screen and its CSV export.

**All Supabase calls are server-side.** Browsers on restricted government and school networks
cannot reach Supabase directly, so sign-in, password changes and every data read are proxied
through the app's own routes.

**The assistant has no mutating tools, deliberately.** Lexi can search, look up and navigate;
it cannot send email, edit data, approve users or change settings. Those stay behind the
human-approval screens. Every figure it reports comes from a deterministic tool call rather than
from the model's own recollection.

**Performance detail:** the trainer layer viewport-culls above 300 pins. Roughly 990 markers,
each carrying a tooltip and popup subtree, froze the map at the zoom threshold when all were
mounted at once.

---

## Running it

Requires Node 24 (see `.nvmrc`) and a Supabase project.

```bash
npm install
cp .env.example .env.local     # then fill in your own values
npm run dev                    # http://localhost:3000
```

Apply `db/migrations/` in order in the Supabase SQL editor, then load the registry data with
`db/seed/ingest.py` (see `requirements.txt`).

### Docker

```bash
cp .env.docker.example .env.docker    # runtime config
docker compose up -d --build
```

Multi-stage build on `node:24-bookworm-slim`, running Next's standalone output as a non-root
user. See **[DOCKER.md](DOCKER.md)** for the full setup, including why the three `NEXT_PUBLIC_*`
values are build arguments rather than runtime environment variables.

---

## Notes for reviewers

- **No secrets or personal data are in this repository.** Real credentials live only in
  `.env.local`, which has never been committed; the teacher dataset is excluded by `.gitignore`
  and loaded directly into the database. Only `.env.example` templates are tracked.
- **`CLAUDE.md`** records the project's standing rules and constraints, and is the fastest way to
  understand *why* things are built the way they are.
- **Email is currently a testing configuration** (SMTP via an app password). Production outreach
  needs a provider with a verified sender domain — an HTTPS email API is preferred, since some
  target networks block outbound SMTP entirely.
- **Not yet deployed.** The app runs locally and in Docker; a public host is still needed before
  the scheduled feedback job can deliver, because the database's outbound HTTP cannot reach
  `localhost`.

---

Built for the Sarawak State Education Department, Learning Sector.
