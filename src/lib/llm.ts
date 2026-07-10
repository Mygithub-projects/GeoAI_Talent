// Provider-agnostic LLM client (OpenAI-compatible).
// Current provider: Groq. Swap by setting LLM_PROVIDER / LLM_BASE_URL / LLM_MODEL in env.
// Supports key rotation: GROQ_API_KEY (main) → GROQ_API_KEY_2 → GROQ_API_KEY_3 on 429.
// All LLM calls in this project go through this wrapper — never call provider APIs directly.

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

const BASE_DELAY_MS = 1000

function getGroqKeys(): string[] {
  return [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
  ].filter((k): k is string => Boolean(k))
}

export async function llm(messages: Message[], opts: LLMOptions = {}): Promise<string> {
  const provider = process.env.LLM_PROVIDER ?? 'groq'
  const baseUrl  = process.env.LLM_BASE_URL ?? 'https://api.groq.com/openai/v1'
  const model    = opts.model ?? process.env.LLM_MODEL ?? 'llama-3.3-70b-versatile'

  const keys =
    provider === 'anthropic'
      ? [process.env.ANTHROPIC_API_KEY].filter((k): k is string => Boolean(k))
      : getGroqKeys()

  if (keys.length === 0) {
    throw new Error(`LLM API key not configured for provider: ${provider}`)
  }

  // Try each key in order on 429. After all keys are exhausted, back off and retry once.
  const ROUNDS = 2
  for (let round = 0; round < ROUNDS; round++) {
    for (let ki = 0; ki < keys.length; ki++) {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${keys[ki]}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: opts.temperature ?? 0.3,
          max_tokens:  opts.maxTokens  ?? 512,
        }),
      })

      if (res.status === 429) {
        // Rate limited on this key — try the next key immediately
        if (ki < keys.length - 1) continue
        // All keys exhausted this round — exponential back-off before next round
        const delay = BASE_DELAY_MS * Math.pow(2, round)
        await new Promise(r => setTimeout(r, delay))
        break
      }

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`LLM API error ${res.status}: ${body}`)
      }

      const data = await res.json()
      return (data.choices[0].message.content as string).trim()
    }
  }

  throw new Error(`LLM: all ${keys.length} key(s) rate-limited after ${ROUNDS} rounds`)
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
  const provider = process.env.LLM_PROVIDER ?? 'groq'
  const baseUrl  = process.env.LLM_BASE_URL ?? 'https://api.groq.com/openai/v1'
  const model    = opts.model ?? process.env.LLM_MODEL ?? 'llama-3.3-70b-versatile'

  const keys =
    provider === 'anthropic'
      ? [process.env.ANTHROPIC_API_KEY].filter((k): k is string => Boolean(k))
      : getGroqKeys()

  if (keys.length === 0) {
    throw new Error(`LLM API key not configured for provider: ${provider}`)
  }

  const ROUNDS = 2
  // llama models occasionally emit a malformed tool-call token stream that
  // Groq rejects with 400 `tool_use_failed`; it is stochastic and normally
  // succeeds on retry, so retry a couple of times before giving up.
  let toolUseRetries = 0
  for (let round = 0; round < ROUNDS; round++) {
    for (let ki = 0; ki < keys.length; ki++) {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${keys[ki]}`,
        },
        body: JSON.stringify({
          model,
          messages,
          ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
          temperature: opts.temperature ?? 0.3,
          max_tokens:  opts.maxTokens  ?? 1024,
        }),
      })

      if (res.status === 429) {
        if (ki < keys.length - 1) continue
        const delay = BASE_DELAY_MS * Math.pow(2, round)
        await new Promise(r => setTimeout(r, delay))
        break
      }

      if (!res.ok) {
        const body = await res.text()
        if (res.status === 400 && body.includes('tool_use_failed')) {
          // The model DID choose a tool but emitted it in a malformed token
          // stream. Groq includes the raw attempt in `failed_generation` —
          // recover the intended call from it instead of failing the turn.
          const recovered = recoverToolCall(body)
          if (recovered) return { content: null, tool_calls: [recovered] }
          if (toolUseRetries < 2) {
            toolUseRetries++
            ki--          // retry the same key with the same request
            continue
          }
        }
        throw new Error(`LLM API error ${res.status}: ${body}`)
      }

      const data = await res.json()
      const msg  = data.choices[0].message as { content?: string | null; tool_calls?: ToolCall[] }
      return {
        content:    msg.content ?? null,
        tool_calls: msg.tool_calls ?? [],
      }
    }
  }

  throw new Error(`LLM: all ${keys.length} key(s) rate-limited after ${ROUNDS} rounds`)
}

// Web-augmented answer via the Groq compound model (built-in web search).
// Used for Lexi's general-knowledge path — results are labelled as general
// knowledge in the UI and must never be used for system data (costs, logs,
// schedules, trainer counts).
export async function llmWebSearch(question: string, locale: string): Promise<string> {
  const model = process.env.LLM_SEARCH_MODEL ?? 'groq/compound-mini'
  return llm(
    [
      {
        role: 'system',
        content:
          'You are a helpful assistant for education officers in Sarawak, Malaysia. ' +
          'Answer concisely (under 200 words). ' +
          (locale === 'bm' ? 'Answer in Bahasa Melayu.' : 'Answer in English.'),
      },
      { role: 'user', content: question },
    ],
    { model, temperature: 0.3, maxTokens: 600 },
  )
}
