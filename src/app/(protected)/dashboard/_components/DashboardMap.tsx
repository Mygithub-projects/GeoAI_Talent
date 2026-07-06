'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { MapCanvas } from '@/components/map/MapCanvas'
import { MapControls } from '@/components/map/MapControls'
import type { TrainerPoint } from '@/components/map/TrainerDots'
import type { PPDPoint } from '@/components/map/PPDPins'
import type { FlyToTarget, FitBoundsTarget } from '@/components/map/MapInner'
import type { VenueOption } from '@/components/venue/VenueAutocomplete'
import type { SentResult, SkippedResult } from '@/components/venue/EmailReviewModal'
import type { InvitedTrainerStatus } from '@/components/venue/RecommendationPanel'
import { useLanguage } from '@/i18n/LanguageProvider'

const DRILL_ZOOM = 10

function computeBounds(
  pts: Array<{ lat: number; lng: number }>,
  extra?: [number, number] | null,
): [[number, number], [number, number]] | null {
  const lats = pts.map(p => p.lat)
  const lngs = pts.map(p => p.lng)
  if (extra) { lats.push(extra[0]); lngs.push(extra[1]) }
  if (lats.length === 0) return null
  return [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]
}

interface SkillSubject {
  item_id: number
  type:    string
  name_en: string
  name_bm: string
}

interface DashboardMapProps {
  skills:        SkillSubject[]
  initialCenter: [number, number]
  initialZoom:   number
}

type HeatPoint = [number, number]

