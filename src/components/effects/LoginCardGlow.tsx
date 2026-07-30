'use client'

// Cursor-following border glow for the login card (light-theme adaptation of
// the React Bits "MagicBento" border-glow — recoloured teal→blue, no gsap, no
// dark-theme blend). Purely visual: it toggles a class + CSS custom properties
// on the shared auth card, so it NEVER interferes with the form. Mounted only
// by the login page, so register / reset-password / update-password are
// unaffected. Disabled on touch devices and under prefers-reduced-motion.

import { useEffect, useRef } from 'react'

export default function LoginCardGlow() {
  const markerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const card = markerRef.current?.closest<HTMLElement>('.rounded-card')
    if (!card) return

    // Respect reduced-motion and skip on coarse pointers (touch), where a
    // cursor-follow glow has no meaning and hover doesn't apply.
    const finePointer = window.matchMedia?.('(pointer: fine)').matches
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!finePointer || reduce) return

    card.classList.add('auth-card-glow')

    const onMove = (e: PointerEvent) => {
      const rect = card.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      card.style.setProperty('--glow-x', `${x}%`)
      card.style.setProperty('--glow-y', `${y}%`)
      card.style.setProperty('--glow-intensity', '1')
    }

    const onLeave = () => {
      card.style.setProperty('--glow-intensity', '0')
    }

    card.addEventListener('pointermove', onMove)
    card.addEventListener('pointerleave', onLeave)

    return () => {
      card.removeEventListener('pointermove', onMove)
      card.removeEventListener('pointerleave', onLeave)
      // Leave the shared card pristine for other auth routes.
      card.classList.remove('auth-card-glow')
      card.style.removeProperty('--glow-x')
      card.style.removeProperty('--glow-y')
      card.style.removeProperty('--glow-intensity')
    }
  }, [])

  return <span ref={markerRef} aria-hidden="true" style={{ display: 'none' }} />
}
