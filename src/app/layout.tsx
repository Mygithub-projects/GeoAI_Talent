import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, Inter, IBM_Plex_Mono } from 'next/font/google'
import { cookies } from 'next/headers'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { isValidLocale, DEFAULT_LOCALE, LOCALE_COOKIE } from '@/i18n'
import './globals.css'

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta-sans',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-ibm-plex-mono',
  weight: ['400', '500'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'GeoAI Talent Agent | JPN Sarawak',
  description: 'Geospatial Master Trainer Recommendation Platform — Jabatan Pendidikan Negeri Sarawak',
  icons: { icon: '/logo_icon.svg' },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Read language preference from cookie (set by LanguageProvider on toggle)
  const cookieStore = await cookies()
  const rawLang = cookieStore.get(LOCALE_COOKIE)?.value
  const initialLocale = isValidLocale(rawLang) ? rawLang : DEFAULT_LOCALE

  return (
    <html
      lang={initialLocale === 'bm' ? 'ms' : 'en'}
      className={`${plusJakartaSans.variable} ${inter.variable} ${ibmPlexMono.variable} h-full`}
    >
      <body className="h-full bg-surface text-slate antialiased">
        <LanguageProvider initialLocale={initialLocale}>
          {children}
        </LanguageProvider>
      </body>
    </html>
  )
}
