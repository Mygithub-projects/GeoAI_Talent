import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRoute } from '@/lib/osrm'
import { computeLandCost, chooseTransportMode, type TravelRates } from '@/lib/travelCost'
import { estimateFare } from '@/lib/fareLookup'

interface RecommendBody {
  engagement_id?:    string | null
  target_item_ids?:  number[]
  venue_lat:         number
  venue_long:        number
  venue_name?:       string
  venue_school_code?: string | null
  start_date:        string
  end_date:          string
  radius_km?:        number
  training_title?:   string
  trainers_needed?:  number
}

type AvailableRow = {
  trainer_id:         string
  trainer_name:       string
  school_name:        string | null
  ppd_district:       string | null
  lat:                number
  lng:                number
  skills:             string[] | null
  subjects:           string[] | null
  roles:              string[] | null
  accessibility_tier: string
  straight_line_km:   number
}

const REUSABLE_STATUSES = ['Draft', 'Pending Invite']

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: RecommendBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    engagement_id,
    target_item_ids,
    venue_lat,
    venue_long,
    venue_name,
    venue_school_code,
    start_date,
    end_date,
    radius_km = 50,
    training_title,
    trainers_needed,
  } = body

  if (
    typeof venue_lat   !== 'number' ||
    typeof venue_long  !== 'number' ||
    typeof start_date  !== 'string' ||
    typeof end_date    !== 'string'
  ) {
    return NextResponse.json(
      { error: 'venue_lat, venue_long, start_date, end_date are required' },
      { status: 400 },
    )
  }

  if (start_date > end_date) {
    return NextResponse.json(
      { error: 'start_date must be on or before end_date' },
      { status: 400 },
    )
  }

  const clampedRadius = Math.max(1, Math.min(500, radius_km))

  // ── 0. Resolve engagement: reuse an existing Draft/Pending Invite workshop, or create fresh ──
  let engagementId: string | null = null
  let trainersNeededResolved = Math.max(1, Math.round(trainers_needed ?? 1))

  if (engagement_id) {
    const { data: existing, error: existingErr } = await supabase
      .from('training_engagements')
      .select('engagement_id, workflow_status, trainers_needed')
      .eq('engagement_id', engagement_id)
      .single()

    if (existingErr || !existing) {
      return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
    }
    if (!REUSABLE_STATUSES.includes(existing.workflow_status as string)) {
      return NextResponse.json(
        { error: `Engagement is already ${existing.workflow_status}; cannot add another invite round.` },
        { status: 409 },
      )
    }
    engagementId = existing.engagement_id as string
    trainersNeededResolved = existing.trainers_needed as number
  }

  // ── 1. Available trainers (SECURITY DEFINER bypasses RLS for cross-district + conflict check) ──
  const { data: rows, error: rpcErr } = await supabase.rpc('fn_available_trainers', {
    p_venue_lat:  venue_lat,
    p_venue_long: venue_long,
    p_radius_km:  clampedRadius,
    p_start_date: start_date,
    p_end_date:   end_date,
    p_item_ids:   (target_item_ids?.length ?? 0) > 0 ? target_item_ids : null,
    p_exclude_engagement_id: engagementId,
  })

  if (rpcErr) {
    console.error('[recommend] fn_available_trainers', rpcErr)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const candidates_raw = (rows ?? []) as AvailableRow[]
  if (candidates_raw.length === 0) {
    return NextResponse.json({
      engagement_id: engagementId,
      trainers_needed: trainersNeededResolved,
      candidates: [],
    })
  }

  // ── 2. Travel rates ──────────────────────────────────────────────────────────────────────────
  const { data: ratesData } = await supabase
    .from('travel_rates')
    .select('rate_key, rate_myr')
    .in('rate_key', ['road_per_km_0_500', 'road_per_km_over_500'])

  const rateMap: Record<string, number> = {}
  for (const r of ratesData ?? []) rateMap[r.rate_key] = Number(r.rate_myr)
  const rates: TravelRates = {
    road_per_km_0_500:    rateMap['road_per_km_0_500']    ?? 1.00,
    road_per_km_over_500: rateMap['road_per_km_over_500'] ?? 0.90,
  }

  // ── 3. Route + cost (parallel across all candidates) ────────────────────────────────────────
  const venueText = venue_name ?? `${venue_lat.toFixed(4)}, ${venue_long.toFixed(4)}`
  const msPerDay  = 1000 * 60 * 60 * 24
  const trainingDays = Math.max(1, Math.round(
    (new Date(end_date).getTime() - new Date(start_date).getTime()) / msPerDay
  ) + 1)

  // Skip OSRM for trainers > 150 km straight-line: use Haversine × 1.3 road factor instead.
  // Prevents hundreds of simultaneous external HTTP calls on large-radius searches.
  const OSRM_THRESHOLD_KM = 150

  const enriched = await Promise.all(
    candidates_raw.map(async (r) => {
      const mode   = chooseTransportMode(r.accessibility_tier)
      const slKm   = Number(r.straight_line_km)
      const route  = (mode === 'Road' && slKm <= OSRM_THRESHOLD_KM)
        ? await getRoute(r.lat, r.lng, venue_lat, venue_long, mode)
        : {
            distance_km:  Math.round(slKm * (mode === 'Road' ? 1.3 : 1.0) * 100) / 100,
            duration_min: mode === 'Road' ? Math.round((slKm * 1.3 / 60) * 60) : 0,
            source:       'haversine' as const,
          }

      let cost_myr    = 0
      let cost_source = 'formula'
      let cost_note   = ''

      if (mode === 'Road') {
        const lc  = computeLandCost(route.distance_km, rates, trainingDays)
        cost_myr    = lc.cost_myr
        cost_source = lc.cost_source
        cost_note   = lc.cost_note
      } else {
        const fare  = await estimateFare(r.ppd_district ?? 'Unknown District', venueText, mode)
        cost_myr    = fare.cost_myr
        cost_source = fare.cost_source
        cost_note   = fare.cost_note
      }

      const travel_options: Array<{
        mode: string; distance_km: number; duration_min: number
        cost_myr: number; cost_source: string; cost_note: string
      }> = [{
        mode, distance_km: route.distance_km, duration_min: route.duration_min,
        cost_myr, cost_source, cost_note,
      }]

      if (mode === 'Road' && route.distance_km > 250) {
        const flightDurationMin = Math.round((slKm / 600) * 60) + 60
        const formulaFallbackCost = Math.round((400 + slKm * 0.9) * 100) / 100
        try {
          const flightFare = await estimateFare(r.ppd_district ?? 'Unknown District', venueText, 'Flight')
          travel_options.push({
            mode: 'Flight',
            distance_km: slKm,
            duration_min: flightDurationMin,
            // If LLM returned 0 (unavailable), fall back to formula
            cost_myr:    flightFare.cost_myr > 0 ? flightFare.cost_myr : formulaFallbackCost,
            cost_source: flightFare.cost_myr > 0 ? flightFare.cost_source : 'estimate',
            cost_note:   flightFare.cost_myr > 0 ? flightFare.cost_note  : `Formula fallback: RM400 base + RM0.90/km × ${slKm.toFixed(0)} km`,
          })
        } catch (e) {
          console.error('[recommend] flight fare estimate', e)
          travel_options.push({
            mode: 'Flight',
            distance_km: slKm,
            duration_min: flightDurationMin,
            cost_myr:    formulaFallbackCost,
            cost_source: 'estimate',
            cost_note:   `Formula fallback: RM400 base + RM0.90/km × ${slKm.toFixed(0)} km`,
          })
        }
      }

      return {
        trainer_id:    r.trainer_id,
        trainer_name:  r.trainer_name,
        school_name:   r.school_name,
        ppd_district:  r.ppd_district,
        lat:           r.lat,
        lng:           r.lng,
        skills:        r.skills   ?? [],
        subjects:      r.subjects ?? [],
        roles:         r.roles    ?? [],
        distance_km:   route.distance_km,
        duration_min:  route.duration_min,
        transport_mode: mode,
        cost_myr,
        cost_source,
        cost_note,
        travel_options,
      }
    }),
  )

  // ── 4. Sort: distance ASC, then cost ASC ─────────────────────────────────────────────────────
  enriched.sort((a, b) => a.distance_km - b.distance_km || a.cost_myr - b.cost_myr)
  const candidates = enriched.map((c, i) => ({ ...c, rank: i + 1 }))

  // ── 5. Create the workshop's Draft engagement on the FIRST round only; later rounds reuse it ──
  if (!engagementId) {
    const { data: engData, error: engErr } = await supabase
      .from('training_engagements')
      .insert({
        training_title:     training_title?.trim() || `Workshop ${start_date}`,
        target_item_id:     (target_item_ids?.length ?? 0) > 0 ? target_item_ids![0] : null,
        dynamic_venue_name: venue_name       ?? null,
        venue_school_code:  venue_school_code ?? null,
        venue_lat,
        venue_long,
        search_radius_km:   clampedRadius,
        start_date,
        end_date,
        trainers_needed:    trainersNeededResolved,
        workflow_status:    'Draft',
        created_by:         user.id,
      })
      .select('engagement_id')
      .single()

    if (engErr || !engData) {
      console.error('[recommend] engagement insert', engErr)
      return NextResponse.json({ error: 'Failed to create engagement record' }, { status: 500 })
    }

    engagementId = engData.engagement_id as string
  }

  // ── 6. UPSERT travel_logs (admin client — no user INSERT policy on travel_logs) ─────────────
  const adminClient = createAdminClient()
  const { error: logErr } = await adminClient
    .from('travel_logs')
    .upsert(
      candidates.map((c) => ({
        engagement_id:           engagementId,
        trainer_id:              c.trainer_id,
        calculated_distance_km:  c.distance_km,
        calculated_duration_min: c.duration_min,
        suggested_transport_mode: c.transport_mode,
        estimated_cost_myr:      c.cost_myr,
        cost_source:             c.cost_source,
        cost_note:               c.cost_note,
      })),
      { onConflict: 'engagement_id,trainer_id' },
    )

  if (logErr) {
    // Non-fatal: return candidates even if log write fails
    console.error('[recommend] travel_logs upsert', logErr)
  }

  return NextResponse.json({
    engagement_id: engagementId,
    trainers_needed: trainersNeededResolved,
    candidates,
  })
}
