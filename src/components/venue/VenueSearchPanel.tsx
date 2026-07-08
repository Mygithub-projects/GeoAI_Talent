'use client'

import { useLanguage } from '@/i18n/LanguageProvider'
import { VenueAutocomplete, type VenueOption } from './VenueAutocomplete'
import { SkillCheckboxFilter } from '@/components/map/SkillCheckboxFilter'

interface SkillSubject {
  item_id: number
  type:    string
  name_en: string
  name_bm: string
}

interface VenueSearchPanelProps {
  skills:           SkillSubject[]
  selectedItemIds:  number[]
  onSelectItems:    (ids: number[]) => void
  venueSearch:      string
  onVenueSearch:    (v: string) => void
  onVenueSelect:    (opt: VenueOption) => void
  dropPinMode:      boolean
  onToggleDropPin:  () => void
  venueName:        string | null
  onClearVenue:     () => void
  // Phase 4 date / recommend
  startDate:        string
  onStartDateChange:(d: string) => void
  endDate:          string
  onEndDateChange:  (d: string) => void
  onRecommend:      () => void
  isRecommending:   boolean
  // Multi-trainer workshop fields
  trainingTitle:          string
  onTrainingTitleChange:  (v: string) => void
  trainersNeeded:         number
  onTrainersNeededChange: (n: number) => void
}

export function VenueSearchPanel({
  skills,
  selectedItemIds,
  onSelectItems,
  venueSearch,
  onVenueSearch,
  onVenueSelect,
  dropPinMode,
  onToggleDropPin,
  venueName,
  onClearVenue,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  onRecommend,
  isRecommending,
  trainingTitle,
  onTrainingTitleChange,
  trainersNeeded,
  onTrainersNeededChange,
}: VenueSearchPanelProps) {
  const { t } = useLanguage()

  const canFind =
    !!venueName &&
    !!startDate &&
    !!endDate &&
    startDate <= endDate &&
    !isRecommending

  return (
    <div className="rounded-xl bg-white/90 shadow-float backdrop-blur-md border border-white/60 p-3 w-64 flex flex-col gap-3">

      {/* ── Venue ── */}
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
          {t.map.venueLabel}
        </p>

        {venueName ? (
          <div className="flex items-start gap-2 rounded-lg border border-teal/40 bg-teal/5 px-2.5 py-2">
            <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold leading-snug text-slate" title={venueName}>
                {venueName}
              </p>
            </div>
            <button
              onClick={onClearVenue}
              aria-label={t.map.clearVenue}
              className="shrink-0 text-muted transition-colors hover:text-slate"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <>
            <VenueAutocomplete
              value={venueSearch}
              onChange={onVenueSearch}
              onSelect={onVenueSelect}
            />
            <button
              onClick={onToggleDropPin}
              className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                dropPinMode
                  ? 'border-royal-blue bg-royal-blue text-white'
                  : 'border-border bg-surface text-muted hover:border-slate hover:text-slate'
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
              </svg>
              {dropPinMode ? t.map.pinInstruction : t.map.dropVenuePin}
            </button>
          </>
        )}
      </div>

      {/* ── Workshop title ── */}
      <div>
        <label className="mb-0.5 block text-[10px] text-muted">{t.map.trainingTitle}</label>
        <input
          type="text"
          value={trainingTitle}
          onChange={e => onTrainingTitleChange(e.target.value)}
          placeholder={t.map.trainingTitle}
          className="w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs text-slate focus:outline-none focus:ring-2 focus:ring-royal-blue"
        />
      </div>

      {/* ── Training dates + trainers needed ── */}
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
          Dates
        </p>
        <div className="flex flex-col gap-1.5">
          <div>
            <label className="mb-0.5 block text-[10px] text-muted">{t.map.startDate}</label>
            <input
              type="date"
              value={startDate}
              onChange={e => onStartDateChange(e.target.value)}
              className="w-full cursor-pointer rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs text-slate focus:outline-none focus:ring-2 focus:ring-royal-blue"
              aria-label={t.map.startDate}
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-muted">{t.map.endDate}</label>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={e => onEndDateChange(e.target.value)}
              className="w-full cursor-pointer rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs text-slate focus:outline-none focus:ring-2 focus:ring-royal-blue"
              aria-label={t.map.endDate}
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-muted">{t.map.trainersNeeded}</label>
            <input
              type="number"
              min={1}
              max={20}
              value={trainersNeeded}
              onChange={e => onTrainersNeededChange(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              className="w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs text-slate focus:outline-none focus:ring-2 focus:ring-royal-blue"
              aria-label={t.map.trainersNeeded}
            />
          </div>
        </div>
      </div>

      {/* ── Skill / subject filter ── */}
      <SkillCheckboxFilter
        skills={skills}
        selectedIds={selectedItemIds}
        onChange={onSelectItems}
      />

      {/* ── Find button ── */}
      {startDate && endDate ? (
        <button
          onClick={onRecommend}
          disabled={!canFind}
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-colors ${
            canFind
              ? 'bg-royal-blue text-white hover:bg-ink-navy'
              : 'bg-surface text-muted cursor-not-allowed border border-border'
          }`}
        >
          {isRecommending ? (
            <>
              <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t.map.findingTrainers}
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              {t.map.findAvailableTrainers}
            </>
          )}
        </button>
      ) : (
        <p className="text-center text-[10px] text-muted">{t.map.setDatesToSearch}</p>
      )}
    </div>
  )
}
