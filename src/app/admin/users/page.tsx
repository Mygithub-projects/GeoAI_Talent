import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTranslations, isValidLocale, DEFAULT_LOCALE, LOCALE_COOKIE } from '@/i18n'
import { Button } from '@/components/ui/Button'
import Image from 'next/image'
import Link from 'next/link'
import { ApproveModal } from './ApproveModal'
import { AddUserModal } from './AddUserModal'
import { UserRowActions } from './UserRowActions'

interface Profile {
  user_id: string
  full_name: string | null
  email: string
  role: 'admin' | 'user'
  ppd_district: string | null
  status: 'pending' | 'active' | 'suspended'
  created_at: string
}

export default async function AdminUsersPage() {
  // Auth + admin guard
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

  // Fetch all profiles via admin client (bypasses RLS so admin can see everyone)
  const adminClient = createAdminClient()
  const { data: profiles } = await adminClient
    .from('profiles')
    .select('user_id, full_name, email, role, ppd_district, status, created_at')
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })

  const cookieStore = await cookies()
  const rawLang = cookieStore.get(LOCALE_COOKIE)?.value
  const locale = isValidLocale(rawLang) ? rawLang : DEFAULT_LOCALE
  const t = getTranslations(locale)

  const pending = (profiles ?? []).filter((p: Profile) => p.status === 'pending')
  const others  = (profiles ?? []).filter((p: Profile) => p.status !== 'pending')

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending:   'bg-amber/10 text-amber border-amber/30',
      active:    'bg-teal/10 text-teal border-teal/30',
      suspended: 'bg-slate/10 text-muted border-slate/20',
    }
    return map[status] ?? ''
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-border bg-white px-6 py-3 shadow-sm">
        <Image src="/logo_horizontal.svg" alt="GeoAI Talent Agent" width={109} height={36} className="h-8 w-auto" />
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted">
            {currentProfile.full_name ?? user.email}
            <span className="ml-2 inline-flex items-center rounded-full bg-royal-blue/10 px-2 py-0.5 text-xs font-semibold text-royal-blue">
              {t.common.adminBadge}
            </span>
          </span>
          <Link href="/dashboard" className="text-sm text-royal-blue hover:underline">{t.dashboard.title}</Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-8 animate-fade-in">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-slate">{t.admin.usersTitle}</h1>
            <p className="mt-1 text-sm text-muted">{t.admin.usersSubtitle}</p>
          </div>
          <AddUserModal t={t} />
        </div>

        {/* MFA note */}
        <div className="rounded-xl border border-border bg-white p-4 text-sm text-muted">
          <span className="font-medium text-slate">{t.admin.mfaNote}:</span>{' '}
          {t.admin.mfaInstructions}
        </div>

        {/* Pending section */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            {t.admin.pendingUsers} ({pending.length})
          </h2>
          {pending.length === 0 ? (
            <p className="text-sm text-muted">{t.admin.noPending}</p>
          ) : (
            <div className="overflow-hidden rounded-card border border-border bg-white shadow-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-xs text-muted">
                    <th className="px-4 py-3 text-left font-medium">{t.admin.name}</th>
                    <th className="px-4 py-3 text-left font-medium">{t.admin.email}</th>
                    <th className="px-4 py-3 text-left font-medium">{t.admin.joinedAt}</th>
                    <th className="px-4 py-3 text-left font-medium">{t.admin.status}</th>
                    <th className="px-4 py-3 text-left font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pending.map((p: Profile) => (
                    <tr key={p.user_id} className="hover:bg-surface/60 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate">{p.full_name ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted">{p.email}</td>
                      <td className="px-4 py-3 text-muted">{new Date(p.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge(p.status)}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <ApproveModal profile={p} t={t} />
                          <UserRowActions profile={p} t={t} isSelf={p.user_id === user.id} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* All users section */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            {t.admin.allUsers} ({others.length})
          </h2>
          {others.length > 0 && (
            <div className="overflow-hidden rounded-card border border-border bg-white shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface text-xs text-muted">
                      <th className="px-4 py-3 text-left font-medium">{t.admin.name}</th>
                      <th className="px-4 py-3 text-left font-medium">{t.admin.email}</th>
                      <th className="px-4 py-3 text-left font-medium">{t.admin.role}</th>
                      <th className="px-4 py-3 text-left font-medium">{t.admin.district}</th>
                      <th className="px-4 py-3 text-left font-medium">{t.admin.status}</th>
                      <th className="px-4 py-3 text-left font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {others.map((p: Profile) => (
                      <tr key={p.user_id} className="hover:bg-surface/60 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate">{p.full_name ?? '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted">{p.email}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                            p.role === 'admin'
                              ? 'bg-royal-blue/10 text-royal-blue border-royal-blue/20'
                              : 'bg-surface text-muted border-border'
                          }`}>
                            {p.role === 'admin' ? t.admin.roleAdmin : t.admin.roleUser}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted">{p.ppd_district ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge(p.status)}`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-2">
                            <ApproveModal profile={p} t={t} isEdit />
                            <UserRowActions profile={p} t={t} isSelf={p.user_id === user.id} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
