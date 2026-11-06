'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { MapCanvas } from '@/components/map/MapCanvas'
import { MapControls } from '@/components/map/MapControls'
import type { TrainerPoint } from '@/components/map/TrainerDots'
import type { PPDPoint } from '@/components/map/PPDPins'
import type { FlyToTarget, FitBoundsTarget } from '@/components/map/MapInner'
import type { VenueOption } from '@/components/venue/VenueAutocomplete'
import type { SentResult, SkippedResult } from '@/components/venue/EmailReviewModal'
import type { InvitedTrainerStatus } from '@/components/venue/RecommendationPanel'
import type { WorkshopLock } from '@/components/venue/VenueSearchPanel'
import type { EngagementSnapshot } from '@/lib/engagementSnapshot'
import { getTodayDateString } from '@/lib/dateValidation'
import { useLanguage } from '@/i18n/LanguageProvider'
import { districtColor } from '@/lib/districtColors'
import { canonicalizeDistrict } from '@/lib/districts'

const DRILL_ZOOM = 10

// Statewide default — same view every admin/state-officer sees, and where
// "Zoom out" always returns to regardless of the signed-in user's own district.
const SARAWAK_CENTER: [number, number] = [2.55, 113.8]
const SARAWAK_ZOOM = 7

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
  skills:              SkillSubject[]
  initialCenter:       [number, number]
  initialZoom:         number
  initialDistrictName: string | null
  // Existing workshop to reopen (Calendar → Invite), loaded server-side
  initialWorkshop?:       EngagementSnapshot | null
  // The URL named a workshop but it could not be opened (no access / gone)
  initialWorkshopFailed?: boolean
}

// Map zoom when opening straight at a reopened workshop's venue
const VENUE_ZOOM = 11

// Whether a reopened workshop can still take invitations
function workshopIsOpen(w: EngagementSnapshot): boolean {
  const e = w.engagement
  return (e.workflow_status === 'Draft' || e.workflow_status === 'Pending Invite')
    && !!e.start_date && e.start_date >= getTodayDateString()
    && w.confirmed_count < w.trainers_needed
}

type HeatPoint = [number, number]

