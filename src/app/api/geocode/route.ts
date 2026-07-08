import { NextRequest, NextResponse } from 'next/server'

export interface GeocodeSuggestion {
  place_id:     string
  display_name: string
  lat:          number
  lng:          number
}

// Module-level in-memory cache — persists across requests within the same process.
// Key = query string (trimmed, lowercased). Value = results array.
const cache = new Map<string, GeocodeSuggestion[]>()
const MAX_CACHE_SIZE = 500

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ results: [] })

  const key = q.toLowerCase()
  if (cache.has(key)) {
    return NextResponse.json({ results: cache.get(key) })
  }

  try {
    const params = new URLSearchParams({
      q,
      format:       'json',
      limit:        '6',
      countrycodes: 'my',
      // Soft-prefer Sarawak bounding box (bounded=0 means prefer, not restrict)
      viewbox:  '108.0,0.8,119.5,5.2',
      bounded:  '0',
      addressdetails: '0',
    })

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: {
          'User-Agent': 'GeoAITalentAgent/1.0 (wun@iegcampus.com)',
          'Accept-Language': 'en',
        },
        signal: AbortSignal.timeout(6000),
      }
    )

    if (!res.ok) {
      console.error('[geocode] Nominatim error', res.status)
      return NextResponse.json({ results: [] })
    }

    const raw = await res.json() as Array<{
      place_id: number | string
      display_name: string
      lat: string
      lon: string
    }>

    const results: GeocodeSuggestion[] = raw.map(r => ({
      place_id:     String(r.place_id),
      display_name: r.display_name,
      lat:          parseFloat(r.lat),
      lng:          parseFloat(r.lon),
    }))

    // Evict oldest entry when cache is full (simple FIFO)
    if (cache.size >= MAX_CACHE_SIZE) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, results)

    return NextResponse.json({ results })
  } catch (err) {
    console.error('[geocode] fetch error', err)
    return NextResponse.json({ results: [] })
  }
}
