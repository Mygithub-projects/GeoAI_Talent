import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// The root URL is a router, not a page.
//
// Until 2026-09-07 this rendered a separate welcome hero (logo, tagline, four
// feature tiles, Sign in / Request access) that a visitor had to click through
// before reaching the sign-in screen. The user asked to drop that step: the
// split-screen sign-in at /login IS the landing page. Nothing is lost — its
// left panel carries the same branding and feature chips, and both exits the
// hero offered are on it (Sign in, plus "Request access" -> /register). The
// old markup is in git history if it is ever wanted back.
//
// No proxy change is needed and there is no redirect loop: '/' and '/login'
// are both in PUBLIC_PATHS, so an unauthenticated visitor passes the guard,
// lands here, and is sent on to /login, which renders. A `pending` user never
// reaches this code — the proxy sends them to /awaiting-approval first. The
// `pathname !== '/'` exception in proxy.ts is what lets an ACTIVE user get
// here at all, so the redirect below is the only thing routing them onward;
// leave that exception alone.
export default async function RootRedirect() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('status')
      .eq('user_id', user.id)
      .single()

    if (profile?.status === 'active') redirect('/dashboard')
    if (profile?.status === 'pending') redirect('/awaiting-approval')
    // Any other status (suspended, or no profile row) falls through to the
    // sign-in screen rather than a dead end.
  }

  redirect('/login')
}
