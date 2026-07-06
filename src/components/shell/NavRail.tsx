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

function SearchIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
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

function SettingsIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
    { href: '/search',      label: t.map.navSearch,       icon: <SearchIcon />,   adminOnly: false, badge: 0 },
    { href: '/engagements', label: t.map.navEngagements,  icon: <CalendarIcon />, adminOnly: false, badge: 0 },
    { href: '/admin/users', label: t.map.navAdmin,        icon: <ShieldIcon />,   adminOnly: true,  badge: pendingCount },
  ]

  return (
    <nav
      aria-label="Main navigation"
      className={`
        flex flex-col bg-ink-navy text-white flex-shrink-0 transition-all duration-200
        ${expanded ? 'w-56' : 'w-16'}
      `}
    >
      {/* Logo area */}
      <div className={`flex h-14 items-center border-b border-white/10 px-3 ${expanded ? 'gap-3' : 'justify-center'}`}>
        <div className="relative flex-shrink-0">
          <Image
            src={expanded ? '/logo_horizontal.svg' : '/logo_icon.svg'}
            alt="GEO-TALENT"
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
                title={!expanded ? item.label : undefined}
                className={`
                  relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium
                  transition-colors duration-150
                  ${isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }
                  ${!expanded ? 'justify-center' : ''}
                `}
              >
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

      {/* Settings + collapse toggle */}
      <div className="flex flex-col gap-1 border-t border-white/10 p-2">
        <Link
          href="/settings"
          title={!expanded ? t.map.navSettings : undefined}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors ${!expanded ? 'justify-center' : ''}`}
        >
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
