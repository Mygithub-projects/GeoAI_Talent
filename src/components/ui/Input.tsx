import { type InputHTMLAttributes, forwardRef, useId } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className = '', id: idProp, ...rest },
  ref
) {
  const generatedId = useId()
  const id = idProp ?? generatedId

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-slate">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        aria-invalid={!!error}
        className={[
          'h-10 w-full rounded-xl border bg-white px-3.5 text-sm text-slate',
          'placeholder:text-muted',
          'transition-colors duration-150',
          'focus:outline-none focus:ring-2 focus:ring-offset-0',
          error
            ? 'border-red-400 focus:ring-red-400'
            : 'border-border hover:border-muted/60 focus:border-royal-blue focus:ring-royal-blue/30',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface',
          className,
        ].join(' ')}
        {...rest}
      />
      {error && (
        <p id={`${id}-error`} className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  )
})
