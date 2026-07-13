'use client'

import { useMemo, useState } from 'react'
import { Marker, Tooltip, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { useLanguage } from '@/i18n/LanguageProvider'
import { localizeSkillName } from './SkillCheckboxFilter'

export interface TravelOption {
  mode:         'Road' | 'Boat' | 'Flight'
  distance_km:  number
  duration_min: number
  cost_myr:     number
  cost_source:  string
  cost_note?:   string
}

export interface TrainerPoint {
  trainer_id:   string
  trainer_name: string
  school_name:  string | null
  ppd_district: string | null
  lat:          number
  lng:          number
  skills:       string[]
  subjects:     string[]
  roles:        string[]
  // Phase 4 — optional recommendation fields
  rank?:           number
  distance_km?:    number
  duration_min?:   number
  transport_mode?: 'Road' | 'Boat' | 'Flight'
  cost_myr?:       number
  cost_source?:    string
  cost_note?:      string
  travel_options?: TravelOption[]
}

// Cache icons by key string
const iconCache = new Map<string, L.DivIcon>()

function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0] ?? '')
    .join('')
    .toUpperCase()
}

// Default fill is brand teal; Phase 8A's talent view passes a
// per-district colour instead (see src/lib/districtColors.ts).
function getPinIcon(name: string, color = '#12B5AC'): L.DivIcon {
  const initials = getInitials(name)
  const key = `init:${initials}:${color}`
  if (!iconCache.has(key)) {
    iconCache.set(
      key,
      L.divIcon({
        className: '',
        iconSize:     [22, 30],
        iconAnchor:   [11, 30],
        tooltipAnchor:[0, -32],
        html: `
          <div style="position:relative;width:22px;height:30px;filter:drop-shadow(0 2px 3px rgba(14,47,87,0.30))">
            <svg width="22" height="30" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg">
              <path d="M11 0C4.925 0 0 4.925 0 11c0 8.25 11 19 11 19S22 19.25 22 11C22 4.925 17.075 0 11 0z"
                    fill="${color}" stroke="#0E2F57" stroke-width="1.2"/>
              <circle cx="11" cy="10.5" r="6" fill="white" opacity="0.92"/>
            </svg>
            <div style="
              position:absolute;top:4px;left:0;width:22px;
              text-align:center;font-size:7px;font-weight:800;
              color:${color};letter-spacing:0.3px;pointer-events:none;
              font-family:'Inter',system-ui,sans-serif;line-height:1
            ">${initials}</div>
          </div>
        `,
      })
    )
  }
  return iconCache.get(key)!
}

function getRankIcon(rank: number): L.DivIcon {
  const key = `rank:${rank}`
  if (!iconCache.has(key)) {
    const isTop3 = rank <= 3
    const fill   = isTop3 ? '#F2A341' : '#12B5AC'
    const stroke = isTop3 ? '#92400E' : '#0E2F57'
    const text   = isTop3 ? '#92400E' : '#0E2F57'
    iconCache.set(
      key,
      L.divIcon({
        className: '',
        iconSize:     [26, 34],
        iconAnchor:   [13, 34],
        tooltipAnchor:[0, -36],
        html: `
          <div style="position:relative;width:26px;height:34px;filter:drop-shadow(0 2px 4px rgba(14,47,87,0.35))">
            <svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
              <path d="M13 0C5.82 0 0 5.82 0 13c0 9.75 13 21 13 21S26 22.75 26 13C26 5.82 20.18 0 13 0z"
                    fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>
              <circle cx="13" cy="12" r="7.5" fill="white" opacity="0.92"/>
            </svg>
            <div style="
              position:absolute;top:4px;left:0;width:26px;
              text-align:center;font-size:9px;font-weight:800;
              color:${text};pointer-events:none;
              font-family:'Inter',system-ui,sans-serif;line-height:1
            ">${rank}</div>
          </div>
        `,
      })
    )
  }
  return iconCache.get(key)!
}

interface TrainerDotsProps {
  trainers: TrainerPoint[]
  // Phase 8A (optional, additive) — notify the page when a pin is clicked
  // (the popup still opens as before; this just mirrors the selection).
  onSelect?: (trainerId: string) => void
  // Phase 8A (optional, additive) — per-trainer pin colour (e.g. by PPD
  // district). Rank icons (Mode B recommendations) are unaffected.
  pinColor?: (t: TrainerPoint) => string
}

// Mounting every marker at once makes the zoom animation and the
// heatmap↔pins flip visibly stutter on large sets (the statewide /talent
// view holds ~1,000 trainers, each with a tooltip + full popup subtree).
// Above the cap, only markers inside the padded viewport are mounted;
// the rest mount as the map pans/zooms (moveend fires after both).
const VIEWPORT_CULL_THRESHOLD = 300
const VIEWPORT_PAD = 0.5

function useViewportCull(trainers: TrainerPoint[]): TrainerPoint[] {
  const map = useMap()
  const [viewEpoch, setViewEpoch] = useState(0)
  useMapEvents({ moveend: () => setViewEpoch(e => e + 1) })
  return useMemo(() => {
    if (trainers.length <= VIEWPORT_CULL_THRESHOLD) return trainers
    void viewEpoch  // re-cull whenever the view settles
    const bounds = map.getBounds().pad(VIEWPORT_PAD)
    return trainers.filter(t => bounds.contains(L.latLng(t.lat, t.lng)))
  }, [trainers, map, viewEpoch])
}

