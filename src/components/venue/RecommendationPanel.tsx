'use client'

import type { TrainerPoint, TravelOption } from '@/components/map/TrainerDots'
import { useLanguage } from '@/i18n/LanguageProvider'

export interface InvitedTrainerStatus {
  trainer_id:   string
  trainer_name: string
  status:       'Pending Invite' | 'Confirmed' | 'Declined'
  invited_at:   string
  responded_at: string | null
}

interface RecommendationPanelProps {
  candidates:          TrainerPoint[]
  engagementId:        string | null
  selectedIds:         Set<string>
  onToggleSelect:      (trainerId: string) => void
  onOpenReview:        () => void
  trainersNeeded:      number | null
  invitedTrainers:     InvitedTrainerStatus[]
  onRefreshStatus:     () => void
  isRefreshingStatus:  boolean
}

function ModeChip({ mode }: { mode: string }) {
  const styles: Record<string, { bg: string; text: string }> = {
    Road:   { bg: '#DCFCE7', text: '#166534' },
    Boat:   { bg: '#FFF7ED', text: '#9A3412' },
    Flight: { bg: '#EDE9FE', text: '#5B21B6' },
  }
  const s = styles[mode] ?? { bg: '#F1F5F9', text: '#475569' }
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 9,
        fontWeight: 700,
        padding: '1px 6px',
        borderRadius: 99,
        background: s.bg,
        color: s.text,
        letterSpacing: '0.3px',
      }}
    >
      {mode}
    </span>
  )
}

