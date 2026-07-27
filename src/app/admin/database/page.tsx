import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getTranslations, isValidLocale, DEFAULT_LOCALE, LOCALE_COOKIE } from '@/i18n'
import { DatabaseConsoleClient } from './_components/DatabaseConsoleClient'

// Admin Database Console — direct view/add/edit/delete over the
// reference tables declared in src/lib/adminTables.ts. Admin-only:
// proxy.ts already blocks non-admins from /admin/*, and this page
// re-checks role/status server-side (defense in depth). All data
// access happens through /api/admin/tables/[table], which re-checks
// admin on every call.
export default async function AdminDatabasePage() {
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

  return (
    <div className="min-h-screen bg-surface">
      <header className="flex items-center justify-between border-b border-border bg-white px-6 py-3 shadow-sm">
        <Image src="/logo_horizontal.svg" alt="GeoAI Talent Agent" width={109} height={36} className="h-8 w-auto" />
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted">{currentProfile.full_name ?? user.email} · Admin</span>
          <Link href="/admin/users" className="text-sm text-royal-blue hover:underline">{t.admin.usersTitle}</Link>
          <Link href="/dashboard" className="text-sm text-royal-blue hover:underline">{t.dashboard.title}</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate">{t.adminDb.title}</h1>
          <p className="mt-1 text-sm text-muted">{t.adminDb.subtitle}</p>
        </div>
        <DatabaseConsoleClient />
      </main>
    </div>
  )
}
