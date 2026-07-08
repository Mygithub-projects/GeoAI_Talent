'use client'

import { useLanguage } from '@/i18n/LanguageProvider'

interface SkillSubject {
  item_id: number
  type:    string
  name_en: string
  name_bm: string
}

interface SkillCheckboxFilterProps {
  skills:      SkillSubject[]
  selectedIds: number[]
  onChange:    (ids: number[]) => void
}

export function localizeSkillName(name: string, locale: string): string {
  if (locale === 'en') return name.replace(/\bTMK\b/gi, 'ICT')
  if (locale === 'bm') return name.replace(/\bICT\b/gi, 'TMK')
  return name
}

export function SkillCheckboxFilter({ skills, selectedIds, onChange }: SkillCheckboxFilterProps) {
  const { t, locale } = useLanguage()

  const grouped = {
    SKILL:   skills.filter(s => s.type === 'SKILL'),
    SUBJECT: skills.filter(s => s.type === 'SUBJECT'),
  }

  const nameOf = (s: SkillSubject) => {
    const raw = locale === 'en' ? s.name_en : (s.name_bm || s.name_en)
    return localizeSkillName(raw, locale)
  }

  const toggle = (id: number) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter(i => i !== id)
        : [...selectedIds, id],
    )
  }

  const hasSelection = selectedIds.length > 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#94a3b8' }}>
          {t.map.filterBySkill}
        </p>
        {hasSelection && (
          <button
            onClick={() => onChange([])}
            style={{ fontSize: 9, color: '#1E63C4', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px' }}
          >
            {t.map.clearCentre} ({selectedIds.length})
          </button>
        )}
      </div>

      <div style={{
        border: '1px solid #E2E8F0',
        borderRadius: 8,
        background: 'white',
        maxHeight: 240,
        overflowY: 'auto',
      }}>
        {grouped.SKILL.length > 0 && (
          <>
            <div style={{
              position: 'sticky', top: 0,
              padding: '4px 10px 3px',
              background: '#F6F8FB',
              borderBottom: '1px solid #F1F5F9',
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8',
            }}>
              {t.map.skillsGroup}
            </div>
            {grouped.SKILL.map(s => (
              <label
                key={s.item_id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 10px', cursor: 'pointer',
                  borderBottom: '1px solid #F8FAFC',
                  fontSize: 11, color: '#15233A',
                  background: selectedIds.includes(s.item_id) ? '#EFF6FF' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(s.item_id)}
                  onChange={() => toggle(s.item_id)}
                  style={{ accentColor: '#1E63C4', width: 12, height: 12, cursor: 'pointer' }}
                />
                {nameOf(s)}
              </label>
            ))}
          </>
        )}

        {grouped.SUBJECT.length > 0 && (
          <>
            <div style={{
              position: 'sticky', top: 0,
              padding: '4px 10px 3px',
              background: '#F6F8FB',
              borderBottom: '1px solid #F1F5F9',
              borderTop: grouped.SKILL.length > 0 ? '1px solid #E2E8F0' : undefined,
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8',
            }}>
              {t.map.subjectsGroup}
            </div>
            {grouped.SUBJECT.map(s => (
              <label
                key={s.item_id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 10px', cursor: 'pointer',
                  borderBottom: '1px solid #F8FAFC',
                  fontSize: 11, color: '#15233A',
                  background: selectedIds.includes(s.item_id) ? '#EFF6FF' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(s.item_id)}
                  onChange={() => toggle(s.item_id)}
                  style={{ accentColor: '#1E63C4', width: 12, height: 12, cursor: 'pointer' }}
                />
                {nameOf(s)}
              </label>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
