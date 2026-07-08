'use client'

import { useLanguage } from '@/i18n/LanguageProvider'
import { VenueSearchPanel } from '@/components/venue/VenueSearchPanel'
import { RecommendationPanel, type InvitedTrainerStatus } from '@/components/venue/RecommendationPanel'
import { EmailReviewModal, type SentResult, type SkippedResult } from '@/components/venue/EmailReviewModal'
import { SkillCheckboxFilter } from '@/components/map/SkillCheckboxFilter'
import type { VenueOption } from '@/components/venue/VenueAutocomplete'
import type { TrainerPoint } from '@/components/map/TrainerDots'

interface SkillSubject {
  item_id: number
  type:    string
  name_en: string
  name_bm: string
}
interface MapControlsProps {
  // Shared
  skills:           SkillSubject[]
  selectedItemIds:  number[]
  onSelectItems:    (ids: number[]) => void
  centre:          [number, number] | null
  radiusKm:        number
  onRadiusChange:  (km: number) => void
  dropPinMode:     boolean
  onToggleDropPin: () => void
  onClearCentre:   () => void
  onGeolocate:     () => void
  trainersCount:   number
  loading:         boolean
  // Mode A
  mode:            'heatmap' | 'pins'
  onZoomOut:       () => void
  // Mode A/B toggle
  appMode:         'A' | 'B'
  onSetAppMode:    (m: 'A' | 'B') => void
  // Mode B venue panel
  venueSearch:     string
  onVenueSearch:   (v: string) => void
  onVenueSelect:   (opt: VenueOption) => void
  venueName:       string | null
  onClearVenue:    () => void
  // Phase 4 — dates + recommend
  startDate:       string
  onStartDateChange:(d: string) => void
  endDate:         string
  onEndDateChange: (d: string) => void
  onRecommend:     () => void
  isRecommending:  boolean
  recommendations: TrainerPoint[]
  engagementId:    string | null
  trainingTitle:          string
  onTrainingTitleChange:  (v: string) => void
  trainersNeeded:         number
  onTrainersNeededChange: (n: number) => void
  // Multi-trainer batch invite
  selectedTrainerIds:    Set<string>
  onToggleSelectTrainer: (trainerId: string) => void
  invitedTrainers:       InvitedTrainerStatus[]
  onRefreshStatus:       () => void
  isRefreshingStatus:    boolean
  reviewModalOpen:       boolean
  onOpenReview:          () => void
  onCloseReview:         () => void
  onInviteSent:          (results: { sent: SentResult[]; skipped: SkippedResult[] }) => void
}

function LocationIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  )
}

function PinIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-4 w-4" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  )
}