function InvitedTrainerRow({ trainer }: { trainer: InvitedTrainerStatus }) {
  const pill = trainer.status === 'Confirmed'
    ? { text: '✓ Accepted', color: '#0F766E' }
    : trainer.status === 'Declined'
    ? { text: '✗ Declined', color: '#B91C1C' }
    : { text: '⏳ Awaiting', color: '#92400E' }
  return (
    <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #F1F5F9' }}>
      <span style={{ fontSize: 11, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {trainer.trainer_name}
      </span>
      <span style={{ fontSize: 10, fontWeight: 700, color: pill.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
        {pill.text}
      </span>
    </div>
  )
}

export function RecommendationPanel({
  candidates, engagementId, selectedIds, onToggleSelect, onOpenReview, trainersNeeded,
  invitedTrainers, onRefreshStatus, isRefreshingStatus,
}: RecommendationPanelProps) {
  const { t } = useLanguage()

  if (candidates.length === 0 && invitedTrainers.length === 0) return null

  const confirmedCount = invitedTrainers.filter(inv => inv.status === 'Confirmed').length

  return (
    <div
      className="pointer-events-auto"
      style={{
        position: 'absolute',
        right: 16,
        top: 112,   // clear the Mode B indicator + geolocate buttons
        bottom: 176, // clear the radius slider (bottom-8 + ~136px card height)
        zIndex: 999,
        width: 280,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: '#0E2F57',
          color: 'white',
          borderRadius: '12px 12px 0 0',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.3px' }}>
          {t.map.recommendations}
          {trainersNeeded != null && (
            <span style={{ fontWeight: 500, opacity: 0.75 }}> · {t.map.trainersNeeded}: {trainersNeeded}</span>
          )}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            background: '#12B5AC',
            color: 'white',
            borderRadius: 99,
            padding: '1px 8px',
          }}
        >
          {candidates.length}
        </span>
      </div>

      {/* Scrollable list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          background: 'rgba(255,255,255,0.97)',
          borderRadius: 0,
          boxShadow: '0 2px 0 rgba(14,47,87,0.06)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {candidates.map((c) => (
          <div
            key={c.trainer_id}
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid #F1F5F9',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              background: selectedIds.has(c.trainer_id) ? '#EFF6FF' : 'transparent',
            }}
          >
            {/* Checkbox */}
            <input
              type="checkbox"
              checked={selectedIds.has(c.trainer_id)}
              onChange={() => onToggleSelect(c.trainer_id)}
              disabled={!engagementId}
              style={{ marginTop: 2, width: 14, height: 14, flexShrink: 0, cursor: engagementId ? 'pointer' : 'not-allowed' }}
              aria-label={t.batchInvite.selectTrainers}
            />

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#0E2F57', lineHeight: 1.3 }}>
                {c.trainer_name}
              </p>
              {c.school_name && (
                <p style={{ margin: '2px 0 0', fontSize: 10, color: '#1E63C4', lineHeight: 1.3 }}>
                  {c.school_name}
                </p>
              )}
              {c.ppd_district && (
                <p style={{ margin: '2px 0 0', fontSize: 9, color: '#64748B', lineHeight: 1.2 }}>
                  PPD {c.ppd_district}
                </p>
              )}

              {/* Travel row */}
              {c.distance_km != null && (
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>
                    {c.distance_km.toFixed(1)} km
                  </span>
                  {(c.duration_min ?? 0) > 0 && (
                    <span style={{ fontSize: 9, color: '#94A3B8' }}>
                      {c.duration_min! >= 60
                        ? `${Math.floor(c.duration_min! / 60)}h ${c.duration_min! % 60}m`
                        : `${c.duration_min}m`}
                    </span>
                  )}
                  {c.transport_mode && <ModeChip mode={c.transport_mode} />}
                </div>
              )}

              {/* Cost row */}
              {c.cost_myr != null && (
                <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: (c.rank ?? 99) <= 3 ? '#92400E' : '#0F766E' }}>
                    RM {c.cost_myr.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span style={{ fontSize: 9, color: '#94A3B8' }}>{t.map.costRoundTrip}</span>
                  {c.cost_source === 'llm' && (
                    <span
                      style={{
                        fontSize: 8,
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: 99,
                        background: '#FEF3C7',
                        color: '#92400E',
                        border: '1px solid #F59E0B',
                      }}
                    >
                      {t.map.costSourceEstimate}
                    </span>
                  )}
                </div>
              )}
              {/* Flight alternative */}
              {(c.travel_options ?? [])
                .filter((o: TravelOption) => o.mode !== c.transport_mode && o.cost_myr > 0)
                .map((alt: TravelOption) => (
                  <div key={alt.mode} style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{
                      fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 99,
                      background: alt.mode === 'Flight' ? '#EDE9FE' : '#FFF7ED',
                      color: alt.mode === 'Flight' ? '#5B21B6' : '#9A3412',
                    }}>
                      {alt.mode === 'Flight' ? '✈' : '⛵'} alt
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#64748B' }}>
                      RM {alt.cost_myr.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span style={{ fontSize: 8, color: '#94A3B8' }}>est.</span>
                  </div>
                ))
              }

            </div>
          </div>
        ))}

        {/* Invited trainers — live accept/decline status for this workshop */}
        {invitedTrainers.length > 0 && (
          <div style={{ borderTop: '2px solid #E2E8F0' }}>
            <div style={{ padding: '8px 12px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                {t.batchInvite.invitedTrainersLabel}
                {trainersNeeded != null && (
                  <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0F766E' }}> · {confirmedCount}/{trainersNeeded}</span>
                )}
              </span>
              <button
                onClick={onRefreshStatus}
                disabled={isRefreshingStatus}
                title={t.batchInvite.refreshStatus}
                aria-label={t.batchInvite.refreshStatus}
                style={{
                  fontSize: 12, lineHeight: 1, border: 'none', background: 'transparent',
                  color: '#64748B', cursor: isRefreshingStatus ? 'not-allowed' : 'pointer',
                  opacity: isRefreshingStatus ? 0.5 : 1, padding: 2,
                }}
              >
                ↻
              </button>
            </div>
            {invitedTrainers.map(inv => (
              <InvitedTrainerRow key={inv.trainer_id} trainer={inv} />
            ))}
          </div>
        )}

        {/* Engagement ref */}
        {engagementId && (
          <div style={{ padding: '6px 12px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0' }}>
            <p style={{ margin: 0, fontSize: 8, color: '#94A3B8', fontWeight: 500 }}>
              {t.map.engagementRef}: <span style={{ fontFamily: 'monospace', letterSpacing: '0.3px' }}>{engagementId.slice(0, 8)}…</span>
            </p>
          </div>
        )}
      </div>

      {/* Batch invite action bar (appears once something is selected) */}
      {selectedIds.size > 0 && (
        <div
          style={{
            padding: '8px 12px',
            background: '#0E2F57',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 700, color: 'white' }}>
            {selectedIds.size} {t.batchInvite.selectedLabel}
          </span>
          <button
            onClick={onOpenReview}
            style={{
              fontSize: 10, fontWeight: 700, color: '#0E2F57', background: '#12B5AC',
              border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t.batchInvite.finalizeAndInviteSelected} →
          </button>
        </div>
      )}

      {/* Disclaimer footer */}
      <div
        style={{
          padding: '8px 12px',
          background: '#FFFBEB',
          border: '1px solid #FDE68A',
          borderTop: 'none',
          borderRadius: '0 0 12px 12px',
          boxShadow: '0 4px 16px rgba(14,47,87,0.18)',
        }}
      >
        <p style={{ margin: 0, fontSize: 8.5, color: '#78716C', lineHeight: 1.55 }}>
          <span style={{ fontWeight: 700, color: '#92400E' }}>Note: </span>
          Travel cost estimates are indicative and for planning reference only. Figures are derived from standard government rate schedules and available route data at the time of search. Actual costs may vary — users must verify with the relevant finance or logistics officer and obtain required approvals before committing any expenditure.
        </p>
      </div>
    </div>
  )
}
