// Provider-agnostic LLM client (OpenAI-compatible).
// Current provider: Groq. Swap by setting LLM_PROVIDER / LLM_BASE_URL / LLM_MODEL in env.
// Supports key rotation: GROQ_API_KEY (main) → GROQ_API_KEY_2 → GROQ_API_KEY_3 on 429,
// and skips a key the provider rejects (401/403) instead of failing the request.
// All LLM calls in this project go through this wrapper — never call provider APIs directly.
// (Exception: Lexi's general-knowledge answers go to Gemini via src/lib/gemini.ts.)

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// OpenAI-compatible tool-use types (subset used by the Lexi orchestrator)
export interface ToolDefinition {
  type: 'function'
  function: {
    name:        string
    description: string
    parameters:  Record<string, unknown>   // JSON Schema
  }
}

export interface ToolCall {
  id:   string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ChatResult {
  content:    string | null
  tool_calls: ToolCall[]
}

interface LLMOptions {
  model?: string
  temperature?: number
  maxTokens?: number
}

// Thrown when every key is rate-limited and the provider's retry-after is
// longer than we are willing to make a user wait. Callers can show a
// "busy, try again in a minute" message instead of a generic error.
export class LLMBusyError extends Error {
  constructor(message = 'LLM: rate-limited on every key') {
    super(message)
    this.name = 'LLMBusyError'
  }
}

const BASE_DELAY_MS = 1000
const MAX_WAIT_MS   = 8000   // longest single wait for a rate limit to clear
const ROUNDS        = 2

// Fallback when LLM_MODEL is unset. Groq retires models without much notice
// (llama-3.3-70b-versatile / llama-3.1-8b-instant / groq/compound* were all
// gone by 2026-10-08) — a sudden `model_not_found` means update the env
// model id, not the code.
const DEFAULT_MODEL = 'openai/gpt-oss-120b'

function getGroqKeys(): string[] {
  return [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
  ].filter((k): k is string => Boolean(k))
}

function providerConfig(opts: LLMOptions) {
  const provider = process.env.LLM_PROVIDER ?? 'groq'
  const baseUrl  = process.env.LLM_BASE_URL ?? 'https://api.groq.com/openai/v1'
  const model    = opts.model ?? process.env.LLM_MODEL ?? DEFAULT_MODEL
  const keys =
    provider === 'anthropic'
      ? [process.env.ANTHROPIC_API_KEY].filter((k): k is string => Boolean(k))
      : getGroqKeys()
  if (keys.length === 0) {
    throw new Error(`LLM API key not configured for provider: ${provider}`)
  }
  // Groq's free tier caps EACH model separately (per minute AND 200k tokens
  // per day, shared by all our keys), so when the main model is exhausted the
  // smaller one still has its own allowance. Same provider, same data handling.
  const fallback = provider === 'groq' ? (process.env.LLM_MODEL_FAST || 'openai/gpt-oss-20b') : undefined
  const models = [...new Set([model, fallback].filter((m): m is string => Boolean(m)))]
  return { baseUrl, models, keys }
}

// Try each model in turn when the previous one is rate-limited on every key.
async function completeWithFallback(
  baseUrl: string,
  keys: string[],
  models: string[],
  build: (model: string) => Record<string, unknown>,
): Promise<{ res: Response; model: string }> {
  let busy: LLMBusyError | undefined
  for (let i = 0; i < models.length; i++) {
    try {
      return { res: await postCompletion(baseUrl, keys, build(models[i])), model: models[i] }
    } catch (err) {
      if (!(err instanceof LLMBusyError)) throw err
      busy = err
      if (i < models.length - 1) console.warn(`[llm] ${models[i]} rate-limited — falling back to ${models[i + 1]}`)
    }
  }
  throw busy ?? new LLMBusyError()
}

// gpt-oss spends hidden "reasoning" tokens that count against both max_tokens
// and the per-minute quota; low effort is plenty for Lexi's short replies.
function modelExtras(model: string): Record<string, unknown> {
  return model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}
}

// Seconds the provider asks us to wait, from Retry-After (may be fractional).
function retryAfterMs(res: Response): number {
  const s = parseFloat(res.headers.get('retry-after') ?? '')
  return Number.isFinite(s) && s > 0 ? Math.ceil(s * 1000) : 0
}

// Token counts only — never message content.
function logUsage(model: string, usage: unknown) {
  const u = usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined
  if (u) console.log(`[llm] usage model=${model} prompt=${u.prompt_tokens} completion=${u.completion_tokens} total=${u.total_tokens}`)
}

