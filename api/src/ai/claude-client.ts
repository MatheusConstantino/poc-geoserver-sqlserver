import Anthropic from '@anthropic-ai/sdk'
import type { ZodSchema } from 'zod'

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new AiConfigError('ANTHROPIC_API_KEY is not set')
    _client = new Anthropic({ apiKey })
  }
  return _client
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------
export class AiConfigError       extends Error { readonly code = 'AI_NOT_CONFIGURED'   }
export class AiRateLimitError    extends Error { readonly code = 'AI_RATE_LIMITED'      ; readonly retryAfter: number
  constructor(retryAfter: number) { super('Claude API rate limit hit'); this.retryAfter = retryAfter }
}
export class AiUpstreamError     extends Error { readonly code = 'AI_UPSTREAM_ERROR'    }
export class AiInvalidResponse   extends Error { readonly code = 'AI_INVALID_RESPONSE'  ; readonly raw: string
  constructor(raw: string, cause?: unknown) { super('Claude returned an invalid JSON structure'); this.raw = raw; this.cause = cause }
}
export class AiTimeoutError      extends Error { readonly code = 'AI_TIMEOUT'           }
export class AiRequestTooLarge   extends Error { readonly code = 'REQUEST_TOO_LARGE'    }

// ---------------------------------------------------------------------------
// Core ask function
// ---------------------------------------------------------------------------
const MODEL   = 'claude-sonnet-4-6'
const MAX_TOKENS = 1024
const TIMEOUT_MS = 30_000
const MAX_BODY_BYTES = 50_000

export async function ask<T>(
  systemPrompt: string,
  userMessage:  string,
  schema:       ZodSchema<T>,
): Promise<{ result: T; usage: { input_tokens: number; output_tokens: number } }> {
  // Guard: request size
  const bodySize = Buffer.byteLength(userMessage, 'utf8')
  if (bodySize > MAX_BODY_BYTES) {
    throw new AiRequestTooLarge(`Request body ${bodySize} bytes exceeds 50 kB limit`)
  }

  const client = getClient()

  const attemptOnce = async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await client.messages.create(
        {
          model:      MODEL,
          max_tokens: MAX_TOKENS,
          system:     systemPrompt,
          messages:   [{ role: 'user', content: userMessage }],
        },
        { signal: controller.signal as AbortSignal },
      )
      return response
    } finally {
      clearTimeout(timer)
    }
  }

  let response: Awaited<ReturnType<typeof attemptOnce>>

  try {
    response = await attemptOnce()
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      if (err.status === 429) {
        const retryAfter = Number(err.headers?.['retry-after'] ?? 5)
        // One retry after the suggested wait
        await sleep(retryAfter * 1000)
        try {
          response = await attemptOnce()
        } catch (retryErr) {
          if (retryErr instanceof Anthropic.APIError && retryErr.status === 429) {
            throw new AiRateLimitError(retryAfter)
          }
          throw new AiUpstreamError(String(retryErr))
        }
      } else if ((err.status ?? 0) >= 500) {
        throw new AiUpstreamError(`Claude API ${err.status}: ${err.message}`)
      } else {
        throw err
      }
    } else if ((err as Error).name === 'AbortError') {
      throw new AiTimeoutError(`Claude API timed out after ${TIMEOUT_MS}ms`)
    } else {
      throw err
    }
  }

  // Extract text content
  const block = response.content.find(b => b.type === 'text')
  const raw   = block?.type === 'text' ? block.text.trim() : ''

  // Strip markdown code fences if present
  const jsonText = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new AiInvalidResponse(raw, 'JSON.parse failed')
  }

  const validated = schema.safeParse(parsed)
  if (!validated.success) {
    throw new AiInvalidResponse(raw, validated.error)
  }

  return {
    result: validated.data,
    usage:  {
      input_tokens:  response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  }
}

// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
/** Resets the Anthropic singleton. Only for unit tests — do not use in production. */
export function __resetForTests(): void {
  _client = null
}
