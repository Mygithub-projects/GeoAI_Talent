'use client'

import { useState } from 'react'
import { useLanguage } from '@/i18n/LanguageProvider'

export interface DistrictKeyRow {
  district: string
  count:    number
  color:    string
}

// Dashboard map key for the zoomed-in view: the navy PPD pin,
// then every district present in the shown trainer pins with its fixed
// colour (src/lib/districtColors.ts) and trainer count. Collapsible so it
// never hides the map for long.
export function DistrictColorKey({ rows }: { rows: DistrictKeyRow[] }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(true)

  return (
    <div className="w-52 rounded-xl border border-white/60 bg-white/90 p-3 shadow-float backdrop-blur-md">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-xs font-medium text-slate"
      >
        <span>{t.map.keyTitle}</span>
        <span className="text-[10px] text-muted">{open ? t.map.keyHide : t.map.keyShow}</span>
      </button>

      {open && (
        <>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate">
            <svg width="11" height="15" viewBox="0 0 26 36" className="shrink-0" aria-hidden>
              <path d="M13 1C6.37 1 1 6.37 1 13c0 9.1 12 21.5 12 21.5S25 22.1 25 13C25 6.37 19.63 1 13 1z"
                    fill="#0E2F57" stroke="white" strokeWidth="2"/>
              <circle cx="13" cy="12.5" r="6.5" fill="white"/>
              <circle cx="13" cy="12.5" r="3"   fill="#0E2F57"/>
            </svg>
            {t.map.keyPpd}
          </div>

          {rows.length > 0 && (
            <>
              <p className="mb-1 mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {t.map.keyTrainerDistrict}
              </p>
              <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                {rows.map(row => (
                  <li key={row.district} className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-slate">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white shadow-sm"
                        style={{ background: row.color }}
                        aria-hidden
                      />
                      {row.district}
                    </span>
                    <span className="font-mono text-ink-navy">{row.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}