// POST one chat-completion payload, rotating keys. Returns the first response
// that is neither a rejected key (401/403) nor a rate limit (429); the caller
// handles any other non-OK status. Throws LLMBusyError when rate-limited on
// every key beyond what we will wait for.
async function postCompletion(baseUrl: string, keys: string[], payload: Record<string, unknown>): Promise<Response> {
  for (let round = 0; round < ROUNDS; round++) {
    let usableKeys = 0
    let waitMs     = 0
    for (let ki = 0; ki < keys.length; ki++) {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys[ki]}` },
        body: JSON.stringify(payload),
      })
      if (res.status === 401 || res.status === 403) {
        console.warn(`[llm] API key #${ki + 1} rejected (HTTP ${res.status}) — skipping it`)
        continue
      }
      usableKeys++
      if (res.status === 429) {
        waitMs = Math.max(waitMs, retryAfterMs(res))
        // Groq's message states which limit was hit, with numbers only — no prompt content.
        const why = await res.text().then(b => (JSON.parse(b) as { error?: { message?: string } }).error?.message, () => undefined).catch(() => undefined)
        console.warn(`[llm] key #${ki + 1} rate-limited (retry-after ${retryAfterMs(res)}ms): ${why?.slice(0, 200) ?? '?'}`)
        continue
      }
      return res
    }
    if (usableKeys === 0) {
      throw new Error('LLM: every API key was rejected (401/403) — check the GROQ_API_KEY* values')
    }
    const delay = Math.max(waitMs, BASE_DELAY_MS * Math.pow(2, round))
    if (round === ROUNDS - 1 || delay > MAX_WAIT_MS) break
    await new Promise(r => setTimeout(r, delay))
  }
  throw new LLMBusyError()
}

export async function llm(messages: Message[], opts: LLMOptions = {}): Promise<string> {
  const { baseUrl, models, keys } = providerConfig(opts)

  const { res, model } = await completeWithFallback(baseUrl, keys, models, m => ({
    model: m,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens:  opts.maxTokens  ?? 512,
    ...modelExtras(m),
  }))
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`LLM API error ${res.status}: ${body}`)
  }

  const data = await res.json()
  logUsage(model, data.usage)
  return ((data.choices[0].message.content as string | null) ?? '').trim()
}

// Parse the intended tool call out of a Groq `tool_use_failed` error body,
// e.g. failed_generation: '<function=search_knowledge_base{"query": "x"}</function>'.
// Returns null when the payload can't be recovered safely.
function recoverToolCall(errorBody: string): ToolCall | null {
  try {
    const parsed = JSON.parse(errorBody) as { error?: { failed_generation?: string } }
    const failed = parsed.error?.failed_generation
    if (!failed) return null
    const m = failed.match(/<function=(\w+)\s*(\{[\s\S]*?\})\s*<?\/?function>?/) ??
              failed.match(/<function=(\w+)\s*(\{[\s\S]*\})/)
    if (!m) return null
    JSON.parse(m[2])   // validate the arguments are real JSON before accepting
    return {
      id:   `recovered-${Math.random().toString(36).slice(2, 10)}`,
      type: 'function',
      function: { name: m[1], arguments: m[2] },
    }
  } catch {
    return null
  }
}

// Tool-use variant for the Lexi orchestrator: accepts tool definitions and
// tool-result messages, returns the assistant message (content and/or
// tool_calls). Same provider config and key rotation as llm().
export async function llmChat(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  opts: LLMOptions = {},
): Promise<ChatResult> {
  const { baseUrl, models, keys } = providerConfig(opts)
  const build = (m: string) => ({
    model: m,
    messages,
    ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
    temperature: opts.temperature ?? 0.3,
    max_tokens:  opts.maxTokens  ?? 1024,
    ...modelExtras(m),
  })

  // Models (seen with llama) occasionally emit a malformed tool-call token
  // stream that Groq rejects with 400 `tool_use_failed`; it is stochastic and
  // normally succeeds on retry, so retry a couple of times before giving up.
  for (let attempt = 0; ; attempt++) {
    const { res, model } = await completeWithFallback(baseUrl, keys, models, build)

    if (!res.ok) {
      const body = await res.text()
      if (res.status === 400 && body.includes('tool_use_failed')) {
        // The model DID choose a tool but emitted it in a malformed token
        // stream. Groq includes the raw attempt in `failed_generation` —
        // recover the intended call from it instead of failing the turn.
        const recovered = recoverToolCall(body)
        if (recovered) return { content: null, tool_calls: [recovered] }
        if (attempt < 2) continue
      }
      throw new Error(`LLM API error ${res.status}: ${body}`)
    }

    const data = await res.json()
    logUsage(model, data.usage)
    const msg  = data.choices[0].message as { content?: string | null; tool_calls?: ToolCall[] }
    return {
      content:    msg.content ?? null,
      tool_calls: msg.tool_calls ?? [],
    }
  }
}
