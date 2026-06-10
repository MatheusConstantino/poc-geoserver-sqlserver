import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Shared mocks — vi.hoisted ensures they exist before module loading
// ---------------------------------------------------------------------------
const mockCreate = vi.hoisted(() => vi.fn())

const MockAPIError = vi.hoisted(() => {
  class MockAPIError extends Error {
    status: number
    headers: Record<string, string>
    constructor(status: number, message: string, headers: Record<string, string> = {}) {
      super(message)
      this.name = 'APIError'
      this.status = status
      this.headers = headers
    }
  }
  return MockAPIError
})

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    static APIError = MockAPIError
    messages = { create: mockCreate }
  },
}))

import {
  ask,
  __resetForTests,
  AiConfigError,
  AiRequestTooLarge,
  AiInvalidResponse,
  AiUpstreamError,
  AiRateLimitError,
  AiTimeoutError,
} from './claude-client.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const SimpleSchema = z.object({ value: z.string() })

function mockResponse(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    usage: { input_tokens: 10, output_tokens: 5 },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ask()', () => {
  beforeEach(() => {
    __resetForTests()
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test-key')
    mockCreate.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // -------------------------------------------------------------------------
  describe('request guards (before SDK call)', () => {
    it('throws AiConfigError when ANTHROPIC_API_KEY is not set', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', '')
      await expect(ask('sys', 'user', SimpleSchema))
        .rejects.toBeInstanceOf(AiConfigError)
    })

    it('throws AiRequestTooLarge when body exceeds 50 kB', async () => {
      const huge = 'x'.repeat(51_000)
      await expect(ask('sys', huge, SimpleSchema))
        .rejects.toBeInstanceOf(AiRequestTooLarge)
    })
  })

  // -------------------------------------------------------------------------
  describe('happy path', () => {
    it('returns validated result and token usage', async () => {
      mockCreate.mockResolvedValue(mockResponse(JSON.stringify({ value: 'hello' })))
      const { result, usage } = await ask('sys', 'user', SimpleSchema)
      expect(result).toEqual({ value: 'hello' })
      expect(usage).toEqual({ input_tokens: 10, output_tokens: 5 })
    })

    it('strips markdown code fences before parsing', async () => {
      const fenced = '```json\n{"value":"stripped"}\n```'
      mockCreate.mockResolvedValue(mockResponse(fenced))
      const { result } = await ask('sys', 'user', SimpleSchema)
      expect(result).toEqual({ value: 'stripped' })
    })
  })

  // -------------------------------------------------------------------------
  describe('error handling', () => {
    it('throws AiInvalidResponse when response is not valid JSON', async () => {
      mockCreate.mockResolvedValue(mockResponse('not json'))
      await expect(ask('sys', 'user', SimpleSchema))
        .rejects.toBeInstanceOf(AiInvalidResponse)
    })

    it('throws AiInvalidResponse when JSON does not match the Zod schema', async () => {
      mockCreate.mockResolvedValue(mockResponse(JSON.stringify({ wrong: 'field' })))
      await expect(ask('sys', 'user', SimpleSchema))
        .rejects.toBeInstanceOf(AiInvalidResponse)
    })

    it('throws AiUpstreamError on HTTP 5xx from Claude', async () => {
      mockCreate.mockRejectedValue(new MockAPIError(503, 'Service unavailable'))
      await expect(ask('sys', 'user', SimpleSchema))
        .rejects.toBeInstanceOf(AiUpstreamError)
    })

    it('throws AiTimeoutError when the request is aborted', async () => {
      const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' })
      mockCreate.mockRejectedValue(abortErr)
      await expect(ask('sys', 'user', SimpleSchema))
        .rejects.toBeInstanceOf(AiTimeoutError)
    })

    it('retries once on 429 and throws AiRateLimitError on second failure', async () => {
      // retry-after: 0 so sleep(0ms) is instant — no fake timers needed
      const rateLimit = new MockAPIError(429, 'Rate limited', { 'retry-after': '0' })
      mockCreate.mockRejectedValue(rateLimit)

      await expect(ask('sys', 'user', SimpleSchema))
        .rejects.toBeInstanceOf(AiRateLimitError)

      // One original attempt + one retry = two SDK calls total
      expect(mockCreate).toHaveBeenCalledTimes(2)
    })
  })
})
