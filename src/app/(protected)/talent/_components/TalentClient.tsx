'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '@/i18n/LanguageProvider'
import { MapCanvas } from '@/components/map/MapCanvas'
import type { FlyToTarget } from '@/components/map/MapInner'
import type { TrainerPoint } from '@/components/map/TrainerDots'
import type { DistrictStatPoint, DistrictCoverage } from '@/components/map/DistrictStatPins'
import { SkillCheckboxFilter, localizeSkillName } from '@/components/map/SkillCheckboxFilter'
import { CANONICAL_PPD_DISTRICTS, DESERT_THRESHOLD, canonicalizeDistrict } from '@/lib/districts'
import { districtColor } from '@/lib/districtColors'
import { TransferModal, type NewLocation } from './TransferModal'

// Matches MapInner.DRILL_ZOOM (kept as a local constant, same as
// DashboardMap — importing from the Leaflet module would defeat the
// ssr:false dynamic import).
const DRILL_ZOOM = 10

// Talent congestion: a district holds a disproportionate share of the
// filtered trainers — at least CONGESTION_FACTOR × the statewide mean
// (mean over all 30 canonical districts) AND at least CONGESTION_MIN
// trainers, so small filtered sets never flag noise. Deterministic;
// documented in the on-screen legend and GeoAI_Progress.md.
const CONGESTION_FACTOR = 2
const CONGESTION_MIN = 10

interface SkillSubject {
  item_id: number
  type:    string
  name_en: string
  name_bm: string
}

interface Centroid {
  district: string   // canonical (PPD prefix stripped)
  lat:      number
  lng:      number
}

interface Props {
  skills:        SkillSubject[]
  isAdmin:       boolean
  initialCenter: [number, number]
  initialZoom:   number
}

