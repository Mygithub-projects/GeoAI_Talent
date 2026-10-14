'use client'

import { useMemo, useState } from 'react'
import { Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'

export interface PPDPoint {
  ppd_district: string
  lat:          number
  lng:          number
}

// PPD pins use the same teardrop shape as the trainer pins but in solid
// navy with a white outline and a white ring around a navy centre dot.
// Trainer pins take their district colour (src/lib/districtColors.ts) —
// navy is deliberately not in that palette, so the two never look alike.
// Pin size follows the zoom so ~30 pins don't pile up in the statewide
// view; the hover tooltip always carries the full district name.
interface PinSize { w: number; h: number }

// From zoom 10 trainer pins (22×30) share the map, so the PPD pin steps up
// to ~25% larger than them to stand out as the district marker.
function pinSizeForZoom(zoom: number): PinSize {
  if (zoom <= 7) return { w: 16, h: 22 }
  if (zoom <= 8) return { w: 20, h: 28 }
  if (zoom <= 9) return { w: 24, h: 33 }
  return { w: 28, h: 38 }
}

// One DivIcon per size — every PPD pin looks the same, only the tooltip differs
const iconCache = new Map<number, L.DivIcon>()

function getPPDIcon(size: PinSize): L.DivIcon {
  if (!iconCache.has(size.w)) {
    iconCache.set(
      size.w,
      L.divIcon({
        className:    '',
        iconSize:     [size.w, size.h],
        iconAnchor:   [size.w / 2, size.h],
        tooltipAnchor:[0, -(size.h + 2)],
        html: `
          <div style="width:${size.w}px;height:${size.h}px;filter:drop-shadow(0 2px 4px rgba(14,47,87,0.45))">
            <svg width="${size.w}" height="${size.h}" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg">
              <path d="M13 1C6.37 1 1 6.37 1 13c0 9.1 12 21.5 12 21.5S25 22.1 25 13C25 6.37 19.63 1 13 1z"
                    fill="#0E2F57" stroke="white" stroke-width="2"/>
              <circle cx="13" cy="12.5" r="6.5" fill="white"/>
              <circle cx="13" cy="12.5" r="3"   fill="#0E2F57"/>
            </svg>
          </div>
        `,
      })
    )
  }
  return iconCache.get(size.w)!
}

// Keeps the PPD pins above trainer pins that sit at the same spot
const PPD_Z_OFFSET = 1000

const FLY_TO_ZOOM = 12

// ── Nudging off trainer pins ─────────────────────────────────────
// A PPD pin marks the district's AVERAGE school position
// (fn_all_district_centroids), not a real office, so it can land on a
// trainer's school. When zoomed in, a PPD pin that would cover a trainer
// pin is shifted a few pixels to the nearest free spot; trainers never move.
// Boxes are in projected pixels at the current zoom (pan-independent).
const TRAINER_PIN = { w: 22, h: 30 }   // TrainerDots getPinIcon size
const NUDGE_GAP   = 3

interface Box { x0: number; x1: number; y0: number; y1: number }

// Pin anchored at its bottom-centre tip
function pinBox(x: number, y: number, w: number, h: number): Box {
  return { x0: x - w / 2, x1: x + w / 2, y0: y - h, y1: y }
}

function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 + NUDGE_GAP && b.x0 < a.x1 + NUDGE_GAP
      && a.y0 < b.y1 + NUDGE_GAP && b.y0 < a.y1 + NUDGE_GAP
}

// Candidate shifts, nearest first: rings of 8 directions, one pin-width apart
function nudgeCandidates(size: PinSize): Array<[number, number]> {
  const out: Array<[number, number]> = [[0, 0]]
  for (let ring = 1; ring <= 4; ring++) {
    const dx = ring * (size.w + NUDGE_GAP)
    const dy = ring * (size.h + NUDGE_GAP)
    out.push([dx, 0], [-dx, 0], [0, -dy], [0, dy], [dx, -dy], [-dx, -dy], [dx, dy], [-dx, dy])
  }
  return out
}

interface PPDPinsProps {
  ppds:     PPDPoint[]
  onSelect: (lat: number, lng: number, name: string) => void
  // Trainer pins currently on the map — PPD pins are nudged off them
  avoid?:   Array<{ lat: number; lng: number }>
}

export function PPDPins({ ppds, onSelect, avoid = [] }: PPDPinsProps) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  const size = pinSizeForZoom(zoom)

  // Display position per PPD — its true point unless that covers a trainer pin
  const placed = useMemo(() => {
    if (avoid.length === 0) return ppds.map(p => ({ ...p, at: L.latLng(p.lat, p.lng) }))

    const trainerBoxes = avoid.map(a => {
      const pt = map.project([a.lat, a.lng], zoom)
      return pinBox(pt.x, pt.y, TRAINER_PIN.w, TRAINER_PIN.h)
    })
    const candidates = nudgeCandidates(size)
    const reach = 5 * (size.h + TRAINER_PIN.h)

    return ppds.map(p => {
      const origin = map.project([p.lat, p.lng], zoom)
      const nearby = trainerBoxes.filter(b =>
        Math.abs(b.x0 - origin.x) < reach && Math.abs(b.y1 - origin.y) < reach)
      if (nearby.length === 0) return { ...p, at: L.latLng(p.lat, p.lng) }

      for (const [dx, dy] of candidates) {
        const box = pinBox(origin.x + dx, origin.y + dy, size.w, size.h)
        if (!nearby.some(b => overlaps(box, b))) {
          return { ...p, at: map.unproject([origin.x + dx, origin.y + dy], zoom) }
        }
      }
      return { ...p, at: L.latLng(p.lat, p.lng) }  // fully surrounded: leave it
    })
  }, [ppds, avoid, map, zoom, size])

  return (
    <>
      {placed.map(p => (
        <Marker
          key={p.ppd_district}
          position={p.at}
          icon={getPPDIcon(size)}
          zIndexOffset={PPD_Z_OFFSET}
          eventHandlers={{
            click() {
              onSelect(p.lat, p.lng, p.ppd_district)
              map.flyTo([p.lat, p.lng], FLY_TO_ZOOM, { animate: true, duration: 0.8 })
            },
          }}
        >
          <Tooltip direction="top" opacity={0.97}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0E2F57' }}>
              PPD {p.ppd_district}
            </span>
          </Tooltip>
        </Marker>
      ))}
    </>
  )
}
