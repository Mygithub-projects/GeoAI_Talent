'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/i18n/LanguageProvider'

interface NavRailProps {
  expanded: boolean
  onToggle: () => void
  userRole: string
  pendingCount?: number
}

interface NavItem {
  href: string
  labelKey: keyof ReturnType<typeof useLanguage>['t']['map']
  icon: React.ReactNode
  adminOnly?: boolean
}

function MapIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  )
}

function CalendarGridIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
    </svg>
  )
}

function DatabaseIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function DocumentReportIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function UsersMapIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  )
}

function StarFeedbackIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  )
}

function ClipboardListIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
    </svg>
  )
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
      fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  )
}

export function NavRail({ expanded, onToggle, userRole, pendingCount = 0 }: NavRailProps) {
  const pathname = usePathname()
  const { t } = useLanguage()

  const navItems = [
    { href: '/dashboard',   label: t.map.navDashboard,    icon: <MapIcon />,      adminOnly: false, badge: 0 },
    { href: '/engagements', label: t.map.navEngagements,  icon: <CalendarIcon />, adminOnly: false, badge: 0 },
    { href: '/calendar',    label: t.map.navCalendar,     icon: <CalendarGridIcon />, adminOnly: false, badge: 0 },
    { href: '/reports',     label: t.map.navReports,      icon: <DocumentReportIcon />, adminOnly: false, badge: 0 },
    { href: '/talent',      label: t.map.navTalent,       icon: <UsersMapIcon />,       adminOnly: false, badge: 0 },
    { href: '/trainer-feedback', label: t.map.navTrainerFeedback, icon: <StarFeedbackIcon />, adminOnly: false, badge: 0 },
    { href: '/admin/database',  label: t.map.navDatabase,  icon: <DatabaseIcon />,      adminOnly: true, badge: 0 },
    { href: '/admin/analytics', label: t.map.navAnalytics, icon: <ChartIcon />,         adminOnly: true, badge: 0 },
    { href: '/admin/audit',     label: t.map.navAudit,     icon: <ClipboardListIcon />, adminOnly: true, badge: 0 },
  ]

  return (
    <nav
      data-tour="nav"
      aria-label={t.common.mainNavigation}
      className={`
        flex flex-col bg-rail-gradient text-white flex-shrink-0 transition-all duration-200
        ${expanded ? 'w-56' : 'w-16'}
      `}
    >
      {/* Logo area */}
      <div className={`flex h-14 items-center border-b border-white/10 px-3 ${expanded ? 'gap-3' : 'justify-center'}`}>
        <div className="relative flex-shrink-0">
          <Image
            src={expanded ? '/logo_horizontal.svg' : '/logo_icon.svg'}
            alt="GeoAI Talent Agent"
            width={expanded ? 120 : 28}
            height={28}
            className="h-7 w-auto object-left"
            priority
          />
        </div>
      </div>

      {/* Nav items */}
      <div className="flex flex-1 flex-col gap-1 p-2 pt-3">
        {navItems
          .filter(item => !item.adminOnly || userRole === 'admin')
          .map(item => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                data-tour={item.href === '/admin/users' ? 'nav-admin' : undefined}
                title={!expanded ? item.label : undefined}
                className={`
                  relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium
                  transition-colors duration-150
                  ${isActive
                    ? 'bg-white/15 text-white shadow-[inset_0_1px_0_rgb(255_255_255_/_0.08)]'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }
                  ${!expanded ? 'justify-center' : ''}
                `}
              >
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-teal"
                    aria-hidden
                  />
                )}
                <span className="relative flex-shrink-0">
                  {item.icon}
                  {item.badge > 0 && (
                    <span style={{
                      position: 'absolute', top: -5, right: -6,
                      minWidth: 16, height: 16,
                      background: '#EF4444', color: '#fff',
                      fontSize: 9, fontWeight: 800, lineHeight: '16px',
                      borderRadius: 99, textAlign: 'center',
                      padding: '0 3px', letterSpacing: 0,
                      border: '1.5px solid #0E2F57',
                    }}>
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </span>
                {expanded && <span className="truncate">{item.label}</span>}
                {expanded && item.badge > 0 && (
                  <span style={{
                    marginLeft: 'auto', minWidth: 18, height: 18,
                    background: '#EF4444', color: '#fff',
                    fontSize: 10, fontWeight: 800, lineHeight: '18px',
                    borderRadius: 99, textAlign: 'center',
                    padding: '0 4px', flexShrink: 0,
                  }}>
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </Link>
            )
          })
        }
      </div>

      {/* Admin + Settings + collapse toggle */}
      <div className="flex flex-col gap-1 border-t border-white/10 p-2">
        {userRole === 'admin' && (() => {
          const adminActive = pathname === '/admin/users' || pathname.startsWith('/admin/users/')
          return (
            <Link
              href="/admin/users"
              data-tour="nav-admin"
              title={!expanded ? t.map.navAdmin : undefined}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                adminActive
                  ? 'bg-white/15 text-white shadow-[inset_0_1px_0_rgb(255_255_255_/_0.08)]'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              } ${!expanded ? 'justify-center' : ''}`}
            >
              {adminActive && (
                <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-teal" aria-hidden />
              )}
              <span className="relative flex-shrink-0">
                <ShieldIcon />
                {pendingCount > 0 && (
                  <span style={{
                    position: 'absolute', top: -5, right: -6,
                    minWidth: 16, height: 16,
                    background: '#EF4444', color: '#fff',
                    fontSize: 9, fontWeight: 800, lineHeight: '16px',
                    borderRadius: 99, textAlign: 'center',
                    padding: '0 3px', letterSpacing: 0,
                    border: '1.5px solid #0E2F57',
                  }}>
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </span>
              {expanded && <span className="truncate">{t.map.navAdmin}</span>}
              {expanded && pendingCount > 0 && (
                <span style={{
                  marginLeft: 'auto', minWidth: 18, height: 18,
                  background: '#EF4444', color: '#fff',
                  fontSize: 10, fontWeight: 800, lineHeight: '18px',
                  borderRadius: 99, textAlign: 'center',
                  padding: '0 4px', flexShrink: 0,
                }}>
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </Link>
          )
        })()}
        <Link
          href="/settings"
          title={!expanded ? t.map.navSettings : undefined}
          className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            pathname === '/settings'
              ? 'bg-white/15 text-white shadow-[inset_0_1px_0_rgb(255_255_255_/_0.08)]'
              : 'text-white/70 hover:bg-white/10 hover:text-white'
          } ${!expanded ? 'justify-center' : ''}`}
        >
          {pathname === '/settings' && (
            <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-teal" aria-hidden />
          )}
          <span className="flex-shrink-0"><SettingsIcon /></span>
          {expanded && <span className="truncate">{t.map.navSettings}</span>}
        </Link>

        <button
          onClick={onToggle}
          title={expanded ? t.map.collapseNav : t.map.expandNav}
          aria-label={expanded ? t.map.collapseNav : t.map.expandNav}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/50 hover:bg-white/10 hover:text-white transition-colors ${!expanded ? 'justify-center' : ''}`}
        >
          <span className="flex-shrink-0"><ChevronIcon expanded={expanded} /></span>
          {expanded && <span className="truncate">{t.map.collapseNav}</span>}
        </button>
      </div>
    </nav>
  )
}
