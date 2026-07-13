'use client'

import { Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'

// Phase 8A — per-district coverage dots for the Talent Distribution
// view ("traffic-light" design, user decision 2026-07-12 — replaced the
// original numbered count badges). Each district is one colored dot;
// the trainer count and a plain-language status live in the hover
// tooltip. Classification is computed deterministically by TalentClient:
//   none   — 0 trainers for the current filter (needs coverage)
//   low    — under the desert threshold (very few)
//   normal — well covered
//   high   — highly concentrated (congestion)
// 'none' renders as a HOLLOW red ring — a shape cue on top of colour,
// so the most critical state never relies on colour alone.

export type DistrictCoverage = 'none' | 'low' | 'high' | 'normal'

export interface DistrictStatPoint {
  district: string          // canonical name, e.g. 'TATAU SEBAUH'
  count:    number
  coverage: DistrictCoverage
  lat:      number
  lng:      number
}

export interface DistrictStatLabels {
  none:     string
  low:      string
  high:     string
  normal:   string
  trainers: string
}

const DOT: Record<DistrictCoverage, { fill: string; border: string; size: number }> = {
  none:   { fill: '#FFFFFF', border: '#DC2626', size: 16 },  // hollow red ring
  low:    { fill: '#F59E0B', border: '#B45309', size: 16 },
  normal: { fill: '#16A34A', border: '#15803D', size: 16 },
  high:   { fill: '#0E2F57', border: '#0E2F57', size: 18 },
}

const iconCache = new Map<string, L.DivIcon>()

function getDotIcon(coverage: DistrictCoverage): L.DivIcon {
  if (!iconCache.has(coverage)) {
    const d = DOT[coverage]
    iconCache.set(
      coverage,
      L.divIcon({
        className: '',
        iconSize:   [d.size, d.size],
        iconAnchor: [d.size / 2, d.size / 2],
        tooltipAnchor: [0, -d.size / 2 - 2],
        html: `
          <div style="
            width:${d.size}px;height:${d.size}px;border-radius:50%;
            background:${d.fill};
            border:3px solid ${d.border};
            box-shadow:0 0 0 2px rgba(255,255,255,0.9), 0 2px 6px rgba(14,47,87,0.30);
          "></div>
        `,
      })
    )
  }
  return iconCache.get(coverage)!
}

interface DistrictStatPinsProps {
  stats:    DistrictStatPoint[]
  labels:   DistrictStatLabels
  onSelect: (lat: number, lng: number, district: string) => void
}

export function DistrictStatPins({ stats, labels, onSelect }: DistrictStatPinsProps) {
  return (
    <>
      {stats.map(s => (
        <Marker
          key={s.district}
          position={[s.lat, s.lng]}
          icon={getDotIcon(s.coverage)}
          eventHandlers={{ click: () => onSelect(s.lat, s.lng, s.district) }}
        >
          <Tooltip direction="top" opacity={0.97}>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#0E2F57' }}>{s.district}</span>
            <span style={{ display: 'block', fontSize: 11, color: '#334155' }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{s.count}</span> {labels.trainers}
            </span>
            <span style={{ display: 'block', fontSize: 10, color: '#64748B' }}>{labels[s.coverage]}</span>
          </Tooltip>
        </Marker>
      ))}
    </>
  )
}
