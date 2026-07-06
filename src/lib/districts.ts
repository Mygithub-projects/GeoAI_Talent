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
  'TATAU SEBAUH', 'TATAU/SEBAUH',
]