export function DashboardMap({
  skills, initialCenter, initialZoom, initialDistrictName, initialWorkshop = null, initialWorkshopFailed = false,
}: DashboardMapProps) {
  const ws = initialWorkshop?.engagement ?? null
  const venueStart: [number, number] | null =
    ws && ws.venue_lat != null && ws.venue_long != null ? [ws.venue_lat, ws.venue_long] : null
  // The map opens AT the reopened workshop's venue (no statewide fly-in)
  const mapStartCenter = venueStart ?? initialCenter
  const mapStartZoom   = venueStart ? VENUE_ZOOM : initialZoom
  const openedFromCalendar = !!initialWorkshop || initialWorkshopFailed
  const { t } = useLanguage()
  const router = useRouter()

  // A district-defaulted user (initialZoom === DRILL_ZOOM) starts already "drilled
  // down" into their own PPD — same centre/label a click on that PPD pin would set,
  // so Mode A behaves identically for admin and non-admin, just with a different
  // starting point. Admins/state officers get initialZoom = statewide, so this is null.
  const startsDrilledDown = initialZoom >= DRILL_ZOOM

  // ── Shared state ──────────────────────────────────────────────
  const [appMode, setAppMode]         = useState<'A' | 'B'>(openedFromCalendar ? 'B' : 'A')
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>(ws?.target_item_ids ?? [])
  const [centre, setCentre]           = useState<[number, number] | null>(
    venueStart ?? (startsDrilledDown && !openedFromCalendar ? initialCenter : null),
  )
  const [radiusKm, setRadiusKm]       = useState(ws?.search_radius_km ? Number(ws.search_radius_km) : 50)
  const [dropPinMode, setDropPinMode] = useState(false)
  const [mapZoom, setMapZoom]         = useState(mapStartZoom)
  // "My location" result: the exact centre array it set (so any later centre
  // change ends it) + the reverse-geocoded place name once known
  const [myLocation, setMyLocation]   = useState<{ centre: [number, number]; place: string | null } | null>(null)
  const [loading, setLoading]         = useState(true)
  const [geoError, setGeoError]       = useState<string | null>(null)
  const geoErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Mode A state ──────────────────────────────────────────────
  const [heatPoints, setHeatPoints]   = useState<HeatPoint[]>([])
  const [pins, setPins]               = useState<TrainerPoint[]>([])
  const [ppds, setPPDs]               = useState<PPDPoint[]>([])
  const [selectedPPDName, setSelectedPPDName] = useState<string | null>(startsDrilledDown && !openedFromCalendar ? initialDistrictName : null)

  // ── Mode B state ──────────────────────────────────────────────
  const [venueSearch, setVenueSearch] = useState(ws?.venue_name ?? '')
  const [venueName, setVenueName]     = useState<string | null>(ws?.venue_name ?? null)
  const [flyToTarget, setFlyToTarget] = useState<FlyToTarget | null>(null)
  const flyKeyRef = useRef(0)
  const [fitBoundsTarget, setFitBoundsTarget] = useState<FitBoundsTarget | null>(null)
  const fitBoundsKeyRef = useRef(0)

  // ── Phase 4 state ─────────────────────────────────────────────
  const [startDate, setStartDate]     = useState(ws?.start_date ?? '')
  const [endDate, setEndDate]         = useState(ws?.end_date ?? '')
  const [isRecommending, setIsRecommending] = useState(false)
  const [recommendations, setRecommendations] = useState<TrainerPoint[]>([])
  const [engagementId, setEngagementId] = useState<string | null>(ws?.engagement_id ?? null)
  const [trainingTitle, setTrainingTitle] = useState(ws?.training_title ?? '')
  const [trainersNeeded, setTrainersNeeded] = useState(initialWorkshop?.trainers_needed ?? 1)
  // Set while staffing an existing workshop opened from the Calendar
  const [workshopLock, setWorkshopLock] = useState<WorkshopLock | null>(() =>
    initialWorkshop ? { loading: false, error: null, open: workshopIsOpen(initialWorkshop) }
    : initialWorkshopFailed ? { loading: false, error: t.booking.workshopLoadFailed, open: false }
    : null,
  )

  // ── Multi-trainer batch invite state ───────────────────────────
  const [invitedTrainers, setInvitedTrainers] = useState<InvitedTrainerStatus[]>(initialWorkshop?.trainers ?? [])
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate fetch-on-change, not a derived-state anti-pattern
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate fetch-on-change, not a derived-state anti-pattern
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

  // A workshop loaded server-side already has fresh statuses — skip the
  // first refetch for it
  const preloadedEngagementId = ws?.engagement_id ?? null
  const skipStatusFetchRef = useRef(!!initialWorkshop)
  useEffect(() => {
    if (skipStatusFetchRef.current && engagementId === preloadedEngagementId) {
      skipStatusFetchRef.current = false
      return
    }
    skipStatusFetchRef.current = false
    if (engagementId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate fetch-on-change, not a derived-state anti-pattern
      fetchEngagementStatus(engagementId)
    } else {
      setInvitedTrainers([])
    }
  }, [engagementId, fetchEngagementStatus, preloadedEngagementId])

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

  // Calendar → Invite: the workshop's saved criteria still apply, so show
  // its available trainers straight away (ONE search, same as pressing
  // Find). Changing the skills or radius afterwards waits for the Find
  // button — no automatic re-search (user decision 2026-11-06).
  const autoSearchDoneRef = useRef(false)
  useEffect(() => {
    if (autoSearchDoneRef.current || !initialWorkshop || !workshopIsOpen(initialWorkshop)) return
    autoSearchDoneRef.current = true
    void handleRecommend()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the workshop loaded with the page
  }, [])

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
    setWorkshopLock(null)
    setInvitedTrainers([])
    // Mode A restores the district-default centre (same as on initial mount);
    // Mode B always starts with no venue selected.
    setCentre(newMode === 'A' && startsDrilledDown ? initialCenter : null)
    setDropPinMode(false)
    setSelectedPPDName(newMode === 'A' && startsDrilledDown ? initialDistrictName : null)
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
    if (openedFromCalendar) router.replace('/dashboard')
  }, [startsDrilledDown, initialCenter, initialDistrictName, openedFromCalendar, router])

  // "Start a new search instead" — leave the reopened workshop, stay in Mode B
  const handleLeaveWorkshop = useCallback(() => handleSetAppMode('B'), [handleSetAppMode])

  const appModeRef = useRef(appMode)
  useEffect(() => { appModeRef.current = appMode }, [appMode])
  const workshopLockRef = useRef(workshopLock)
  useEffect(() => { workshopLockRef.current = workshopLock }, [workshopLock])

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

  const showGeoError = useCallback((message: string) => {
    if (geoErrorTimerRef.current) clearTimeout(geoErrorTimerRef.current)
    setGeoError(message)
    geoErrorTimerRef.current = setTimeout(() => setGeoError(null), 4000)
  }, [])

  useEffect(() => () => {
    if (geoErrorTimerRef.current) clearTimeout(geoErrorTimerRef.current)
  }, [])

  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) {
      showGeoError(t.map.locationUnavailable)
      return
    }
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      setGeoError(null)
      // A reopened workshop keeps its venue — just show where the user is
      if (appModeRef.current === 'B' && workshopLockRef.current) {
        flyKeyRef.current += 1
        setFlyToTarget({ lat, lng, zoom: 12, key: flyKeyRef.current })
        return
      }
      const here: [number, number] = [lat, lng]
      setCentre(here)
      setMyLocation({ centre: here, place: null })
      fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`)
        .then(r => r.json())
        .then((d: { place?: string | null }) => {
          setMyLocation(m => (m && m.centre === here ? { ...m, place: d.place ?? null } : m))
        })
        .catch(() => { /* label stays plain "You are here" */ })
      flyKeyRef.current += 1
      setFlyToTarget({ lat, lng, zoom: 12, key: flyKeyRef.current })
      if (appModeRef.current === 'B') {
        setVenueName(t.map.customLocation)
        setVenueSearch('')
      } else {
        setSelectedPPDName(null)
      }
    }, () => showGeoError(t.map.locationDenied))
  }, [t.map.customLocation, t.map.locationDenied, t.map.locationUnavailable, showGeoError])

  // Always returns to the true statewide view (not the caller's own district
  // default) — "Zoom out" means the same thing for every user, admin or not.
  const handleZoomOut = useCallback(() => {
    setCentre(null)
    setSelectedPPDName(null)
    flyKeyRef.current += 1
    setFlyToTarget({ lat: SARAWAK_CENTER[0], lng: SARAWAK_CENTER[1], zoom: SARAWAK_ZOOM, key: flyKeyRef.current })
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

  // Pin label shows only the venue name — geocoded venues carry the full
  // comma-separated address, which is too long for the map tooltip. The
  // full address stays visible in the venue chip in the search panel.
  const isMyLocation = myLocation !== null && centre === myLocation.centre
  const centreLabel = isMyLocation
    ? (myLocation.place ? `${t.map.youAreHere}: ${myLocation.place}` : t.map.youAreHere)
    : appMode === 'B'
      ? (venueName ? venueName.split(',')[0].trim() : null)
      : (selectedPPDName ? `PPD ${selectedPPDName}` : null)

  // A clicked PPD pin already marks the centre — don't stack the amber pin on it
  const hideCentrePin = appMode === 'A' && !!selectedPPDName && !isMyLocation

  // Mode A trainer pins take their PPD district's colour — the same fixed
  // palette as /talent, so a district looks the same on both screens.
  // Mode B ranked recommendation pins keep their own amber/teal colours.
  const trainerPinColor = useCallback(
    (p: TrainerPoint) => districtColor(p.ppd_district),
    [],
  )

  // Colour key for the zoomed-in Mode A view: every district present in
  // the shown pins, most trainers first.
  const districtKey = useMemo(() => {
    if (appMode !== 'A' || mapMode !== 'pins') return null
    const counts = new Map<string, number>()
    for (const p of pins) {
      const d = canonicalizeDistrict(p.ppd_district)
      if (d) counts.set(d, (counts.get(d) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([district, count]) => ({ district, count, color: districtColor(district) }))
  }, [appMode, mapMode, pins])

  return (
    <div className="absolute inset-0">
      <div data-tour="map" className="absolute inset-0">
        <MapCanvas
          mode={mapMode}
          appMode={appMode}
          heatPoints={heatPoints}
          pins={pins}
          ppds={ppds}
          initialCenter={mapStartCenter}
          initialZoom={mapStartZoom}
          centre={centre}
          radiusKm={radiusKm}
          ppdName={centreLabel}
          flyToTarget={flyToTarget}
          fitBoundsTarget={fitBoundsTarget}
          dropPinMode={dropPinMode}
          onDropPin={handleDropPin}
          onDrillDown={handleDrillDown}
          onZoomChange={setMapZoom}
          trainerPinColor={appMode === 'A' ? trainerPinColor : undefined}
          hideCentrePin={hideCentrePin}
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
          geoError={geoError}
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
          districtKey={districtKey}
          workshopLock={workshopLock}
          onLeaveWorkshop={workshopLock ? handleLeaveWorkshop : undefined}
        />
      </div>
    </div>
  )
}