export function TalentClient({ skills, isAdmin, initialCenter, initialZoom }: Props) {
  const { t, locale } = useLanguage()
  const tt = t.talent

  // ── Filters ───────────────────────────────────────────────────
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([])
  const [districtFilter, setDistrictFilter]   = useState('')
  const [nameQuery, setNameQuery]             = useState('')
  const [centre, setCentre]                   = useState<[number, number] | null>(null)
  const [radiusKm, setRadiusKm]               = useState(50)
  const [dateFrom, setDateFrom]               = useState('')
  const [dateTo, setDateTo]                   = useState('')
  const [availability, setAvailability]       = useState<'all' | 'available' | 'engaged'>('all')

  // ── Map / data state ──────────────────────────────────────────
  const [pins, setPins]             = useState<TrainerPoint[]>([])
  // Fetched engaged-trainer IDs, keyed by the date range they belong to;
  // the ACTIVE set is derived below so clearing the dates never needs a
  // synchronous setState in an effect.
  const [engagedFetch, setEngagedFetch] = useState<{ key: string; ids: Set<string> } | null>(null)
  const [centroids, setCentroids]   = useState<Centroid[]>([])
  const [loading, setLoading]       = useState(true)
  const [mapZoom, setMapZoom]       = useState(initialZoom)
  const [flyToTarget, setFlyToTarget] = useState<FlyToTarget | null>(null)
  const flyKey = useRef(0)

  // 'centre' = next map click sets the radius centre;
  // 'transfer' = next map click sets the new workstation (admin)
  const [dropMode, setDropMode] = useState<'none' | 'centre' | 'transfer'>('none')

  // ── Selection + transfer state ────────────────────────────────
  const [selectedId, setSelectedId]       = useState<string | null>(null)
  const [selectedSnap, setSelectedSnap]   = useState<TrainerPoint | null>(null)
  const [transferOpen, setTransferOpen]   = useState(false)
  const [newLocation, setNewLocation]     = useState<NewLocation | null>(null)
  const [transferBusy, setTransferBusy]   = useState(false)
  const [transferError, setTransferError] = useState('')

  const mapMode: 'heatmap' | 'pins' = mapZoom >= DRILL_ZOOM ? 'pins' : 'heatmap'

  // ── Fetches ───────────────────────────────────────────────────
  // Promise-chain style: every setState lands in a .then/.catch callback,
  // never synchronously inside an effect (react-hooks/set-state-in-effect).
  // `loading` starts true and only flips after each fetch resolves, so
  // refetches keep showing the previous pins until fresh data lands.
  const fetchPins = useCallback(() => {
    const params = new URLSearchParams()
    selectedItemIds.forEach(id => params.append('item_id', String(id)))
    if (centre) {
      params.set('center_lat',  String(centre[0]))
      params.set('center_long', String(centre[1]))
      params.set('radius_km',   String(radiusKm))
    }
    return fetch(`/api/trainers/pins?${params.toString()}`)
      .then(res => res.json().then(body => { setPins(res.ok ? (body.pins ?? []) : []) }))
      .catch(() => setPins([]))
      .finally(() => setLoading(false))
  }, [selectedItemIds, centre, radiusKm])

  useEffect(() => { fetchPins() }, [fetchPins])

  useEffect(() => {
    fetch('/api/districts')
      .then(r => r.json())
      .then(body => {
        const rows = (body.districts ?? []) as { ppd_district: string; lat: number; lng: number }[]
        setCentroids(rows
          .map(d => ({
            district: canonicalizeDistrict(d.ppd_district.replace(/^PPD\s+/i, '')),
            lat: d.lat, lng: d.lng,
          }))
          .filter((d): d is Centroid => d.district != null))
      })
      .catch(() => setCentroids([]))
  }, [])

  const rangeKey = dateFrom && dateTo && dateFrom <= dateTo ? `${dateFrom}:${dateTo}` : null

  useEffect(() => {
    if (!rangeKey) return
    const [from, to] = rangeKey.split(':')
    let cancelled = false
    fetch(`/api/trainers/engaged?date_from=${from}&date_to=${to}`)
      .then(r => r.json())
      .then(body => { if (!cancelled) setEngagedFetch({ key: rangeKey, ids: new Set(body.engaged ?? []) }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [rangeKey])

  const engagedIds = rangeKey && engagedFetch?.key === rangeKey ? engagedFetch.ids : null

  // ── Derived sets ──────────────────────────────────────────────
  // Analysis set: skill/radius (server-side) + availability. District
  // and name are LOOKUP filters — they narrow what you see, but the
  // desert/congestion analysis stays statewide so "every other district
  // is empty" artefacts can't appear.
  const analysisPins = useMemo(() => {
    if (availability === 'all' || !engagedIds) return pins
    return pins.filter(p => availability === 'engaged'
      ? engagedIds.has(p.trainer_id)
      : !engagedIds.has(p.trainer_id))
  }, [pins, availability, engagedIds])

  const visiblePins = useMemo(() => {
    const needle = nameQuery.trim().toLowerCase()
    return analysisPins.filter(p => {
      if (districtFilter && canonicalizeDistrict(p.ppd_district) !== districtFilter) return false
      if (needle && !(
        (p.trainer_name ?? '').toLowerCase().includes(needle) ||
        p.trainer_id.toLowerCase().includes(needle)
      )) return false
      return true
    })
  }, [analysisPins, districtFilter, nameQuery])

  const heatPoints = useMemo(
    () => visiblePins.map(p => [p.lat, p.lng] as [number, number]),
    [visiblePins]
  )

  const districtStats = useMemo<DistrictStatPoint[]>(() => {
    const counts: Record<string, number> = {}
    for (const d of CANONICAL_PPD_DISTRICTS) counts[d] = 0
    for (const p of analysisPins) {
      const d = canonicalizeDistrict(p.ppd_district)
      if (d) counts[d] += 1
    }
    const mean = analysisPins.length / CANONICAL_PPD_DISTRICTS.length
    const congestionCutoff = Math.max(CONGESTION_MIN, CONGESTION_FACTOR * mean)
    return centroids.map(c => {
      const count = counts[c.district] ?? 0
      const coverage: DistrictCoverage =
        count === 0 ? 'none'
        : count < DESERT_THRESHOLD ? 'low'
        : count >= congestionCutoff ? 'high'
        : 'normal'
      return { district: c.district, count, coverage, lat: c.lat, lng: c.lng }
    })
  }, [analysisPins, centroids])

  const shownStats = useMemo(
    () => districtFilter ? districtStats.filter(s => s.district === districtFilter) : districtStats,
    [districtStats, districtFilter]
  )

  const coveredCount = useMemo(
    () => districtStats.filter(s => s.count > 0).length,
    [districtStats])

  // District → colour legend for the zoomed-in pins view: every district
  // present in the visible pins, with its fixed colour and count.
  const pinLegend = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of visiblePins) {
      const d = canonicalizeDistrict(p.ppd_district)
      if (d) counts.set(d, (counts.get(d) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([district, count]) => ({ district, count, color: districtColor(district) }))
  }, [visiblePins])

  const trainerPinColor = useCallback(
    (p: TrainerPoint) => districtColor(p.ppd_district),
    []
  )

  const selectedTrainer: TrainerPoint | null = useMemo(() => {
    if (!selectedId) return null
    return pins.find(p => p.trainer_id === selectedId) ?? selectedSnap
  }, [selectedId, pins, selectedSnap])

  // ── Handlers ──────────────────────────────────────────────────
  const flyTo = useCallback((lat: number, lng: number, zoom: number) => {
    flyKey.current += 1
    setFlyToTarget({ lat, lng, zoom, key: flyKey.current })
  }, [])

  const handleDrillDown = useCallback((lat: number, lng: number) => {
    flyTo(lat, lng, DRILL_ZOOM)
  }, [flyTo])

  const handleDropPin = useCallback((lat: number, lng: number) => {
    if (dropMode === 'transfer') {
      setNewLocation({ method: 'pin', name: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng })
      setDropMode('none')
      setTransferOpen(true)
    } else if (dropMode === 'centre') {
      setCentre([lat, lng])
      setDropMode('none')
    }
  }, [dropMode])

  const handleTrainerSelect = useCallback((trainerId: string) => {
    setSelectedId(trainerId)
    const p = pins.find(x => x.trainer_id === trainerId)
    if (p) setSelectedSnap(p)
  }, [pins])

  const handleDistrictFilter = useCallback((d: string) => {
    setDistrictFilter(d)
    if (d) {
      const c = centroids.find(x => x.district === d)
      if (c) flyTo(c.lat, c.lng, DRILL_ZOOM)
    }
  }, [centroids, flyTo])

  async function confirmTransfer() {
    if (!selectedTrainer || !newLocation) return
    setTransferBusy(true)
    setTransferError('')
    try {
      const res = await fetch('/api/admin/trainers/workstation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainer_id:  selectedTrainer.trainer_id,
          method:      newLocation.method,
          school_code: newLocation.school_code,
          place_name:  newLocation.name,
          lat:         newLocation.lat,
          lng:         newLocation.lng,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Failed')
      // Refresh the distribution immediately + move the panel snapshot
      setSelectedSnap(snap => snap ? {
        ...snap,
        lat:          body.trainer.workstation_lat,
        lng:          body.trainer.workstation_long,
        ppd_district: body.trainer.ppd_district,
        school_name:  body.trainer.school_name ?? (newLocation.method === 'registry' ? snap.school_name : null),
      } : snap)
      setTransferOpen(false)
      setNewLocation(null)
      flyTo(body.trainer.workstation_lat, body.trainer.workstation_long, DRILL_ZOOM + 1)
      await fetchPins()
    } catch (e) {
      setTransferError((e as Error).message)
    } finally {
      setTransferBusy(false)
    }
  }

  // ── Styles ────────────────────────────────────────────────────
  const panelCls  = 'glass pointer-events-auto rounded-xl shadow-float border border-border'
  const labelCls  = 'block text-[10px] font-bold uppercase tracking-wide text-muted mb-1'
  const inputCls  = 'w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs text-slate focus:outline-none focus:ring-2 focus:ring-royal-blue'

  const STAT_LABELS = {
    none: tt.legendNone, low: tt.legendLow, high: tt.legendHigh, normal: tt.legendNormal,
    trainers: tt.trainersShown.toLowerCase(),
  }
  const localize = (name: string) => localizeSkillName(name, locale)

  // Swatches mirror the map dots exactly ('none' is a hollow red ring —
  // shape cue, not colour-only)
  const legendRows: { key: DistrictCoverage; label: string; swatch: React.CSSProperties }[] = [
    { key: 'none',   label: tt.legendNone,   swatch: { background: '#FFFFFF', border: '3px solid #DC2626' } },
    { key: 'low',    label: tt.legendLow,    swatch: { background: '#F59E0B', border: '2px solid #B45309' } },
    { key: 'normal', label: tt.legendNormal, swatch: { background: '#16A34A', border: '2px solid #15803D' } },
    { key: 'high',   label: tt.legendHigh,   swatch: { background: '#0E2F57', border: '2px solid #0E2F57' } },
  ]

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0">
        <MapCanvas
          mode={mapMode}
          appMode="A"
          heatPoints={heatPoints}
          pins={visiblePins}
          ppds={[]}
          initialCenter={initialCenter}
          initialZoom={initialZoom}
          centre={centre}
          radiusKm={radiusKm}
          ppdName={null}
          flyToTarget={flyToTarget}
          dropPinMode={dropMode !== 'none'}
          onDropPin={handleDropPin}
          onDrillDown={handleDrillDown}
          onZoomChange={setMapZoom}
          districtStats={shownStats}
          districtStatLabels={STAT_LABELS}
          onTrainerSelect={handleTrainerSelect}
          trainerPinColor={trainerPinColor}
        />
      </div>

      {/* z-[1000] lifts the panels above Leaflet's internal panes (z 400–700),
          which compete globally because .leaflet-container creates no stacking
          context — same convention as MapControls on the dashboard. */}
      <div className="pointer-events-none absolute inset-0 z-[1000]">

        {/* ── Left: filter panel ─────────────────────────────── */}
        <div data-tour="talent-panel" className={`${panelCls} absolute left-4 top-4 bottom-4 w-72 overflow-y-auto p-4`}>
          <h1 className="font-display text-base font-semibold text-slate">{tt.title}</h1>
          <p className="mt-0.5 mb-3 text-[11px] leading-snug text-muted">{tt.subtitle}</p>

          {/* Selected trainer (moved here when the right insights panel was
              removed, 2026-07-13 — the profile + admin transfer entry point) */}
          {selectedTrainer && (
            <div className="mb-3 rounded-lg border border-teal/40 bg-teal/5 p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[9px] font-bold uppercase tracking-wide text-teal">{tt.trainerPanelTitle}</span>
                <button
                  onClick={() => { setSelectedId(null); setSelectedSnap(null) }}
                  className="text-[10px] font-bold text-muted hover:text-slate"
                  aria-label={tt.clearSelection}
                >✕</button>
              </div>
              <p className="mt-1 text-sm font-bold text-ink-navy leading-tight">{selectedTrainer.trainer_name}</p>
              <p className="mt-1 text-[11px] text-slate">
                <span className="font-bold">{tt.school}: </span>
                {selectedTrainer.school_name ?? <em className="text-muted">{tt.noSchool}</em>}
              </p>
              <p className="text-[11px] text-slate">
                <span className="font-bold">{tt.district}: </span>
                <span
                  className="mr-1 inline-block h-2 w-2 rounded-full border border-white shadow-sm align-baseline"
                  style={{ background: districtColor(selectedTrainer.ppd_district) }}
                  aria-hidden
                />
                {selectedTrainer.ppd_district ?? '—'}
              </p>
              <p className="text-[11px] text-slate">
                <span className="font-bold">{tt.coordinates}: </span>
                <span className="font-mono">{selectedTrainer.lat.toFixed(4)}, {selectedTrainer.lng.toFixed(4)}</span>
              </p>
              {selectedTrainer.roles.length > 0 && (
                <p className="mt-1 text-[11px] text-slate"><span className="font-bold">{tt.roles}: </span>{selectedTrainer.roles.join(', ')}</p>
              )}
              {selectedTrainer.skills.length > 0 && (
                <p className="text-[11px] text-slate"><span className="font-bold">{tt.skills}: </span>{selectedTrainer.skills.map(localize).join(', ')}</p>
              )}
              {selectedTrainer.subjects.length > 0 && (
                <p className="text-[11px] text-slate"><span className="font-bold">{tt.subjects}: </span>{selectedTrainer.subjects.map(localize).join(', ')}</p>
              )}
              {isAdmin && (
                dropMode === 'transfer' ? (
                  <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5">
                    <p className="text-[11px] text-amber-800">{tt.transferPinHint}</p>
                    <button
                      onClick={() => setDropMode('none')}
                      className="mt-1 text-[10px] font-bold text-royal-blue hover:underline"
                    >{tt.transferPinCancel}</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setNewLocation(null); setTransferError(''); setTransferOpen(true) }}
                    className="mt-2 w-full rounded-lg bg-ink-navy px-2.5 py-1.5 text-xs font-bold text-white hover:opacity-90 transition-opacity"
                  >
                    {tt.transferBtn}
                  </button>
                )
              )}
            </div>
          )}

          <div className="mb-3">
            <input
              type="text"
              value={nameQuery}
              onChange={e => setNameQuery(e.target.value)}
              placeholder={tt.searchPlaceholder}
              aria-label={tt.searchPlaceholder}
              className={inputCls}
            />
          </div>

          <div className="mb-3">
            <label className={labelCls} htmlFor="talent-district">{tt.district}</label>
            <select
              id="talent-district"
              value={districtFilter}
              onChange={e => handleDistrictFilter(e.target.value)}
              className={inputCls}
            >
              <option value="">{tt.allDistricts}</option>
              {CANONICAL_PPD_DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="mb-3">
            <SkillCheckboxFilter
              skills={skills}
              selectedIds={selectedItemIds}
              onChange={setSelectedItemIds}
            />
          </div>

          {/* Centre + radius */}
          <div className="mb-3">
            <span className={labelCls}>{tt.radiusTitle}</span>
            {centre ? (
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate">
                  <span className="font-mono">{radiusKm} km</span>
                  <button
                    onClick={() => { setCentre(null); setDropMode('none') }}
                    className="text-[10px] font-bold text-royal-blue hover:underline"
                  >
                    {tt.clearCentre}
                  </button>
                </div>
                <input
                  type="range" min={10} max={500} step={10}
                  value={radiusKm}
                  onChange={e => setRadiusKm(Number(e.target.value))}
                  className="w-full accent-[#1E63C4]"
                  aria-label={tt.radiusTitle}
                />
              </div>
            ) : dropMode === 'centre' ? (
              <p className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-800">
                {tt.dropCentreActive}
              </p>
            ) : (
              <button
                onClick={() => setDropMode('centre')}
                className="w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-semibold text-royal-blue hover:bg-surface transition-colors"
              >
                📍 {tt.dropCentre}
              </button>
            )}
          </div>

          {/* Date range + availability */}
          <div className="mb-3">
            <span className={labelCls}>{tt.dateFrom} / {tt.dateTo}</span>
            <div className="flex gap-1.5">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} aria-label={tt.dateFrom} />
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} aria-label={tt.dateTo} />
            </div>
            {engagedIds && (
              <select
                value={availability}
                onChange={e => setAvailability(e.target.value as typeof availability)}
                className={`${inputCls} mt-1.5`}
                aria-label={tt.availAll}
              >
                <option value="all">{tt.availAll}</option>
                <option value="available">{tt.availAvailable}</option>
                <option value="engaged">{tt.availEngaged}</option>
              </select>
            )}
          </div>

          {loading && <p className="text-[11px] text-muted">{tt.loading}</p>}
          {!loading && mapMode === 'heatmap' && (
            <p className="mb-3 text-[10px] leading-snug text-muted">{tt.zoomHint}</p>
          )}

          {/* Compact summary + legends (moved from the removed right panel,
              2026-07-13 — deserts/congestion detail lives on the map dots
              and their hover tooltips) */}
          {!loading && (
            <p className="mb-3 text-[11px] text-slate">
              <span className="font-mono font-bold text-ink-navy">{visiblePins.length}</span> {tt.trainersShown.toLowerCase()}
              {' · '}
              <span className="font-mono font-bold text-ink-navy">{coveredCount}/{CANONICAL_PPD_DISTRICTS.length}</span> {tt.districtsCovered.toLowerCase()}
            </p>
          )}

          <div className="mb-3">
            <span className={labelCls}>{tt.legendTitle}</span>
            <p className="mb-1.5 text-[10px] leading-snug text-muted">{tt.insightsHint}</p>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
              {legendRows.map(r => (
                <span key={r.key} className="flex items-center gap-1.5 text-[10px] text-slate">
                  <span className="inline-block h-3.5 w-3.5 rounded-full shrink-0" style={r.swatch} aria-hidden />
                  {r.label}
                </span>
              ))}
            </div>
          </div>

          {/* Pin colour legend — zoomed-in view: which PPD each pin colour means */}
          {mapMode === 'pins' && pinLegend.length > 0 && (
            <div>
              <span className={labelCls}>{tt.pinLegendTitle}</span>
              <ul className="max-h-40 overflow-y-auto space-y-0.5">
                {pinLegend.map(row => (
                  <li key={row.district}>
                    <button
                      onClick={() => handleDistrictFilter(districtFilter === row.district ? '' : row.district)}
                      className={`flex w-full items-center justify-between rounded px-1.5 py-0.5 text-left text-[11px] transition-colors ${districtFilter === row.district ? 'bg-surface font-bold' : 'hover:bg-surface'}`}
                    >
                      <span className="flex items-center gap-1.5 text-slate">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full shrink-0 border border-white shadow-sm"
                          style={{ background: row.color }}
                          aria-hidden
                        />
                        {row.district}
                      </span>
                      <span className="font-mono text-ink-navy">{row.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Transfer modal ─────────────────────────────────── */}
        {transferOpen && selectedTrainer && (
          <TransferModal
            trainer={selectedTrainer}
            newLocation={newLocation}
            onPickLocation={setNewLocation}
            onStartPinDrop={() => { setTransferOpen(false); setDropMode('transfer') }}
            onCancel={() => { setTransferOpen(false); setNewLocation(null); setTransferError('') }}
            onConfirm={confirmTransfer}
            busy={transferBusy}
            error={transferError}
          />
        )}
      </div>
    </div>
  )
}
