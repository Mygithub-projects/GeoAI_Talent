type AlertVariant = 'info' | 'success' | 'warning' | 'error'

const styles: Record<AlertVariant, { wrapper: string; icon: string; iconPath: string }> = {
  info: {
    wrapper: 'bg-blue-50 border-blue-200 text-blue-800',
    icon: 'text-blue-500',
    iconPath: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  success: {
    wrapper: 'bg-teal-50 border-teal-200 text-teal-800',
    icon: 'text-teal-500',
    iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  warning: {
    wrapper: 'bg-amber-50 border-amber-200 text-amber-800',
    icon: 'text-amber-500',
    iconPath: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  },
  error: {
    wrapper: 'bg-red-50 border-red-200 text-red-800',
    icon: 'text-red-500',
    iconPath: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
}

interface AlertProps {
  variant?: AlertVariant
  message: string
  /**
   * Optional next step rendered under the message — e.g. a "Forgot password?"
   * link on a failed sign-in. Keeps the alert actionable instead of only
   * telling the user what went wrong.
   */
  action?: React.ReactNode
  className?: string
}

export function Alert({ variant = 'info', message, action, className = '' }: AlertProps) {
  const s = styles[variant]
  return (
    <div
      role="alert"
      className={`flex gap-2.5 rounded-xl border p-3.5 text-sm ${s.wrapper} ${className}`}
    >
      <svg
        className={`mt-0.5 h-4 w-4 shrink-0 ${s.icon}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={s.iconPath} />
      </svg>
      <div className="flex flex-col gap-1.5">
        <span>{message}</span>
        {action && <div className="font-medium underline-offset-2">{action}</div>}
      </div>
    </div>
  )
}
