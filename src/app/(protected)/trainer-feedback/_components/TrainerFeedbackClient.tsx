'use client'

import { useMemo, useState } from 'react'
import { useLanguage } from '@/i18n/LanguageProvider'
import { EmptyState } from '@/components/ui/EmptyState'
import type { FeedbackWorkshopSummary } from '@/lib/feedbackData'

// ── Helpers (same building blocks as AnalyticsClient) ────────────

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// Chart fills — darker steps of the brand hues (dataviz-validated
// against the light surface, same constants as AnalyticsClient).
const FILL_CONFIRMED = '#0E9C94'
const FILL_DECLINED  = '#475569'
const FILL_PRIMARY   = '#1E63C4'

function StatTile({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string
}) {
  return (
    <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</p>
      <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 700, color: accent ?? '#0E2F57', fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.1 }}>{value}</p>
      {sub && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748B' }}>{sub}</p>}
    </div>
  )
}

function SectionCard({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <section style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: 20 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0E2F57' }}>{title}</h2>
      {subtitle && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748B' }}>{subtitle}</p>}
      <div style={{ marginTop: 16 }}>{children}</div>
    </section>
  )
}

/** Horizontal meter: label · track filled avg/5 · numeric value */
function RatingBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 170, flexShrink: 0, fontSize: 12, color: '#334155' }}>{label}</span>
      <div style={{ flex: 1, height: 10, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
        {value != null && (
          <div style={{ width: `${(value / 5) * 100}%`, height: '100%', background: FILL_PRIMARY, borderRadius: 99 }} />
        )}
      </div>
      <span style={{ width: 40, flexShrink: 0, textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#0E2F57', fontFamily: "'IBM Plex Mono', monospace" }}>
        {value != null ? value.toFixed(1) : '—'}
      </span>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────

interface Props {
  workshops:         FeedbackWorkshopSummary[]
  isAdmin:           boolean
  feedbackAvailable: boolean
}

export function TrainerFeedbackClient({ workshops, isAdmin, feedbackAvailable }: Props) {
  const { t } = useLanguage()
  const f = t.trainerFeedback

  const [workshopId, setWorkshopId] = useState('')

  const workshopOptions = useMemo(
    () => workshops.map(w => ({
      id:    w.engagement_id,
      label: `${w.training_title ?? f.untitled}${w.venue_name ? ` — ${w.venue_name}` : ''}${w.start_date ? ` (${fmtDate(w.start_date)})` : ''}`,
    })),
    [workshops, f.untitled]
  )

  const filtered = useMemo(
    () => workshopId ? workshops.filter(w => w.engagement_id === workshopId) : workshops,
    [workshops, workshopId]
  )

  const totals = useMemo(() => {
    const responses = filtered.reduce((s, w) => s + w.responseCount, 0)
    const requested = filtered.reduce((s, w) => s + w.requestedCount, 0)
    const yes       = filtered.reduce((s, w) => s + w.recommendYes, 0)
    const no        = filtered.reduce((s, w) => s + w.recommendNo, 0)
    // response-count-weighted overall average across the filtered set
    const weighted  = filtered.reduce((s, w) => s + (w.avgOverall ?? 0) * w.responseCount, 0)
    return {
      responses,
      requested,
      avgOverall:   responses > 0 ? weighted / responses : null,
      recommendPct: (yes + no) > 0 ? Math.round((yes / (yes + no)) * 100) : null,
      responseRate: requested > 0 ? Math.round((responses / requested) * 100) : null,
    }
  }, [filtered])

  const withResponses = filtered.filter(w => w.responseCount > 0)

  const inputStyle = { fontSize: 13, padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: 'white' } as const

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="animate-fade-up">
        <h1 className="font-display text-2xl font-semibold text-slate">{f.title}</h1>
        <p className="mt-1 text-sm text-muted">{isAdmin ? f.subtitleAdmin : f.subtitleUser}</p>
      </div>

      {!feedbackAvailable && (
        <p style={{ margin: '16px 0 0', fontSize: 12, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '8px 12px' }}>
          {f.migrationBanner}
        </p>
      )}

      {/* Workshop filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0 16px', flexWrap: 'wrap' }}>
        <select value={workshopId} onChange={e => setWorkshopId(e.target.value)} style={{ ...inputStyle, maxWidth: 380 }} aria-label={f.allWorkshops}>
          <option value="">{f.allWorkshops}</option>
          {workshopOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#94A3B8' }}>
          {f.workshopsShown.replace('{n}', String(filtered.length))}
        </span>
      </div>

      {/* KPI tiles */}
      <div data-tour="fb-tiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatTile
          label={f.tileResponses}
          value={String(totals.responses)}
          sub={f.tileResponsesSub.replace('{n}', String(totals.requested))}
        />
        <StatTile
          label={f.tileAvgOverall}
          value={totals.avgOverall != null ? totals.avgOverall.toFixed(1) : '—'}
          sub={f.tileAvgOverallSub}
          accent={FILL_PRIMARY}
        />
        <StatTile
          label={f.tileRecommendPct}
          value={totals.recommendPct != null ? `${totals.recommendPct}%` : '—'}
          accent={FILL_CONFIRMED}
        />
        <StatTile
          label={f.tileResponseRate}
          value={totals.responseRate != null ? `${totals.responseRate}%` : '—'}
          sub={f.tileResponseRateSub}
        />
      </div>

      {/* Per-workshop breakdowns */}
      {filtered.length === 0 ? (
        <EmptyState
          title={f.noWorkshopsTitle}
          description={f.noWorkshopsDesc}
        />
      ) : withResponses.length === 0 ? (
        <EmptyState
          title={f.noFeedbackYetTitle}
          description={f.noFeedbackYetDesc}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {withResponses.map(w => {
            const recTotal = w.recommendYes + w.recommendNo
            return (
              <SectionCard
                key={w.engagement_id}
                title={w.training_title ?? f.untitled}
                subtitle={[w.venue_name, w.start_date ? fmtDate(w.start_date) : null].filter(Boolean).join(' · ')
                  + ` · ${f.responsesOf.replace('{received}', String(w.responseCount)).replace('{requested}', String(w.requestedCount))}`}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <RatingBar label={f.catContent}       value={w.avgContent} />
                  <RatingBar label={f.catMaterials}     value={w.avgMaterials} />
                  <RatingBar label={f.catVenue}         value={w.avgVenueLogistics} />
                  <RatingBar label={f.catCommunication} value={w.avgCommunication} />
                  <RatingBar label={f.catOverall}       value={w.avgOverall} />
                </div>

                {/* Would-recommend stacked bar */}
                {recTotal > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: '#334155' }}>{f.recommendTitle}</p>
                    <div style={{ display: 'flex', height: 14, borderRadius: 99, overflow: 'hidden', gap: w.recommendYes > 0 && w.recommendNo > 0 ? 2 : 0 }}>
                      {w.recommendYes > 0 && (
                        <div style={{ width: `${(w.recommendYes / recTotal) * 100}%`, background: FILL_CONFIRMED }} />
                      )}
                      {w.recommendNo > 0 && (
                        <div style={{ width: `${(w.recommendNo / recTotal) * 100}%`, background: FILL_DECLINED }} />
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 11, color: '#64748B' }}>
                      <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 99, background: FILL_CONFIRMED, marginRight: 5 }} />{f.recommendYes}: {w.recommendYes}</span>
                      <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 99, background: FILL_DECLINED, marginRight: 5 }} />{f.recommendNo}: {w.recommendNo}</span>
                    </div>
                  </div>
                )}

                {/* Comments */}
                <div style={{ marginTop: 16 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#334155' }}>{f.commentsHeading}</p>
                  {w.comments.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12, color: '#94A3B8' }}>{f.noComments}</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {w.comments.map((c, i) => (
                        <blockquote key={i} style={{ margin: 0, background: '#F6F8FB', border: '1px solid #E2E8F0', borderLeft: `3px solid ${FILL_PRIMARY}`, borderRadius: 8, padding: '10px 14px' }}>
                          <p style={{ margin: 0, fontSize: 13, color: '#334155', lineHeight: 1.6 }}>{c.comments}</p>
                          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#94A3B8' }}>
                            {c.trainer_name ?? f.anonymousTrainer} · {fmtDate(c.submitted_at)} · {c.rating_overall}/5
                          </p>
                        </blockquote>
                      ))}
                    </div>
                  )}
                </div>
              </SectionCard>
            )
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-muted">{f.footnote}</p>
    </div>
  )
}