export function TrainerDots({ trainers, onSelect, pinColor }: TrainerDotsProps) {
  const { locale } = useLanguage()
  const culled = useViewportCull(trainers)

  const localize = (name: string) => localizeSkillName(name, locale)

  const markers = useMemo(() => {
    const seen = new Set<string>()
    return culled
      .filter(t => {
        if (t.trainer_name == null || seen.has(t.trainer_id)) return false
        seen.add(t.trainer_id)
        return true
      })
      .map(t => ({
        ...t,
        icon: t.rank != null ? getRankIcon(t.rank) : getPinIcon(t.trainer_name, pinColor?.(t)),
      }))
  }, [culled, pinColor])

  return (
    <>
      {markers.map(t => (
        <Marker
          key={t.trainer_id}
          position={[t.lat, t.lng]}
          icon={t.icon}
          eventHandlers={onSelect ? { click: () => onSelect(t.trainer_id) } : undefined}
        >
          {/* Quick hover preview */}
          <Tooltip direction="top" offset={[0, -32]} opacity={0.95}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0E2F57' }}>
              {t.trainer_name}
            </span>
          </Tooltip>

          {/* Full profile on click */}
          <Popup minWidth={240} maxWidth={300} closeButton={true}>
            <div style={{ fontFamily: "'Inter', system-ui, sans-serif", padding: '2px 0' }}>

              {/* Header */}
              <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: '#0E2F57', lineHeight: 1.3 }}>
                {t.trainer_name}
              </p>
              {t.school_name && (
                <p style={{ margin: '3px 0 0', fontSize: 11, color: '#1E63C4', lineHeight: 1.35 }}>
                  {t.school_name}
                </p>
              )}
              {t.ppd_district && (
                <p style={{ margin: '3px 0 0', fontSize: 10, color: '#475569', lineHeight: 1.35 }}>
                  <span style={{ fontWeight: 700, color: '#0E2F57' }}>PPD </span>
                  {t.ppd_district}
                </p>
              )}

              {/* Roles */}
              {t.roles.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    Role
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {t.roles.map(r => (
                      <span key={r} style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 7px',
                        borderRadius: 99, background: '#FEF3C7', color: '#92400E',
                        border: '1px solid #F59E0B',
                      }}>{r}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Skills */}
              {t.skills.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    Skills
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {t.skills.map(s => (
                      <span key={s} style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 7px',
                        borderRadius: 99, background: '#CCFBF1', color: '#0F766E',
                        border: '1px solid #14B8A6',
                      }}>{localize(s)}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Subjects */}
              {t.subjects.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    Subjects
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {t.subjects.map(s => (
                      <span key={s} style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 7px',
                        borderRadius: 99, background: '#DBEAFE', color: '#1E40AF',
                        border: '1px solid #3B82F6',
                      }}>{localize(s)}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Phase 4: travel budget */}
              {t.distance_km != null && (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
                  <p style={{ margin: '0 0 5px', fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    Travel estimate
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
                    {/* Distance */}
                    <span style={{ fontSize: 10, color: '#475569' }}>
                      <span style={{ fontWeight: 700, color: '#0E2F57' }}>{t.distance_km.toFixed(1)} km</span>
                      {t.transport_mode && (
                        <span style={{
                          marginLeft: 5, fontSize: 9, fontWeight: 700, padding: '1px 5px',
                          borderRadius: 99,
                          background: t.transport_mode === 'Road' ? '#DCFCE7' : t.transport_mode === 'Flight' ? '#EDE9FE' : '#FFF7ED',
                          color: t.transport_mode === 'Road' ? '#166534' : t.transport_mode === 'Flight' ? '#5B21B6' : '#9A3412',
                        }}>{t.transport_mode}</span>
                      )}
                    </span>
                    {/* Duration */}
                    {(t.duration_min ?? 0) > 0 && (
                      <span style={{ fontSize: 10, color: '#475569' }}>
                        {t.duration_min! >= 60
                          ? `${Math.floor(t.duration_min! / 60)}h ${t.duration_min! % 60}m`
                          : `${t.duration_min}m`}
                      </span>
                    )}
                  </div>
                  {/* Cost */}
                  {t.cost_myr != null && (
                    <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: t.rank != null && t.rank <= 3 ? '#92400E' : '#0E2F57' }}>
                        RM {t.cost_myr.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {t.cost_source === 'llm' && (
                        <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 99, background: '#FEF3C7', color: '#92400E', border: '1px solid #F59E0B' }}>
                          Est.
                        </span>
                      )}
                      {t.cost_source === 'estimate' && (
                        <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 99, background: '#F1F5F9', color: '#64748B', border: '1px solid #CBD5E1' }}>
                          ~Road est.
                        </span>
                      )}
                    </div>
                  )}
                  {/* Alternatives */}
                  {(t.travel_options ?? []).filter(o => o.mode !== t.transport_mode).map(alt => (
                    <div key={alt.mode} style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99,
                        background: alt.mode === 'Flight' ? '#EDE9FE' : alt.mode === 'Boat' ? '#FFF7ED' : '#DCFCE7',
                        color: alt.mode === 'Flight' ? '#5B21B6' : alt.mode === 'Boat' ? '#9A3412' : '#166534',
                      }}>
                        {alt.mode === 'Flight' ? '✈ Alt' : alt.mode === 'Boat' ? '⛵ Alt' : '🚗 Alt'}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#475569' }}>
                        RM {alt.cost_myr.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {(alt.cost_source === 'llm' || alt.cost_source === 'estimate') && (
                        <span style={{ fontSize: 8, color: '#94A3B8' }}>est.</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Disclaimer — shown whenever any cost data is present */}
              {t.distance_km != null && (
                <p style={{ margin: '8px 0 0', fontSize: 8, color: '#94A3B8', fontStyle: 'italic', lineHeight: 1.5 }}>
                  Estimates for planning reference only. Verify actual costs before committing.
                </p>
              )}

            </div>
          </Popup>
        </Marker>
      ))}
    </>
  )
}
