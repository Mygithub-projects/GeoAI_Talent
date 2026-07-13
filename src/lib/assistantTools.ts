// Lexi orchestrator tools (Phase 7). Each tool is a deterministic service
// that returns real data from the DB — the LLM only chooses which tool to
// call and phrases the answer. Lexi never fabricates figures: every count,
// cost, distance, or date in a reply comes from these executors.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToolDefinition } from './llm'
import { llmWebSearch } from './llm'
import { searchKnowledgeBase } from './knowledgeBase'

export interface ToolContext {
  admin:  SupabaseClient          // service-role client (RLS-bypassing; use only where product visibility allows)
  caller: SupabaseClient          // the signed-in user's client (RLS-scoped — used for travel_logs cost data)
  userId: string
  role:   'admin' | 'user'
  locale: 'en' | 'bm'
}

export interface ToolOutcome {
  result: string                                    // JSON string handed back to the model
  action?: { type: 'navigate'; path: string }       // side-channel for the client UI
  generalKnowledge?: boolean                        // reply must carry the "general knowledge" label
}

// Screens Lexi may navigate to. Admin screens are role-gated at execution.
const SCREENS: Record<string, { path: string; adminOnly: boolean }> = {
  dashboard:      { path: '/dashboard',      adminOnly: false },
  map:            { path: '/dashboard',      adminOnly: false },
  engagements:    { path: '/engagements',    adminOnly: false },
  calendar:       { path: '/calendar',       adminOnly: false },
  admin_users:    { path: '/admin/users',    adminOnly: true },
  admin_database: { path: '/admin/database', adminOnly: true },
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description:
        'Search this system\'s own FAQ/glossary/policy knowledge base. Use FIRST for any question ' +
        'about how THIS system works: modes A/B, travel cost rules, invitation workflow, statuses, ' +
        'roles, language toggle, calendar, radius, heatmap.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Search terms' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_trainers',
      description:
        'Count and list Master Trainers, optionally filtered by skill/subject name and/or PPD district. ' +
        'Use for questions like "how many trainers know Scratch?" or "who teaches Sains in Miri?". ' +
        'Returns real DB counts and names — never guess these.',
      parameters: {
        type: 'object',
        properties: {
          skill_or_subject: { type: 'string', description: 'Skill or subject name, e.g. "Scratch", "Sains" (optional)' },
          district:         { type: 'string', description: 'PPD district name, e.g. "KUCHING", "MIRI" (optional)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_trainer_history',
      description:
        'Fetch a trainer\'s engagement history (past and upcoming workshops with statuses) and their ' +
        'travel log rows (distance, cost, transport mode, cost source). Identify the trainer by name.',
      parameters: {
        type: 'object',
        properties: { trainer_name: { type: 'string', description: 'Trainer name (or part of it)' } },
        required: ['trainer_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description:
        'Check a trainer\'s schedule: returns their Confirmed and Pending Invite engagement dates within ' +
        'a date range so you can state conflicts or availability windows. Dates are real DB data.',
      parameters: {
        type: 'object',
        properties: {
          trainer_name: { type: 'string', description: 'Trainer name (or part of it)' },
          start_date:   { type: 'string', description: 'Range start, YYYY-MM-DD (default: today)' },
          end_date:     { type: 'string', description: 'Range end, YYYY-MM-DD (default: 60 days from start)' },
        },
        required: ['trainer_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate',
      description:
        'Open a screen for the user. Screens: dashboard (the map), engagements (workshop backlog), ' +
        'calendar (workshop month view), admin_users, admin_database (both admin-only).',
      parameters: {
        type: 'object',
        properties: {
          screen: { type: 'string', enum: Object.keys(SCREENS) },
        },
        required: ['screen'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Answer a GENERAL question that is NOT about this system\'s data — e.g. pedagogy concepts, ' +
        'training activity ideas, general facts — using the LLM\'s knowledge plus live web search. ' +
        'NEVER use this for trainer counts, costs, schedules, or anything the other tools can answer.',
      parameters: {
        type: 'object',
        properties: { question: { type: 'string', description: 'The user\'s question, self-contained' } },
        required: ['question'],
      },
    },
  },
]

// ── Helpers ─────────────────────────────────────────────────────

async function resolveTrainer(admin: SupabaseClient, name: string) {
  const { data } = await admin
    .from('master_trainers')
    .select('trainer_id, trainer_name, ppd_district')
    .ilike('trainer_name', `%${name.trim()}%`)
    .is('deleted_at', null)
    .limit(6)
  return data ?? []
}

// ── Executor ────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  switch (name) {
    case 'search_knowledge_base': {
      const hits = await searchKnowledgeBase(ctx.admin, String(args.query ?? ''), ctx.locale)
      if (hits.length === 0) {
        return { result: JSON.stringify({ found: false, note: 'No knowledge base entry matches. If this is a general (non-system) question, use web_search; otherwise say you do not have that documented.' }) }
      }
      return { result: JSON.stringify({ found: true, entries: hits.map(h => ({ title: h.title, content: h.content })) }) }
    }

    case 'find_trainers': {
      const skill    = args.skill_or_subject ? String(args.skill_or_subject).trim() : null
      const district = args.district ? String(args.district).trim().toUpperCase() : null

      let trainerIds: string[] | null = null
      let matchedItems: string[] = []
      if (skill) {
        const { data: items } = await ctx.admin
          .from('skills_subjects')
          .select('item_id, name_en, name_bm')
          .or(`name_en.ilike.%${skill}%,name_bm.ilike.%${skill}%`)
          .is('deleted_at', null)
          .limit(10)
        if (!items || items.length === 0) {
          return { result: JSON.stringify({ found: false, note: `No skill or subject matches "${skill}". Tell the user, and optionally list a few valid options by searching the knowledge base.` }) }
        }
        matchedItems = items.map(i => (ctx.locale === 'bm' ? i.name_bm : i.name_en) as string)
        const { data: links } = await ctx.admin
          .from('trainer_skills')
          .select('trainer_id')
          .in('item_id', items.map(i => i.item_id))
          .is('deleted_at', null)
        trainerIds = [...new Set((links ?? []).map(l => l.trainer_id as string))]
        if (trainerIds.length === 0) {
          return { result: JSON.stringify({ found: false, matched_skills: matchedItems, count: 0 }) }
        }
      }

      let query = ctx.admin
        .from('master_trainers')
        .select('trainer_id, trainer_name, ppd_district', { count: 'exact' })
        .is('deleted_at', null)
      if (trainerIds) query = query.in('trainer_id', trainerIds)
      if (district)   query = query.ilike('ppd_district', `%${district}%`)
      const { data: trainers, count } = await query.order('trainer_name').limit(10)

      return {
        result: JSON.stringify({
          found: (count ?? 0) > 0,
          count: count ?? 0,
          matched_skills: matchedItems,
          district_filter: district,
          sample: (trainers ?? []).map(t => ({ name: t.trainer_name, district: t.ppd_district })),
          note: (count ?? 0) > 10 ? 'sample shows the first 10 only — quote the count, not the sample size' : undefined,
        }),
      }
    }

    case 'get_trainer_history': {
      const matches = await resolveTrainer(ctx.admin, String(args.trainer_name ?? ''))
      if (matches.length === 0) return { result: JSON.stringify({ found: false, note: 'No trainer with that name.' }) }
      if (matches.length > 1) {
        return { result: JSON.stringify({ ambiguous: true, candidates: matches.map(m => ({ name: m.trainer_name, district: m.ppd_district })), note: 'Ask the user which trainer they mean.' }) }
      }
      const trainer = matches[0]

      const { data: inviteRows } = await ctx.admin
        .from('engagement_trainers')
        .select('engagement_id, status, invited_at, responded_at')
        .eq('trainer_id', trainer.trainer_id)
        .order('invited_at', { ascending: false })
        .limit(20)

      const engIds = (inviteRows ?? []).map(r => r.engagement_id as string)
      const { data: engagements } = engIds.length > 0
        ? await ctx.admin
            .from('training_engagements')
            .select('engagement_id, training_title, dynamic_venue_name, start_date, end_date, workflow_status')
            .in('engagement_id', engIds)
        : { data: [] }
      const engMap = Object.fromEntries((engagements ?? []).map(e => [e.engagement_id as string, e]))

      // Costs are RLS-scoped: query travel_logs as the CALLER, so non-admins
      // only see cost rows for engagements they created.
      const { data: logs } = engIds.length > 0
        ? await ctx.caller
            .from('travel_logs')
            .select('engagement_id, calculated_distance_km, calculated_duration_min, suggested_transport_mode, estimated_cost_myr, cost_source, cost_note')
            .eq('trainer_id', trainer.trainer_id)
            .in('engagement_id', engIds)
        : { data: [] }
      const logMap = Object.fromEntries((logs ?? []).map(l => [l.engagement_id as string, l]))

      const history = (inviteRows ?? []).map(r => {
        const eng = engMap[r.engagement_id as string]
        const log = logMap[r.engagement_id as string]
        return {
          workshop:    eng?.training_title ?? '(untitled)',
          venue:       eng?.dynamic_venue_name ?? null,
          dates:       eng ? `${eng.start_date ?? '?'} to ${eng.end_date ?? '?'}` : null,
          invite_status: r.status,
          workshop_status: eng?.workflow_status ?? null,
          travel: log
            ? {
                distance_km: log.calculated_distance_km,
                transport:   log.suggested_transport_mode,
                cost_myr:    log.estimated_cost_myr,
                cost_source: log.cost_source,
                cost_note:   log.cost_note,
              }
            : null,
        }
      })

      return {
        result: JSON.stringify({
          found: true,
          trainer: { name: trainer.trainer_name, district: trainer.ppd_district },
          engagements: history,
          note: 'travel figures may be missing for engagements the user did not create (permission-scoped)',
        }),
      }
    }

    case 'check_availability': {
      const matches = await resolveTrainer(ctx.admin, String(args.trainer_name ?? ''))
      if (matches.length === 0) return { result: JSON.stringify({ found: false, note: 'No trainer with that name.' }) }
      if (matches.length > 1) {
        return { result: JSON.stringify({ ambiguous: true, candidates: matches.map(m => ({ name: m.trainer_name, district: m.ppd_district })), note: 'Ask the user which trainer they mean.' }) }
      }
      const trainer = matches[0]

      const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(args.start_date ?? ''))
        ? String(args.start_date)
        : new Date().toISOString().slice(0, 10)
      const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(args.end_date ?? ''))
        ? String(args.end_date)
        : new Date(new Date(startDate).getTime() + 60 * 86400000).toISOString().slice(0, 10)

      const { data: inviteRows } = await ctx.admin
        .from('engagement_trainers')
        .select('engagement_id, status')
        .eq('trainer_id', trainer.trainer_id)
        .in('status', ['Confirmed', 'Pending Invite'])

      const engIds = (inviteRows ?? []).map(r => r.engagement_id as string)
      const statusMap = Object.fromEntries((inviteRows ?? []).map(r => [r.engagement_id as string, r.status as string]))

      const { data: busy } = engIds.length > 0
        ? await ctx.admin
            .from('training_engagements')
            .select('engagement_id, training_title, start_date, end_date')
            .in('engagement_id', engIds)
            .neq('workflow_status', 'Cancelled')
            .lte('start_date', endDate)
            .gte('end_date', startDate)
            .order('start_date')
        : { data: [] }

      return {
        result: JSON.stringify({
          found: true,
          trainer: { name: trainer.trainer_name, district: trainer.ppd_district },
          range: { from: startDate, to: endDate },
          busy_periods: (busy ?? []).map(b => ({
            workshop: b.training_title ?? '(untitled)',
            from: b.start_date,
            to: b.end_date,
            commitment: statusMap[b.engagement_id as string],
          })),
          note: 'busy_periods empty means the trainer has no Confirmed or Pending engagements in the range. State availability from these real dates only.',
        }),
      }
    }

    case 'navigate': {
      const screen = SCREENS[String(args.screen ?? '')]
      if (!screen) return { result: JSON.stringify({ ok: false, note: 'Unknown screen.' }) }
      if (screen.adminOnly && ctx.role !== 'admin') {
        return { result: JSON.stringify({ ok: false, note: 'That screen is admin-only and this user is not an admin. Tell them politely.' }) }
      }
      return {
        result: JSON.stringify({ ok: true, opened: screen.path, note: 'The screen is opening for the user now — confirm briefly.' }),
        action: { type: 'navigate', path: screen.path },
      }
    }

    case 'web_search': {
      try {
        const answer = await llmWebSearch(String(args.question ?? ''), ctx.locale)
        return {
          result: JSON.stringify({
            answer,
            note: 'This is general knowledge from outside the system — repeat it faithfully; it will be labelled as general knowledge in the UI.',
          }),
          generalKnowledge: true,
        }
      } catch {
        return { result: JSON.stringify({ ok: false, note: 'Web search is unavailable right now. Answer from your own general knowledge, briefly, or say you cannot.' }), generalKnowledge: true }
      }
    }

    default:
      return { result: JSON.stringify({ ok: false, note: `Unknown tool ${name}` }) }
  }
}
