'use client'

import { Circle, Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'

interface RadiusCircleProps {
  centre:   [number, number]
  radiusKm: number
  ppdName?: string | null
}

// Amber drop-pin — larger and distinct from teal trainer pins
const pinIcon = typeof window !== 'undefined'
  ? L.divIcon({
      className: '',
      iconSize:   [36, 48],
      iconAnchor: [18, 48],
      html: `
        <div style="position:relative;width:36px;height:48px;filter:drop-shadow(0 3px 6px rgba(14,47,87,0.45))">
          <svg width="36" height="48" viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 0C8.059 0 0 8.059 0 18c0 13.5 18 30 18 30S36 31.5 36 18C36 8.059 27.941 0 18 0z"
                  fill="#F2A341" stroke="#0E2F57" stroke-width="1.5"/>
            <circle cx="18" cy="17" r="8" fill="white" opacity="0.95"/>
            <circle cx="18" cy="17" r="4" fill="#F2A341"/>
          </svg>
        </div>
      `,
    })
  : undefined

export function RadiusCircle({ centre, radiusKm, ppdName }: RadiusCircleProps) {
  return (
    <>
      {pinIcon && (
        <Marker position={centre} icon={pinIcon}>
          {ppdName && (
            <Tooltip direction="top" offset={[0, -52]} opacity={0.95}>
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#0E2F57',
                fontFamily: "'Inter', system-ui, sans-serif",
                whiteSpace: 'nowrap',
              }}>
                {ppdName}
              </span>
            </Tooltip>
          )}
        </Marker>
      )}
      <Circle
        center={centre}
        radius={radiusKm * 1000}
        pathOptions={{
          color:       '#1E63C4',
          fillColor:   '#1E63C4',
          fillOpacity: 0.08,
          weight:      2.5,
          dashArray:   '10 8',
        }}
      />
    </>
  )
}
