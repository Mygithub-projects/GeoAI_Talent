// Gemini connector for Lexi's GENERAL-KNOWLEDGE answers only (2026-10-08).
//
// Split by sensitivity: everything about this system's data (trainers,
// workshops, costs, schedules) is answered on Groq from deterministic DB
// tools; only a cleaned, self-contained general question ever comes here —
// no chat history, no memory, no user name, no trainer data. The key is on
// Google's FREE tier, which may use prompts to improve Google's products,
// which is exactly why nothing sensitive may be passed in. The caller
// (assistantTools general_knowledge) scrubs and screens the question first.
//
// Google Search grounding is on, so answers can be current and carry sources.

export interface GeminiSource { title: string; url: string }
export interface GeminiAnswer  { text: string; sources: GeminiSource[] }

export class GeminiUnavailableError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'GeminiUnavailableError'
  }
}

const API_BASE      = 'https://generativelanguage.googleapis.com/v1beta'
// Stable release, not a preview that can vanish. Retired models mean
// changing GEMINI_MODEL in env, not this code.
const DEFAULT_MODEL = 'gemini-2.5-flash'
const TIMEOUT_MS    = 15_000
const MAX_SOURCES   = 3

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

export async function geminiGeneralAnswer(question: string, locale: 'en' | 'bm'): Promise<GeminiAnswer> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new GeminiUnavailableError('GEMINI_API_KEY not configured')
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL

  const generationConfig: Record<string, unknown> = { temperature: 0.3, maxOutputTokens: 700 }
  // 2.5 Flash "thinks" by default; those tokens count against the free quota
  // and add nothing for short factual answers. Other models keep their default.
  if (/^gemini-2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 }

  let res: Response
  try {
    res = await fetch(`${API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal:  AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text:
              'You answer general questions for education officers in Sarawak, Malaysia. ' +
              'Use Google Search when the question needs current or factual information. ' +
              'Answer concisely (under 150 words) in plain text — no markdown, no bold, no headers; ' +
              'a short numbered list is fine. ' +
              (locale === 'bm' ? 'Answer in Bahasa Melayu.' : 'Answer in English.'),
          }],
        },
        contents: [{ role: 'user', parts: [{ text: question }] }],
        tools: [{ google_search: {} }],
        generationConfig,
      }),
    })
  } catch (err) {
    throw new GeminiUnavailableError(`Gemini request failed: ${(err as Error).name}`)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new GeminiUnavailableError(`Gemini HTTP ${res.status}: ${body.slice(0, 300)}`, res.status)
  }

  const data = await res.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
      groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> }
    }>
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
  }
  const cand = data.candidates?.[0]
  // Lexi's bubble renders plain text, so drop any markdown the model still emits.
  const text = (cand?.content?.parts ?? []).map(p => p.text ?? '').join('')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[*-]\s+/gm, '• ')
    .trim()
  if (!text) throw new GeminiUnavailableError('Gemini returned no text')

  const seen = new Set<string>()
  const sources: GeminiSource[] = []
  for (const chunk of cand?.groundingMetadata?.groundingChunks ?? []) {
    const url = chunk.web?.uri
    if (!url || !/^https:\/\//.test(url) || seen.has(url)) continue
    seen.add(url)
    sources.push({ title: (chunk.web?.title || new URL(url).hostname).slice(0, 80), url })
    if (sources.length >= MAX_SOURCES) break
  }

  // Token counts only — never the question or the answer.
  const u = data.usageMetadata
  if (u) console.log(`[gemini] usage model=${model} prompt=${u.promptTokenCount} output=${u.candidatesTokenCount} total=${u.totalTokenCount}`)

  return { text, sources }
}