export function DashboardMap({ skills, initialCenter, initialZoom }: DashboardMapProps) {
  const { t } = useLanguage()

  // ── Shared state ──────────────────────────────────────────────
  const [appMode, setAppMode]         = useState<'A' | 'B'>('A')
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([])
  const [centre, setCentre]           = useState<[number, number] | null>(null)
  const [radiusKm, setRadiusKm]       = useState(50)
  const [dropPinMode, setDropPinMode] = useState(false)
  const [mapZoom, setMapZoom]         = useState(initialZoom)
  const [loading, setLoading]         = useState(true)

  // ── Mode A state ──────────────────────────────────────────────
  const [heatPoints, setHeatPoints]   = useState<HeatPoint[]>([])
  const [pins, setPins]               = useState<TrainerPoint[]>([])
  const [ppds, setPPDs]               = useState<PPDPoint[]>([])
  const [selectedPPDName, setSelectedPPDName] = useState<string | null>(null)
  const [mapKey, setMapKey]           = useState(0)

  // ── Mode B state ──────────────────────────────────────────────
  const [venueSearch, setVenueSearch] = useState('')
  const [venueName, setVenueName]     = useState<string | null>(null)
  const [flyToTarget, setFlyToTarget] = useState<FlyToTarget | null>(null)
  const flyKeyRef = useRef(0)
  const [fitBoundsTarget, setFitBoundsTarget] = useState<FitBoundsTarget | null>(null)
  const fitBoundsKeyRef = useRef(0)

  // ── Phase 4 state ─────────────────────────────────────────────
  const [startDate, setStartDate]     = useState('')
  const [endDate, setEndDate]         = useState('')
  const [isRecommending, setIsRecommending] = useState(false)
  const [recommendations, setRecommendations] = useState<TrainerPoint[]>([])
  const [engagementId, setEngagementId] = useState<string | null>(null)
  const [trainingTitle, setTrainingTitle] = useState('')
  const [trainersNeeded, setTrainersNeeded] = useState(1)

  // ── Multi-trainer batch invite state ───────────────────────────
  const [invitedTrainers, setInvitedTrainers] = useState<InvitedTrainerStatus[]>([])
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false)
  const [selectedTrainerIds, setSelectedTrainerIds] = useState<Set<string>>(new Set())
  const [reviewModalOpen, setReviewModalOpen] = useState(false)

  const invitedTrainerIds = useMemo(
    () => new Set(invitedTrainers.map(t => t.trainer_id)),
    [invitedTrainers],
  )

  // Zoom-based mode (Mode A only)
  const mapMode: 'heatmap' | 'pins' = mapZoom >= DRILL_ZOOM ? 'pins' : 'heatmap'

  const abortRef = useRef<AbortController | null>(null)

  // ── PPD centroids — load once ─────────────────────────────────
  useEffect(() => {
    fetch('/api/districts')
      .then(r => r.json())
      .then(d => setPPDs(d.districts ?? []))
      .catch(err => console.error('[DashboardMap] districts error', err))
  }, [])

  // ── Fetch helpers ─────────────────────────────────────────────
  const fetchHeatmap = useCallback(async (
    itemIds: number[],
    c:       [number, number] | null,
    r:       number,
  ) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    try {
      const p = new URLSearchParams()
      for (const id of itemIds) p.append('item_id', String(id))
      if (c) {
        p.set('center_lat',  String(c[0]))
        p.set('center_long', String(c[1]))
        p.set('radius_km',   String(r))
      }
      const res = await fetch(`/api/trainers/heatmap?${p}`, { signal: abortRef.current.signal })
      if (!res.ok) throw new Error('heatmap fetch failed')
      const data = await res.json()
      setHeatPoints(data.points ?? [])
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('[DashboardMap] heatmap error', err)
      }
    } finally { setLoading(false) }
  }, [])

  const fetchPins = useCallback(async (
    itemIds: number[],
    c:       [number, number] | null,
    r:       number,
  ) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    try {
      const p = new URLSearchParams()
      for (const id of itemIds) p.append('item_id', String(id))
      if (c) {
        p.set('center_lat',  String(c[0]))
        p.set('center_long', String(c[1]))
        p.set('radius_km',   String(r))
      }
      const res = await fetch(`/api/trainers/pins?${p}`, { signal: abortRef.current.signal })
      if (!res.ok) throw new Error('pins fetch failed')
      const data = await res.json()
      setPins(data.pins ?? [])
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('[DashboardMap] pins error', err)
      }
    } finally { setLoading(false) }
  }, [])

  const fetchVenueTrainers = useCallback(async (
    itemIds: number[],
    c:       [number, number],
    r:       number,
  ) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    try {
      const res = await fetch('/api/engagements/search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_item_ids: itemIds.length > 0 ? itemIds : undefined,
          venue_lat:       c[0],
          venue_long:     c[1],
          radius_km:      r,
        }),
        signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error('venue search failed')
      const data = await res.json()
      const trainers = data.trainers ?? []
      setPins(trainers)
      // Fit map to show all trainers + venue whenever radius or filter changes.
      // Safe: zoom no longer triggers this function (mapMode excluded from Mode B effect deps).
      if (trainers.length > 0) {
        const b = computeBounds(trainers, c)
        if (b) { fitBoundsKeyRef.current += 1; setFitBoundsTarget({ bounds: b, key: fitBoundsKeyRef.current }) }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('[DashboardMap] venue search error', err)
      }
    } finally { setLoading(false) }
  }, [])

  // ── Mode A: re-fetch on zoom / filter / spatial change ──────────
  useEffect(() => {
    if (appMode !== 'A') return
    if (mapMode === 'heatmap') {
      fetchHeatmap(selectedItemIds, centre, radiusKm)
    } else {
      fetchPins(selectedItemIds, centre, radiusKm)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appMode, mapMode, selectedItemIds, centre, radiusKm])

  // ── Mode B: re-fetch venue trainers on filter / radius change ──
  // mapMode intentionally excluded — zoom must not trigger re-fetch or fitBounds
  // startDate/endDate intentionally excluded — date change must not clear recommendations
  // No venue set yet: show the statewide heatmap instead of a blank map.
  useEffect(() => {
    if (appMode !== 'B') return
    if (!centre) {
      setPins([])
      fetchHeatmap(selectedItemIds, null, radiusKm)
      return
    }
    setHeatPoints([])
    fetchVenueTrainers(selectedItemIds, centre, radiusKm)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appMode, selectedItemIds, centre, radiusKm])

  // ── Live trainer accept/decline status for the active engagement ──
  const fetchEngagementStatus = useCallback(async (engId: string) => {
    setIsRefreshingStatus(true)
    try {
      const res = await fetch(`/api/engagements/status?engagement_id=${encodeURIComponent(engId)}`)
      if (!res.ok) throw new Error('status fetch failed')
      const data = await res.json()
      setInvitedTrainers(data.trainers ?? [])
      if (typeof data.trainers_needed === 'number') setTrainersNeeded(data.trainers_needed)
    } catch (err) {
      console.error('[DashboardMap] status fetch error', err)
    } finally {
      setIsRefreshingStatus(false)
    }
  }, [])

  useEffect(() => {
    if (engagementId) {
      fetchEngagementStatus(engagementId)
    } else {
      setInvitedTrainers([])
    }
  }, [engagementId, fetchEngagementStatus])

  const handleRefreshStatus = useCallback(() => {
    if (engagementId) fetchEngagementStatus(engagementId)
  }, [engagementId, fetchEngagementStatus])

  // ── Phase 4: recommend (reuses engagementId across invite rounds) ──
  const handleRecommend = useCallback(async () => {
    if (!centre || !startDate || !endDate) return
    setIsRecommending(true)
    try {
      const res = await fetch('/api/engagements/recommend', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engagement_id:   engagementId ?? undefined,
          target_item_ids: selectedItemIds.length > 0 ? selectedItemIds : undefined,
          venue_lat:       centre[0],
          venue_long:     centre[1],
          venue_name:     venueName ?? undefined,
          start_date:     startDate,
          end_date:       endDate,
          radius_km:      radiusKm,
          training_title:  trainingTitle || undefined,
          trainers_needed: trainersNeeded,
        }),
      })
      if (!res.ok) throw new Error('recommend failed')
      const data = await res.json()
      const rawCandidates: TrainerPoint[] = data.candidates ?? []
      // Defensive: drop anyone already invited, in case the candidate list
      // hasn't been re-fetched since the last batch send.
      const candidates = rawCandidates.filter(c => !invitedTrainerIds.has(c.trainer_id))
      setPins(candidates)
      setRecommendations(candidates)
      setEngagementId(data.engagement_id ?? null)
      if (typeof data.trainers_needed === 'number') setTrainersNeeded(data.trainers_needed)
      if (candidates.length > 0 && centre) {
        const b = computeBounds(candidates, centre)
        if (b) { fitBoundsKeyRef.current += 1; setFitBoundsTarget({ bounds: b, key: fitBoundsKeyRef.current }) }
      }
    } catch (err) {
      console.error('[DashboardMap] recommend error', err)
    } finally {
      setIsRecommending(false)
    }
  }, [centre, selectedItemIds, startDate, endDate, radiusKm, venueName, engagementId, trainingTitle, trainersNeeded, invitedTrainerIds])

  // ── Multi-trainer batch invite ─────────────────────────────────
  const handleToggleSelectTrainer = useCallback((trainerId: string) => {
    setSelectedTrainerIds(prev => {
      const next = new Set(prev)
      if (next.has(trainerId)) next.delete(trainerId)
      else next.add(trainerId)
      return next
    })
  }, [])

  const handleOpenReview  = useCallback(() => setReviewModalOpen(true), [])
  const handleCloseReview = useCallback(() => setReviewModalOpen(false), [])

  const handleInviteSent = useCallback((results: { sent: SentResult[]; skipped: SkippedResult[] }) => {
    const sentIds = new Set(results.sent.map(r => r.trainer_id))
    if (sentIds.size === 0) return
    setSelectedTrainerIds(prev => {
      const next = new Set(prev)
      for (const id of sentIds) next.delete(id)
      return next
    })
    setRecommendations(prev => prev.filter(c => !sentIds.has(c.trainer_id)))
    setPins(prev => prev.filter(c => !sentIds.has(c.trainer_id)))
    // engagementId doesn't change across invite rounds, so the status
    // effect won't refire on its own — refetch explicitly to pick up
    // the real just-created rows.
    if (engagementId) fetchEngagementStatus(engagementId)
  }, [engagementId, fetchEngagementStatus])

  // ── Mode switch ───────────────────────────────────────────────
  const handleSetAppMode = useCallback((newMode: 'A' | 'B') => {
    setAppMode(newMode)
    setCentre(null)
    setDropPinMode(false)
    setSelectedPPDName(null)
    setVenueName(null)
    setVenueSearch('')
    setSelectedItemIds([])
    setPins([])
    setHeatPoints([])
    setFlyToTarget(null)
    setStartDate('')
    setEndDate('')
    setTrainingTitle('')
    setTrainersNeeded(1)
    setRecommendations([])
    setEngagementId(null)
    setSelectedTrainerIds(new Set())
    setReviewModalOpen(false)
  }, [])

  const appModeRef = useRef(appMode)
  useEffect(() => { appModeRef.current = appMode }, [appMode])

  // ── Mode A handlers ───────────────────────────────────────────
  const handleDropPin = useCallback((lat: number, lng: number) => {
    setCentre([lat, lng])
    setDropPinMode(false)
    if (appModeRef.current === 'B') {
      setVenueName(t.map.customLocation)
      setVenueSearch('')
      flyKeyRef.current += 1
      setFlyToTarget({ lat, lng, zoom: 12, key: flyKeyRef.current })
    } else {
      setSelectedPPDName(null)
    }
  }, [t.map.customLocation])

  const handleDrillDown = useCallback((lat: number, lng: number, name?: string) => {
    setCentre([lat, lng])
    setSelectedPPDName(name ?? null)
  }, [])

  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      setCentre([lat, lng])
      if (appModeRef.current === 'B') {
        setVenueName(t.map.customLocation)
        setVenueSearch('')
        flyKeyRef.current += 1
        setFlyToTarget({ lat, lng, zoom: 12, key: flyKeyRef.current })
      } else {
        setSelectedPPDName(null)
      }
    }, () => { /* geolocation denied */ })
  }, [t.map.customLocation])

  const handleZoomOut = useCallback(() => {
    setCentre(null)
    setSelectedPPDName(null)
    setMapKey(k => k + 1)
  }, [])

  // ── Mode B handlers ───────────────────────────────────────────
  const handleVenueSelect = useCallback((opt: VenueOption) => {
    setCentre([opt.lat, opt.lng])
    setVenueName(opt.name)
    setVenueSearch(opt.name)
    setDropPinMode(false)
    // Clear any previous recommendation results for the old venue
    setRecommendations([])
    setEngagementId(null)
    setSelectedTrainerIds(new Set())
    setReviewModalOpen(false)
    flyKeyRef.current += 1
    setFlyToTarget({ lat: opt.lat, lng: opt.lng, zoom: 12, key: flyKeyRef.current })
  }, [])

  const handleClearVenue = useCallback(() => {
    setCentre(null)
    setVenueName(null)
    setVenueSearch('')
    setDropPinMode(false)
    setPins([])
    setRecommendations([])
    setEngagementId(null)
    setSelectedTrainerIds(new Set())
    setReviewModalOpen(false)
  }, [])

  const handleClearCentre = useCallback(() => {
    if (appModeRef.current === 'B') {
      handleClearVenue()
    } else {
      setCentre(null)
      setSelectedPPDName(null)
    }
  }, [handleClearVenue])

  // ── Derived ───────────────────────────────────────────────────
  const trainersCount = appMode === 'B'
    ? (centre ? pins.length : heatPoints.length)
    : (mapMode === 'heatmap' ? heatPoints.length : pins.length)

  const centreLabel = appMode === 'B'
    ? venueName
    : (selectedPPDName ? `PPD ${selectedPPDName}` : null)

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0">
        <MapCanvas
          key={mapKey}
          mode={mapMode}
          appMode={appMode}
          heatPoints={heatPoints}
          pins={pins}
          ppds={ppds}
          initialCenter={initialCenter}
          initialZoom={initialZoom}
          centre={centre}
          radiusKm={radiusKm}
          ppdName={centreLabel}
          flyToTarget={flyToTarget}
          fitBoundsTarget={fitBoundsTarget}
          dropPinMode={dropPinMode}
          onDropPin={handleDropPin}
          onDrillDown={handleDrillDown}
          onZoomChange={setMapZoom}
        />
      </div>

      <div className="pointer-events-none absolute inset-0">
        <MapControls
          skills={skills}
          selectedItemIds={selectedItemIds}
          onSelectItems={setSelectedItemIds}
          centre={centre}
          radiusKm={radiusKm}
          onRadiusChange={setRadiusKm}
          dropPinMode={dropPinMode}
          onToggleDropPin={() => setDropPinMode(v => !v)}
          onClearCentre={handleClearCentre}
          onGeolocate={handleGeolocate}
          trainersCount={trainersCount}
          loading={loading}
          mode={mapMode}
          onZoomOut={handleZoomOut}
          appMode={appMode}
          onSetAppMode={handleSetAppMode}
          venueSearch={venueSearch}
          onVenueSearch={setVenueSearch}
          onVenueSelect={handleVenueSelect}
          venueName={venueName}
          onClearVenue={handleClearVenue}
          startDate={startDate}
          onStartDateChange={setStartDate}
          endDate={endDate}
          onEndDateChange={setEndDate}
          onRecommend={handleRecommend}
          isRecommending={isRecommending}
          recommendations={recommendations}
          engagementId={engagementId}
          trainingTitle={trainingTitle}
          onTrainingTitleChange={setTrainingTitle}
          trainersNeeded={trainersNeeded}
          onTrainersNeededChange={setTrainersNeeded}
          selectedTrainerIds={selectedTrainerIds}
          onToggleSelectTrainer={handleToggleSelectTrainer}
          invitedTrainers={invitedTrainers}
          onRefreshStatus={handleRefreshStatus}
          isRefreshingStatus={isRefreshingStatus}
          reviewModalOpen={reviewModalOpen}
          onOpenReview={handleOpenReview}
          onCloseReview={handleCloseReview}
          onInviteSent={handleInviteSent}
        />
      </div>
    </div>
  )
}
