'use client'

import { useState } from 'react'
import { useLanguage } from '@/i18n/LanguageProvider'
import { VenueAutocomplete, type VenueOption } from '@/components/venue/VenueAutocomplete'
import type { TrainerPoint } from '@/components/map/TrainerDots'

// Phase 8A — admin-only workstation transfer. Three input methods,
// mirroring how workshop venues are set: registry school (autocomplete),
// geocoded place name (same autocomplete, geocode rows), or a pin
// dropped on the map (handled by TalentClient, which reopens this modal
// with the picked coordinates). Confirmation always shows old → new
// before anything is written; the API writes the audit_logs row.

export interface NewLocation {
  method:       'registry' | 'geocode' | 'pin'
  name:         string
  lat:          number
  lng:          number
  school_code?: string
}

interface Props {
  trainer:        TrainerPoint
  newLocation:    NewLocation | null
  onPickLocation: (loc: NewLocation) => void
  onStartPinDrop: () => void
  onCancel:       () => void
  onConfirm:      () => void
  busy:           boolean
  error:          string
}

export function TransferModal({
  trainer, newLocation, onPickLocation, onStartPinDrop, onCancel, onConfirm, busy, error,
}: Props) {
  const { t } = useLanguage()
  const tt = t.talent
  const [query, setQuery] = useState('')

  function handleSelect(opt: VenueOption) {
    onPickLocation({
      method:      opt.kind === 'registry' ? 'registry' : 'geocode',
      name:        opt.name,
      lat:         opt.lat,
      lng:         opt.lng,
      school_code: opt.kind === 'registry' ? opt.id : undefined,
    })
  }

  return (
    // pointer-events-auto is REQUIRED: this renders inside the page's
    // pointer-events-none overlay wrapper (see Appendix A trap).
    <div
      className="pointer-events-auto fixed inset-0 z-[3000] flex items-center justify-center bg-ink-navy/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={tt.transferTitle}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-modal">
        <h2 className="font-display text-base font-semibold text-slate">{tt.transferTitle}</h2>
        <p className="mt-1 text-xs leading-snug text-muted">
          {tt.transferIntro.replace('{name}', trainer.trainer_name ?? trainer.trainer_id)}
        </p>

        {/* Method: search (registry + geocode) or pin drop */}
        <div className="mt-4">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted">
            {tt.transferSearchLabel}
          </label>
          <VenueAutocomplete value={query} onChange={setQuery} onSelect={handleSelect} />
          <div className="my-2 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted">
            <span className="h-px flex-1 bg-border" aria-hidden /> {tt.transferOr} <span className="h-px flex-1 bg-border" aria-hidden />
          </div>
          <button
            onClick={onStartPinDrop}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-royal-blue hover:bg-surface transition-colors"
          >
            📍 {tt.transferPinBtn}
          </button>
        </div>

        {/* Old → new confirmation */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-surface p-2.5">
            <span className="block text-[9px] font-bold uppercase tracking-wide text-muted">{tt.currentLabel}</span>
            <p className="mt-0.5 text-[11px] leading-snug text-slate">
              {trainer.school_name ?? tt.noSchool}
            </p>
            <p className="text-[10px] text-muted">{trainer.ppd_district ?? '—'}</p>
            <p className="font-mono text-[10px] text-muted">{trainer.lat.toFixed(4)}, {trainer.lng.toFixed(4)}</p>
          </div>
          <div className={`rounded-lg border p-2.5 ${newLocation ? 'border-teal bg-teal/5' : 'border-dashed border-border'}`}>
            <span className="block text-[9px] font-bold uppercase tracking-wide text-teal">{tt.newLabel}</span>
            {newLocation ? (
              <>
                <p className="mt-0.5 text-[11px] leading-snug text-slate">{newLocation.name}</p>
                <p className="font-mono text-[10px] text-muted">{newLocation.lat.toFixed(4)}, {newLocation.lng.toFixed(4)}</p>
                <p className="mt-1 text-[9px] leading-snug text-muted">
                  {newLocation.method === 'registry' ? tt.districtChangeNote : tt.keepDistrictNote}
                </p>
              </>
            ) : (
              <p className="mt-0.5 text-[11px] text-muted">—</p>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 border border-red-200 px-2.5 py-1.5 text-[11px] text-red-700">
            {tt.transferFailed}: {error}
          </p>
        )}

        <p className="mt-3 text-[10px] italic text-muted">{tt.auditNote}</p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-border bg-white px-3.5 py-2 text-xs font-semibold text-slate hover:bg-surface transition-colors"
          >
            {tt.cancelBtn}
          </button>
          <button
            onClick={onConfirm}
            disabled={!newLocation || busy}
            className="rounded-lg bg-ink-navy px-3.5 py-2 text-xs font-bold text-white transition-opacity disabled:opacity-40 hover:opacity-90"
          >
            {busy ? tt.confirming : tt.confirmBtn}
          </button>
        </div>
      </div>
    </div>
  )
}
