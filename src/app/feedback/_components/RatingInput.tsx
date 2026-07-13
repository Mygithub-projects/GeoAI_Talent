'use client'

// Phase 9 — accessible 1-5 star rating widget for the public feedback
// form. A radiogroup of five buttons (not styled native radios) so the
// keyboard/AA behaviour stays simple and explicit. Amber fill per the
// brand palette; the numeric value is always announced, never colour-
// or icon-only.

interface RatingInputProps {
  label:      string
  value:      number | null
  onChange:   (n: number) => void
  error?:     string
  /** aria-label template — "{n}" replaced by the star number */
  starLabel:  string
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className="h-7 w-7 transition-colors duration-100"
      viewBox="0 0 24 24"
      fill={filled ? '#F2A341' : 'none'}
      stroke={filled ? '#F2A341' : '#94A3B8'}
      strokeWidth={1.5}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
  )
}

export function RatingInput({ label, value, onChange, error, starLabel }: RatingInputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={starLabel.replace('{n}', String(n))}
            onClick={() => onChange(n)}
            className={[
              'rounded-lg p-1 transition-transform duration-100 hover:scale-110',
              'focus:outline-none focus:ring-2 focus:ring-royal-blue/40',
            ].join(' ')}
          >
            <StarIcon filled={value != null && n <= value} />
          </button>
        ))}
        {value != null && (
          <span className="ml-2 font-mono text-sm font-semibold text-slate">{value}/5</span>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
