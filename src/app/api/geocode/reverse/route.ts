import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Coordinates → short place name for the "You are here: …" pin label.
// Server-side for the same reason as /api/geocode (restricted networks can't
// reach Nominatim directly, and the user's IP isn't exposed to it). The
// coordinates are never logged.

// Rounded to ~100 m so nearby lookups share a cache entry
const cache = new Map<string, string | null>()
const MAX_CACHE_SIZE = 500

interface NominatimReverse {
  name?:         string
  category?:     string
  display_name?: string
  address?:      Record<string, string>
}

// ONE short place name (user decision): the named place itself when OSM
// has one ("Kuching Waterfront", "Jabatan Pendidikan Negeri Sarawak"),
// else the local area ("Petra Jaya"), else the town ("Kuching"). A road
// is never used as the place — the label should read like a place.
function shortPlaceName(r: NominatimReverse): string | null {
  const named = r.name?.trim()
  if (named && r.category !== 'highway') return named
  const a = r.address ?? {}
  return a.suburb ?? a.neighbourhood ?? a.quarter ?? a.village ?? a.hamlet
      ?? a.town ?? a.city ?? a.municipality ?? a.county ?? a.state_district
      ?? null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const lat = Number(req.nextUrl.searchParams.get('lat'))
  const lng = Number(req.nextUrl.searchParams.get('lng'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 })
  }

  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`
  if (cache.has(key)) return NextResponse.json({ place: cache.get(key) })

  try {
    const params = new URLSearchParams({
      lat:            String(lat),
      lon:            String(lng),
      format:         'jsonv2',
      zoom:           '18',   // building / landmark detail
      addressdetails: '1',
    })
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${params}`,
      {
        headers: {
          'User-Agent': 'GeoAITalentAgent/1.0 (wun@iegcampus.com)',
          'Accept-Language': 'en',
        },
        signal: AbortSignal.timeout(6000),
      }
    )
    if (!res.ok) {
      console.error('[geocode/reverse] Nominatim error', res.status)
      return NextResponse.json({ place: null })
    }

    const place = shortPlaceName(await res.json() as NominatimReverse)

    if (cache.size >= MAX_CACHE_SIZE) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, place)

    return NextResponse.json({ place })
  } catch (err) {
    console.error('[geocode/reverse] fetch error', err instanceof Error ? err.name : 'unknown')
    return NextResponse.json({ place: null })
  }
}
