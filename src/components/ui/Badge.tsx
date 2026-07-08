import { type HTMLAttributes } from 'react'

type BadgeVariant =
  | 'blue'    // interactive / info / admin
  | 'teal'    // success / confirmed / active
  | 'amber'   // pending / warning
  | 'red'     // declined / error / cancelled
  | 'navy'    // brand / neutral emphasis
  | 'muted'   // draft / neutral

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  /** Show a small status dot before the label */
  dot?: boolean
}

const variantClasses: Record<BadgeVariant, { chip: string; dot: string }> = {
  blue:  { chip: 'bg-royal-blue/10 text-royal-blue',  dot: 'bg-royal-blue' },
  teal:  { chip: 'bg-teal/10 text-teal-600',          dot: 'bg-teal' },
  amber: { chip: 'bg-amber/15 text-amber-700',        dot: 'bg-amber' },
  red:   { chip: 'bg-red-500/10 text-red-600',        dot: 'bg-red-500' },
  navy:  { chip: 'bg-ink-navy/10 text-ink-navy',      dot: 'bg-ink-navy' },
  muted: { chip: 'bg-muted/10 text-muted',            dot: 'bg-muted' },
}

export function Badge({ variant = 'muted', dot = false, className = '', children, ...rest }: BadgeProps) {
  const s = variantClasses[variant]
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        s.chip,
        className,
      ].join(' ')}
      {...rest}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />}
      {children}
    </span>
  )
}
