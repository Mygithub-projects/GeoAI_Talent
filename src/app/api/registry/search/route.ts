import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export interface RegistryMatch {
  id:          string
  name:        string
  ppd_district: string | null
  lat:          number
  lng:          number
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ matches: [] })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('schools')
    .select('school_code, school_name, ppd_district, latitude, longitude')
    .ilike('school_name', `%${q}%`)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .is('deleted_at', null)
    .limit(5)

  if (error) {
    console.error('[registry/search]', error)
    return NextResponse.json({ matches: [] })
  }

  const matches: RegistryMatch[] = (data ?? []).map(s => ({
    id:          s.school_code as string,
    name:        s.school_name as string,
    ppd_district: s.ppd_district as string | null,
    lat:         s.latitude as number,
    lng:         s.longitude as number,
  }))

  return NextResponse.json({ matches })
}
