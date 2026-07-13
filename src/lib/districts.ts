// Sentinel stored in profiles.ppd_district for a user who should default to a
// statewide map view (e.g. a state-level officer) rather than one PPD. Every
// active user can already read every district's data (migration 020) — this
// sentinel only picks the default camera position on login (dashboard/page.tsx),
// it does not gate row access.
export const STATEWIDE = 'STATEWIDE'

// Must match master_trainers.ppd_district exactly (used by fn_district_centroid
// to pick the default map view) — these are the real district values from the
// ingested dataset, not administrative PPD-office groupings.
export const PPD_DISTRICTS = [
  'BARAM', 'BAU', 'BELAGA', 'BETONG', 'BINTULU', 'DALAT', 'DARO', 'JULAU',
  'KANOWIT', 'KAPIT', 'KUCHING', 'LAWAS', 'LIMBANG', 'LUBOK ANTU', 'LUNDU',
  'MERADONG', 'MIRI', 'MUKAH', 'PADAWAN', 'SAMARAHAN', 'SARATOK', 'SARIKEI',
  'SELANGAU', 'SERIAN', 'SIBU', 'SIMUNJAN', 'SONG', 'SRI AMAN', 'SUBIS',
  'TATAU SEBAUH',
]

// The 30 real PPD districts. Migration 026 (2026-07-12) unified the two
// historical spellings of Tatau Sebauh ('TATAU/SEBAUH' and 'TATAU SEBAUH')
// to 'TATAU SEBAUH' across schools/master_trainers/profiles, so the raw
// data now matches the canonical list one-to-one. The junk '-' trainer
// value still exists — canonicalizeDistrict() keeps filtering it out.
export const CANONICAL_PPD_DISTRICTS = PPD_DISTRICTS

// Districts with fewer trainers than this are flagged as talent deserts
// (shared by /admin/analytics coverage and the Phase 8A /talent view).
export const DESERT_THRESHOLD = 5

// Maps a raw ppd_district value onto the canonical 30-district list;
// returns null for junk/unknown values so they never inflate coverage.
// The slash spelling is still mapped defensively in case a stray row
// (or an old audit payload) resurfaces it.
export function canonicalizeDistrict(raw: string | null | undefined): string | null {
  if (!raw) return null
  const d = raw.trim().toUpperCase()
  const canonical = d === 'TATAU/SEBAUH' ? 'TATAU SEBAUH' : d
  return CANONICAL_PPD_DISTRICTS.includes(canonical) ? canonical : null
}
