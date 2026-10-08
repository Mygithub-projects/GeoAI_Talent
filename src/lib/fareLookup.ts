// LLM-based round-trip fare estimation for Boat / Flight modes in Sarawak.
// Uses the llm() wrapper (Groq by default; not web-augmented). Results
// cached in-memory per route key.
// cost_source is always 'llm'; admin can override via travel_logs UI (Phase 8).

import { llm } from './llm'

interface CacheEntry { cost_myr: number; cost_note: string }
const cache = new Map<string, CacheEntry>()

export interface FareResult {
  cost_myr:    number
  cost_source: 'llm'
  cost_note:   string
}

export async function estimateFare(
  fromDistrict: string,
  toVenueName:  string,
  mode:         'Boat' | 'Flight',
): Promise<FareResult> {
  const key = `${mode}:${fromDistrict.toLowerCase()}:${toVenueName.toLowerCase()}`
  const hit = cache.get(key)
  if (hit) {
    return {
      cost_myr:    hit.cost_myr,
      cost_source: 'llm',
      cost_note:   hit.cost_note + ' (cached)',
    }
  }

  const modeLabel = mode === 'Flight' ? 'domestic flight' : 'boat/ferry'
  let cost_myr  = 0
  let cost_note = `LLM estimate — ${mode.toLowerCase()} from ${fromDistrict}`

  try {
    const raw = await llm(
      [
        {
          role: 'system',
          content:
            'You are a logistics cost estimator for Sarawak, Malaysia. ' +
            'Respond ONLY with valid JSON in the exact format shown. No markdown, no extra text.',
        },
        {
          role: 'user',
          content:
            `Estimate the round-trip ${modeLabel} cost in Malaysian Ringgit (MYR) ` +
            `for a government trainer traveling from ${fromDistrict}, Sarawak to ${toVenueName} ` +
            `for a training engagement. ` +
            `Provide a realistic current estimate. ` +
            `Respond with JSON only: {"cost_myr": <number>, "note": "<brief explanation, max 100 chars>"}`,
        },
      ],
      { temperature: 0.1 },
    )

    const match = raw.match(/\{[^}]+\}/)
    if (match) {
      const parsed = JSON.parse(match[0]) as { cost_myr?: unknown; note?: unknown }
      if (typeof parsed.cost_myr === 'number' && parsed.cost_myr > 0) {
        cost_myr  = Math.round(parsed.cost_myr * 100) / 100
        cost_note = String(parsed.note ?? cost_note).slice(0, 120)
      }
    }
  } catch {
    cost_note = `LLM unavailable — ${mode.toLowerCase()} from ${fromDistrict} to ${toVenueName}`
  }

  cache.set(key, { cost_myr, cost_note })
  return { cost_myr, cost_source: 'llm', cost_note }
}
