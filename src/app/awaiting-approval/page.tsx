'use client'

import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useLanguage } from '@/i18n/LanguageProvider'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { LanguageToggle } from '@/components/LanguageToggle'

export default function AwaitingApprovalPage() {
  const { t } = useLanguage()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border bg-white px-6 py-4">
        <Image src="/logo_horizontal.svg" alt="GeoAI Talent Agent" width={160} height={36} className="h-8 w-auto" />
        <LanguageToggle />
      </div>

      {/* Content */}
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md animate-fade-in text-center space-y-6">
          {/* Icon */}
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber/10">
            <svg className="h-8 w-8 text-amber" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <div className="space-y-2">
            <h1 className="font-display text-2xl font-semibold text-slate">{t.approval.title}</h1>
            <p className="text-sm text-muted leading-relaxed">{t.approval.message}</p>
          </div>

          <div className="rounded-xl border border-border bg-white p-4 text-sm text-muted">
            {t.approval.contactAdmin}
          </div>

          <Button variant="secondary" onClick={handleSignOut} className="mx-auto">
            {t.approval.signOut}
          </Button>
        </div>
      </div>
    </div>
  )
}
