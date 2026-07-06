import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppShell } from '@/components/shell/AppShell'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('status, role, full_name, ppd_district, preferred_language')
    .eq('user_id', user.id)
    .single()

  if (!profile || profile.status !== 'active') {
    redirect('/awaiting-approval')
  }

  let pendingCount = 0
  if (profile.role === 'admin') {
    const admin = createAdminClient()
    const { count } = await admin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    pendingCount = count ?? 0
  }

  return (
    <AppShell
      userName={profile.full_name ?? null}
      userRole={profile.role ?? 'user'}
      pendingCount={pendingCount}
    >
      {children}
    </AppShell>
  )
}
