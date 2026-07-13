import type { Translations } from '@/i18n/en'

// Guided-tour step definitions (2026-07-13). Copy lives in the i18n
// `tour` namespace (en+bm) — steps hold only structure. Targets are
// [data-tour="…"] attributes on STABLE chrome (never data rows), so
// steps survive empty tables and slow fetches; a step whose target
// never appears is skipped by the engine after a timeout.

export interface TourStep {
  id:        string
  /** Route the step lives on — the engine navigates there if needed */
  route:     string
  /** CSS selector of the element to spotlight; omit for a centered card */
  target?:   string
  adminOnly?: boolean
  getTitle: (t: Translations) => string
  getBody:  (t: Translations) => string
}

export const TOUR_STEPS: TourStep[] = [
  // ── Shell (on the dashboard) ──────────────────────────────────
  { id: 'welcome',    route: '/dashboard',
    getTitle: t => t.tour.welcomeTitle,    getBody: t => t.tour.welcomeBody },
  { id: 'nav',        route: '/dashboard', target: '[data-tour="nav"]',
    getTitle: t => t.tour.navTitle,        getBody: t => t.tour.navBody },
  { id: 'bell',       route: '/dashboard', target: '[data-tour="bell"]',
    getTitle: t => t.tour.bellTitle,       getBody: t => t.tour.bellBody },
  { id: 'assistant',  route: '/dashboard', target: '[data-tour="assistant"]',
    getTitle: t => t.tour.assistantTitle,  getBody: t => t.tour.assistantBody },
  { id: 'language',   route: '/dashboard', target: '[data-tour="language"]',
    getTitle: t => t.tour.languageTitle,   getBody: t => t.tour.languageBody },
  { id: 'tourBtn',    route: '/dashboard', target: '[data-tour="tour-button"]',
    getTitle: t => t.tour.tourBtnTitle,    getBody: t => t.tour.tourBtnBody },

  // ── Dashboard ─────────────────────────────────────────────────
  { id: 'modeToggle', route: '/dashboard', target: '[data-tour="mode-toggle"]',
    getTitle: t => t.tour.modeToggleTitle, getBody: t => t.tour.modeToggleBody },
  { id: 'skillFilter', route: '/dashboard', target: '[data-tour="skill-filter"]',
    getTitle: t => t.tour.skillFilterTitle, getBody: t => t.tour.skillFilterBody },
  { id: 'map',        route: '/dashboard', target: '[data-tour="map"]',
    getTitle: t => t.tour.mapTitle,        getBody: t => t.tour.mapBody },

  // ── Engagements board ─────────────────────────────────────────
  { id: 'engIntro',   route: '/engagements',
    getTitle: t => t.tour.engIntroTitle,   getBody: t => t.tour.engIntroBody },
  { id: 'engFilters', route: '/engagements', target: '[data-tour="eng-filters"]',
    getTitle: t => t.tour.engFiltersTitle, getBody: t => t.tour.engFiltersBody },
  { id: 'engBoard',   route: '/engagements',
    getTitle: t => t.tour.engBoardTitle,   getBody: t => t.tour.engBoardBody },

  // ── Calendar ──────────────────────────────────────────────────
  { id: 'calIntro',   route: '/calendar',
    getTitle: t => t.tour.calIntroTitle,   getBody: t => t.tour.calIntroBody },
  { id: 'calToolbar', route: '/calendar', target: '[data-tour="cal-toolbar"]',
    getTitle: t => t.tour.calToolbarTitle, getBody: t => t.tour.calToolbarBody },

  // ── Reports ───────────────────────────────────────────────────
  { id: 'repIntro',   route: '/reports',
    getTitle: t => t.tour.repIntroTitle,   getBody: t => t.tour.repIntroBody },
  { id: 'repFilters', route: '/reports', target: '[data-tour="rep-filters"]',
    getTitle: t => t.tour.repFiltersTitle, getBody: t => t.tour.repFiltersBody },
  { id: 'repExport',  route: '/reports', target: '[data-tour="rep-export"]',
    getTitle: t => t.tour.repExportTitle,  getBody: t => t.tour.repExportBody },
  { id: 'repClassify', route: '/reports',
    getTitle: t => t.tour.repClassifyTitle, getBody: t => t.tour.repClassifyBody },

  // ── Talent Distribution ───────────────────────────────────────
  { id: 'talIntro',   route: '/talent',
    getTitle: t => t.tour.talIntroTitle,   getBody: t => t.tour.talIntroBody },
  { id: 'talPanel',   route: '/talent', target: '[data-tour="talent-panel"]',
    getTitle: t => t.tour.talPanelTitle,   getBody: t => t.tour.talPanelBody },
  { id: 'talDots',    route: '/talent',
    getTitle: t => t.tour.talDotsTitle,    getBody: t => t.tour.talDotsBody },
  { id: 'talTransfer', route: '/talent', adminOnly: true,
    getTitle: t => t.tour.talTransferTitle, getBody: t => t.tour.talTransferBody },

  // ── Trainer feedback ──────────────────────────────────────────
  { id: 'fbIntro',    route: '/trainer-feedback',
    getTitle: t => t.tour.fbIntroTitle,    getBody: t => t.tour.fbIntroBody },
  { id: 'fbTiles',    route: '/trainer-feedback', target: '[data-tour="fb-tiles"]',
    getTitle: t => t.tour.fbTilesTitle,    getBody: t => t.tour.fbTilesBody },

  // ── Settings ──────────────────────────────────────────────────
  { id: 'setIntro',   route: '/settings',
    getTitle: t => t.tour.setIntroTitle,   getBody: t => t.tour.setIntroBody },
  { id: 'setName',    route: '/settings', target: '[data-tour="set-name"]',
    getTitle: t => t.tour.setNameTitle,    getBody: t => t.tour.setNameBody },
  { id: 'setPassword', route: '/settings', target: '[data-tour="set-password"]',
    getTitle: t => t.tour.setPasswordTitle, getBody: t => t.tour.setPasswordBody },

  // ── Admin finale (highlighted from the nav, no navigation) ────
  { id: 'adminNav',   route: '/dashboard', target: '[data-tour="nav-admin"]', adminOnly: true,
    getTitle: t => t.tour.adminNavTitle,   getBody: t => t.tour.adminNavBody },
  { id: 'done',       route: '/dashboard',
    getTitle: t => t.tour.doneTitle,       getBody: t => t.tour.doneBody },
]
