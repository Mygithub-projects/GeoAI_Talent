import { type ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description?: string
  /** Optional inline SVG icon (rendered inside a soft tinted circle) */
  icon?: ReactNode
  /** Optional action, e.g. a Button */
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, icon, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 px-6 py-12 text-center ${className}`}>
      {icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-royal-blue">
          {icon}
        </div>
      )}
      <p className="font-display text-base font-semibold text-slate">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
