'use client'

import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { HeatLayer } from './HeatLayer'
import { TrainerDots, type TrainerPoint } from './TrainerDots'

import { RadiusCircle } from './RadiusCircle'
import { DropPinHandler } from './DropPinHandler'
import { MapEventHandler } from './MapEventHandler'
import { PPDPins, type PPDPoint } from './PPDPins'
import { DistrictStatPins, type DistrictStatPoint, type DistrictStatLabels } from './DistrictStatPins'

const SARAWAK_CENTER: [number, number] = [2.55, 113.8]
const SARAWAK_ZOOM = 7

// Below this zoom: heatmap. At or above: individual pins.
export const DRILL_ZOOM = 10

type HeatPoint = [number, number]

export interface FlyToTarget {
  lat:  number
  lng:  number
  zoom: number
  key:  number
}

export interface FitBoundsTarget {
  bounds: [[number, number], [number, number]]  // [sw, ne] as [lat,lng] pairs
  key: number
}

interface MapInnerProps {
  mode:          'heatmap' | 'pins'
  appMode:       'A' | 'B'
  heatPoints:    HeatPoint[]
  pins:          TrainerPoint[]
  ppds:          PPDPoint[]
  initialCenter: [number, number]
  initialZoom:   number
  centre:        [number, number] | null
  radiusKm:      number
  dropPinMode:   boolean
  ppdName:       string | null
  flyToTarget:      FlyToTarget | null
  fitBoundsTarget?: FitBoundsTarget | null
  onDropPin:     (lat: number, lng: number) => void
  onDrillDown:   (lat: number, lng: number, name: string) => void
  onZoomChange:  (zoom: number) => void
  // Phase 8A (optional, additive) — talent-distribution extras
  districtStats?:      DistrictStatPoint[]
  districtStatLabels?: DistrictStatLabels
  onTrainerSelect?:    (trainerId: string) => void
  trainerPinColor?:    (t: TrainerPoint) => string
}

// Fits map to bounds when `key` changes — avoids re-firing on remount
function FitBoundsController({ target }: { target: FitBoundsTarget | null }) {
  const map     = useMap()
  const lastKey = useRef<number | null>(null)

  useEffect(() => {
    if (!target || target.key === lastKey.current) return
    lastKey.current = target.key
    map.fitBounds(target.bounds, { padding: [50, 50], animate: true, maxZoom: 12 })
  }, [target, map])

  return null
}

// Flies the map to target when `key` changes — avoids re-firing on remount
function FlyToController({ target }: { target: FlyToTarget | null }) {
  const map     = useMap()
  const lastKey = useRef<number | null>(null)

  useEffect(() => {
    if (!target || target.key === lastKey.current) return
    lastKey.current = target.key
    map.flyTo([target.lat, target.lng], target.zoom, { animate: true, duration: 0.9 })
  }, [target, map])

  return null
}

export function MapInner({
  mode,
  appMode,
  heatPoints = [],
  pins = [],
  ppds = [],
  initialCenter,
  initialZoom,
  centre,
  radiusKm,
  ppdName,
  flyToTarget,
  fitBoundsTarget,
  dropPinMode,
  onDropPin,
  onDrillDown,
  onZoomChange,
  districtStats,
  districtStatLabels,
  onTrainerSelect,
  trainerPinColor,
}: MapInnerProps) {
  // Mode B with no venue set yet: show the same statewide heatmap as Mode A
  // so the map isn't blank while the user is still choosing a venue.
  const showHeatmap = appMode === 'A' ? mode === 'heatmap' : !centre
  const showPins    = appMode === 'B' ? pins.length > 0 : mode === 'pins' && pins.length > 0
  const showPPDs    = appMode === 'A' && mode === 'heatmap' && ppds.length > 0
  // Phase 8A: district coverage badges replace the plain PPD pins when provided
  const showStats   = appMode === 'A' && mode === 'heatmap' && (districtStats?.length ?? 0) > 0

  return (
    <MapContainer
      center={initialCenter ?? SARAWAK_CENTER}
      zoom={initialZoom ?? SARAWAK_ZOOM}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
      className={dropPinMode ? 'cursor-crosshair' : (showHeatmap ? 'cursor-zoom-in' : '')}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={18}
      />

      <MapEventHandler onZoomChange={onZoomChange} />
      <FlyToController target={flyToTarget} />
      <FitBoundsController target={fitBoundsTarget ?? null} />

      {/* Mode A heatmap with PPD district navigation pins */}
      {showHeatmap && heatPoints.length > 0 && <HeatLayer points={heatPoints} />}
      {showPPDs && <PPDPins ppds={ppds} onSelect={onDrillDown} />}
      {showStats && districtStatLabels && (
        <DistrictStatPins stats={districtStats!} labels={districtStatLabels} onSelect={onDrillDown} />
      )}

      {/* Trainer pins — Mode A drill-down or Mode B venue search results */}
      {showPins && <TrainerDots trainers={pins} onSelect={onTrainerSelect} pinColor={trainerPinColor} />}

      {/* Amber venue/centre pin + dashed radius circle */}
      {centre && (
        <RadiusCircle centre={centre} radiusKm={radiusKm} ppdName={ppdName} />
      )}

      {dropPinMode && <DropPinHandler onPin={onDropPin} />}
    </MapContainer>
  )
}
