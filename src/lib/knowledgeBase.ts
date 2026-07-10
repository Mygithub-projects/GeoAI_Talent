// Knowledge-base retrieval for Lexi (Phase 7).
// Current implementation: fetch-and-rank in JS — the KB holds a few dozen
// curated FAQ/glossary/policy rows, so client-side term scoring is exact,
// deterministic, and needs no SQL extensions. The interface is deliberately
// small so this can be swapped for Postgres FTS or pgvector retrieval later
// without touching the orchestrator.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface KBHit {
  doc_id:  string
  title:   string
  content: string
  score:   number
}

interface KBRow {
  doc_id:     string
  title_en:   string | null
  title_bm:   string | null
  content_en: string | null
  content_bm: string | null
  tags:       string[] | null
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9À-ɏ]+/)
    .filter(t => t.length > 2)
}

export async function searchKnowledgeBase(
  client: SupabaseClient,
  query: string,
  locale: 'en' | 'bm',
  limit = 3,
): Promise<KBHit[]> {
  const { data } = await client
    .from('knowledge_base')
    .select('doc_id, title_en, title_bm, content_en, content_bm, tags')

  const rows = (data ?? []) as KBRow[]
  if (rows.length === 0) return []

  const terms = tokenize(query)
  if (terms.length === 0) return []

  const scored = rows.map(row => {
    const title   = (locale === 'bm' ? row.title_bm : row.title_en) ?? row.title_en ?? ''
    const content = (locale === 'bm' ? row.content_bm : row.content_en) ?? row.content_en ?? ''
    // Score against BOTH languages so an EN query still finds a BM-tagged doc
    const haystackTitle = `${row.title_en ?? ''} ${row.title_bm ?? ''}`.toLowerCase()
    const haystackBody  = `${row.content_en ?? ''} ${row.content_bm ?? ''}`.toLowerCase()
    const haystackTags  = (row.tags ?? []).join(' ').toLowerCase()

    let score = 0
    for (const term of terms) {
      if (haystackTitle.includes(term)) score += 3
      if (haystackTags.includes(term))  score += 2
      if (haystackBody.includes(term))  score += 1
    }
    return { doc_id: row.doc_id, title, content, score }
  })

  return scored
    .filter(h => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
