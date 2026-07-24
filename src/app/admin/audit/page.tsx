import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTranslations, isValidLocale, DEFAULT_LOCALE, LOCALE_COOKIE } from '@/i18n'
import { AuditLogClient, type AuditViewerRow } from './_components/AuditLogClient'

export const dynamic = 'force-dynamic'

// Phase 8 — dedicated audit-log viewer. Admin-only (proxy.ts blocks
// non-admins from /admin/*; role/status re-checked here). Shows the
// latest 500 audit entries with client-side action/actor/date filters —
// a full-history complement to the 100-row tab on /engagements.
export default async function AdminAuditPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role, status, full_name')
    .eq('user_id', user.id)
    .single()

  if (currentProfile?.role !== 'admin' || currentProfile?.status !== 'active') {
    redirect('/dashboard')
  }

  const cookieStore = await cookies()
  const rawLang = cookieStore.get(LOCALE_COOKIE)?.value
  const locale = isValidLocale(rawLang) ? rawLang : DEFAULT_LOCALE
  const t = getTranslations(locale)

  const admin = createAdminClient()

  const { data: rawAudit } = await admin
    .from('audit_logs')
    .select('log_id, actor, action, entity_type, entity_id, payload_json, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  const actorIds = [...new Set(
    (rawAudit ?? []).map(a => a.actor as string | null).filter(Boolean) as string[]
  )]
  const { data: actors } = actorIds.length > 0
    ? await admin.from('profiles').select('user_id, full_name').in('user_id', actorIds)
    : { data: [] }
  const actorMap = Object.fromEntries(
    (actors ?? []).map((p: { user_id: string; full_name: string | null }) =>
      [p.user_id, p.full_name ?? 'Unknown']
    )
  )

  const rows: AuditViewerRow[] = (rawAudit ?? []).map(a => ({
    log_id:       a.log_id as string,
    actor_name:   a.actor
      ? (actorMap[a.actor as string] ??
         // deleted account: the audit payload keeps the name (actor_name)
         ((a.payload_json as Record<string, unknown> | null)?.actor_name as string | undefined) ??
         'Unknown')
      : null,
    action:       a.action as string,
    entity_type:  (a.entity_type as string | null) ?? null,
    entity_id:    (a.entity_id as string | null) ?? null,
    payload_json: (a.payload_json as Record<string, unknown> | null) ?? null,
    created_at:   a.created_at as string,
  }))

  return (
    <div className="min-h-screen bg-surface">
      <header className="flex items-center justify-between border-b border-border bg-white px-6 py-3 shadow-sm">
        <Image src="/logo_horizontal.svg" alt="GeoAI Talent Agent" width={160} height={36} className="h-8 w-auto" />
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted">{currentProfile.full_name ?? user.email} · Admin</span>
          <Link href="/admin/users" className="text-sm text-royal-blue hover:underline">{t.admin.usersTitle}</Link>
          <Link href="/admin/database" className="text-sm text-royal-blue hover:underline">{t.adminDb.title}</Link>
          <Link href="/analytics" className="text-sm text-royal-blue hover:underline">{t.analytics.title}</Link>
          <Link href="/dashboard" className="text-sm text-royal-blue hover:underline">{t.dashboard.title}</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate">{t.audit.title}</h1>
          <p className="mt-1 text-sm text-muted">{t.audit.subtitle}</p>
        </div>
        <AuditLogClient rows={rows} />
      </main>
    </div>
  )
}