export function MapControls({
  skills,
  selectedItemIds,
  onSelectItems,
  centre,
  radiusKm,
  onRadiusChange,
  dropPinMode,
  onToggleDropPin,
  onClearCentre,
  onGeolocate,
  trainersCount,
  loading,
  mode,
  onZoomOut,
  appMode,
  onSetAppMode,
  venueSearch,
  onVenueSearch,
  onVenueSelect,
  venueName,
  onClearVenue,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  onRecommend,
  isRecommending,
  recommendations,
  engagementId,
  trainingTitle,
  onTrainingTitleChange,
  trainersNeeded,
  onTrainersNeededChange,
  selectedTrainerIds,
  onToggleSelectTrainer,
  invitedTrainers,
  onRefreshStatus,
  isRefreshingStatus,
  reviewModalOpen,
  onOpenReview,
  onCloseReview,
  onInviteSent,
}: MapControlsProps) {
  const { t } = useLanguage()

  return (
    <>
      {/* ── Mode A / B segmented toggle — top-centre ── */}
      <div className="pointer-events-auto absolute left-1/2 top-4 z-[1000] -translate-x-1/2">
        <div className="flex rounded-full border border-white/60 bg-white/90 p-0.5 shadow-float backdrop-blur-md">
          <button
            onClick={() => onSetAppMode('A')}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              appMode === 'A'
                ? 'bg-ink-navy text-white shadow-sm'
                : 'text-muted hover:text-slate'
            }`}
            aria-pressed={appMode === 'A'}
          >
            {t.map.modeALabel}
          </button>
          <button
            onClick={() => onSetAppMode('B')}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              appMode === 'B'
                ? 'bg-royal-blue text-white shadow-sm'
                : 'text-muted hover:text-slate'
            }`}
            aria-pressed={appMode === 'B'}
          >
            {t.map.modeBLabel}
          </button>
        </div>
      </div>

      {/* ── Top-left ── */}
      <div className="pointer-events-auto absolute left-4 top-4 z-[1000]">
        {appMode === 'A' ? (
          <div className="rounded-xl bg-white/90 shadow-float backdrop-blur-md border border-white/60 p-2 w-56">
            <SkillCheckboxFilter
              skills={skills}
              selectedIds={selectedItemIds}
              onChange={onSelectItems}
            />
          </div>
        ) : (
          <VenueSearchPanel
            skills={skills}
            selectedItemIds={selectedItemIds}
            onSelectItems={onSelectItems}
            venueSearch={venueSearch}
            onVenueSearch={onVenueSearch}
            onVenueSelect={onVenueSelect}
            dropPinMode={dropPinMode}
            onToggleDropPin={onToggleDropPin}
            venueName={venueName}
            onClearVenue={onClearVenue}
            startDate={startDate}
            onStartDateChange={onStartDateChange}
            endDate={endDate}
            onEndDateChange={onEndDateChange}
            onRecommend={onRecommend}
            isRecommending={isRecommending}
            trainingTitle={trainingTitle}
            onTrainingTitleChange={onTrainingTitleChange}
            trainersNeeded={trainersNeeded}
            onTrainersNeededChange={onTrainersNeededChange}
          />
        )}
      </div>

      {/* ── Top-right: view indicator + geolocate ── */}
      <div className="pointer-events-auto absolute right-4 top-4 z-[1000] flex flex-col gap-2">
        {appMode === 'A' ? (
          mode === 'heatmap' ? (
            <div className="flex items-center gap-1.5 rounded-full bg-ink-navy/85 px-3 py-1.5 text-xs font-medium text-white/90 shadow backdrop-blur-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-teal" />
              {t.map.distributionView}
            </div>
          ) : (
            <button
              onClick={onZoomOut}
              className="flex items-center gap-1.5 rounded-full bg-royal-blue px-3 py-1.5 text-xs font-medium text-white shadow transition-colors hover:bg-ink-navy"
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6" />
              </svg>
              {t.map.zoomOutOverview}
            </button>
          )
        ) : (
          <div className="flex items-center gap-1.5 rounded-full bg-royal-blue/90 px-3 py-1.5 text-xs font-medium text-white shadow backdrop-blur-sm">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
            </svg>
            {t.map.modeBLabel}
          </div>
        )}

        <button
          onClick={onGeolocate}
          title={t.map.useMyLocation}
          aria-label={t.map.useMyLocation}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/60 bg-white/90 text-muted shadow-float backdrop-blur-md transition-colors hover:border-royal-blue hover:text-royal-blue"
        >
          <LocationIcon />
        </button>
      </div>

      {/* ── Recommendation panel — right side, Mode B only ── */}
      {appMode === 'B' && (recommendations.length > 0 || invitedTrainers.length > 0) && (
        <RecommendationPanel
          candidates={recommendations}
          engagementId={engagementId}
          selectedIds={selectedTrainerIds}
          onToggleSelect={onToggleSelectTrainer}
          invitedTrainers={invitedTrainers}
          onRefreshStatus={onRefreshStatus}
          isRefreshingStatus={isRefreshingStatus}
          onOpenReview={onOpenReview}
          trainersNeeded={trainersNeeded}
        />
      )}

      {engagementId && (
        <EmailReviewModal
          open={reviewModalOpen}
          onClose={onCloseReview}
          engagementId={engagementId}
          selectedTrainers={recommendations
            .filter(c => selectedTrainerIds.has(c.trainer_id))
            .map(c => ({ trainer_id: c.trainer_id, trainer_name: c.trainer_name }))}
          onSent={onInviteSent}
        />
      )}

      {/* ── Bottom-left: trainer count (+ drop-pin in Mode A) ── */}
      <div className="pointer-events-auto absolute bottom-8 left-4 z-[1000] flex flex-col items-start gap-1.5">
        <div className="flex items-end gap-2">
          <div className="flex items-center gap-2 rounded-full bg-ink-navy/90 px-3 py-1.5 text-xs font-medium text-white shadow backdrop-blur-sm">
            {loading || isRecommending ? (
              <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <span className="font-mono font-semibold text-teal">{trainersCount}</span>
            )}
            <span>{t.map.trainersFound}</span>
          </div>

          {appMode === 'A' && (
            <button
              onClick={onToggleDropPin}
              title={dropPinMode ? t.map.pinInstruction : t.map.dropPin}
              aria-label={dropPinMode ? t.map.pinInstruction : t.map.dropPin}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow backdrop-blur-sm transition-colors ${
                dropPinMode
                  ? 'bg-royal-blue text-white ring-2 ring-royal-blue ring-offset-1'
                  : 'border border-border bg-white/95 text-muted hover:text-royal-blue'
              }`}
            >
              <PinIcon active={dropPinMode} />
              <span>{dropPinMode ? t.map.pinInstruction : t.map.dropPin}</span>
            </button>
          )}
        </div>

        {appMode === 'A' && mode === 'heatmap' && !loading && (
          <p className="pl-1 text-[10px] text-white/55">{t.map.clickToExplore}</p>
        )}

        {appMode === 'B' && !centre && !loading && (
          <p className="pl-1 text-[10px] text-white/55">{t.map.venueNotSet}</p>
        )}
      </div>

      {/* ── Bottom-right: radius slider (when centre is set) ── */}
      {centre && (
        <div className="pointer-events-auto absolute bottom-8 right-4 z-[1000]">
          <div className="w-52 rounded-xl border border-white/60 bg-white/90 p-3 shadow-float backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate">{t.map.radiusLabel}</span>
              <div className="flex items-center gap-1">
                <span className="font-mono text-xs font-semibold text-royal-blue">{radiusKm}</span>
                <span className="text-xs text-muted">{t.map.kmUnit}</span>
              </div>
            </div>
            <input
              type="range"
              min={10}
              max={500}
              step={10}
              value={radiusKm}
              onChange={e => onRadiusChange(Number(e.target.value))}
              className="w-full cursor-pointer accent-royal-blue"
              aria-label={t.map.searchRadius}
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted">
              <span>10 {t.map.kmUnit}</span>
              <span>500 {t.map.kmUnit}</span>
            </div>
            <button
              onClick={onClearCentre}
              className="mt-2 w-full rounded-lg border border-border bg-surface py-1 text-xs text-muted transition-colors hover:border-slate hover:text-slate"
            >
              {appMode === 'B' ? t.map.clearVenue : t.map.clearCentre}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
