import dynamic from 'next/dynamic'
import type { TrainerPoint } from './TrainerDots'
import type { PPDPoint } from './PPDPins'
import type { DistrictStatPoint, DistrictStatLabels } from './DistrictStatPins'
import type { FlyToTarget, FitBoundsTarget } from './MapInner'

type HeatPoint = [number, number]

interface MapCanvasProps {
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

const MapInnerDynamic = dynamic(
  () => import('./MapInner').then(m => m.MapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-surface">
        <div className="flex items-center gap-2 text-sm text-muted">
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Loading map…</span>
        </div>
      </div>
    ),
  }
)

export function MapCanvas(props: MapCanvasProps) {
  return <MapInnerDynamic {...props} />
}
