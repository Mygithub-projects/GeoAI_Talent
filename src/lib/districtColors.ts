import { CANONICAL_PPD_DISTRICTS, canonicalizeDistrict } from '@/lib/districts'

// Phase 8A — one FIXED colour per canonical PPD district, used to tint
// trainer pins on the /talent zoomed-in view so trainers from different
// PPDs are tellable apart at a glance. Colour follows the entity: the
// assignment below never changes with filters or visible set.
//
// Palette validated 2026-07-12 with the dataviz six-checks script
// (light surface): lightness band, chroma floor, adjacent-pair CVD
// separation (worst ΔE 14.5 deutan), contrast ≥ 3:1 — all PASS. Hue
// families are interleaved so alphabetically-adjacent districts never
// share a family. Colour is never the only signal: the pin tooltip and
// popup name the district, and the on-screen legend maps colour → name.
const DISTRICT_PALETTE = [
  '#1E63C4', '#C2410C', '#15803D', '#A21CAF', '#A16207', '#4338CA',
  '#B91C1C', '#0D9488', '#DB2777', '#4D7C0F', '#0369A1', '#EA580C',
  '#6D28D9', '#166534', '#BE123C', '#0891B2', '#92400E', '#7C3AED',
  '#059669', '#9F1239', '#1D4ED8', '#B45309', '#86198F', '#3F6212',
  '#BE185D', '#65A30D', '#047857', '#DC2626', '#5B21B6', '#D97706',
] as const

// Unknown/junk district (e.g. the lone '-' trainer) → neutral slate.
export const DISTRICT_COLOR_FALLBACK = '#64748B'

const colorByDistrict: Record<string, string> = Object.fromEntries(
  CANONICAL_PPD_DISTRICTS.map((d, i) => [d, DISTRICT_PALETTE[i % DISTRICT_PALETTE.length]])
)

export function districtColor(raw: string | null | undefined): string {
  const canonical = canonicalizeDistrict(raw)
  return canonical ? colorByDistrict[canonical] ?? DISTRICT_COLOR_FALLBACK : DISTRICT_COLOR_FALLBACK
}
