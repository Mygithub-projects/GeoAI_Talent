'use client'

// Controlled EN/BM toggle for the standalone trainer-facing pages
// (/invitations/*, /feedback). Unlike the app's LanguageToggle it does
// NOT touch the global geo-talent-lang cookie or refresh the router —
// these pages render from a local locale seeded by the invitation's
// stored language, so a trainer (not an app user) never pollutes a
// coordinator's saved UI language. The trainer can still switch here.

type Locale = 'en' | 'bm'

export function PublicLanguageToggle({
  value,
  onChange,
}: {
  value: Locale
  onChange: (l: Locale) => void
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-border" role="group" aria-label="Language">
      {(['en', 'bm'] as const).map(l => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          aria-pressed={value === l}
          className={`px-3 py-1 text-xs font-bold transition-colors ${
            value === l ? 'bg-royal-blue text-white' : 'bg-white text-muted hover:text-slate'
          }`}
        >
          {l === 'en' ? 'EN' : 'BM'}
        </button>
      ))}
    </div>
  )
}
