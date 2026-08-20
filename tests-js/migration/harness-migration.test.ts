import { strict as assert } from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

import { test } from 'vitest'

import {
  classifyProviderError,
  ProviderError,
  type ProviderErrorCategory,
} from '../../packages/chat-provider-interface/src/index'
import {
  PERSISTENCE_SCHEMA_VERSION,
  type SessionMessage,
  validateSessionMessages,
} from '../../packages/data-layer/src/contracts'
import {
  executeHarness,
  type HarnessEvent,
  type HarnessMessage,
  type HarnessProvider,
  HarnessProviderError,
  type HarnessProviderResult,
  type HarnessRequest,
} from '../../packages/harness/src/index'

type RoundtripFixture = {
  requestId: string
  sessionId: string
  model: string
  messages: HarnessMessage[]
  tools: { name: string; policy: 'allow' }[]
  providerResponses: HarnessProviderResult[]
  expectedProviderMessages: HarnessMessage[][]
  expectedToolExecutions: {
    id: string
    name: string
    arguments: Record<string, string>
    result: string
  }[]
  expectedUsage: {
    providerTotals: number[]
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  persistedMessages: SessionMessage[]
}

type FailureFixture = {
  requestId: string
  sessionId: string
  model: string
  messages: HarnessMessage[]
  tools: []
  retry: {
    retryPolicy: { maxAttempts: number; backoffMs: number }
    expectedSleepMs: number[]
    expectedEvents: string[]
    expectedRetry: { providerIndex: number; attempt: number; delayMs: number }
    expectedTerminal: string
    expectedProviderCalls: number
  }
  cancellation: {
    expectedEvents: string[]
    expectedTerminal: string
    expectedTerminalCount: number
  }
  classification: {
    category: ProviderErrorCategory
    message: string
    statusCode?: number
    retryable: boolean
  }[]
  diagnostics: {
    syntheticSecret: string
    redactedMessage: string
    expected: {
      category: ProviderErrorCategory
      retryable: boolean
      message: string
      statusCode: number
      requestId: string
    }
  }
}

function fixture<T>(name: string): T {
  const file = path.join(import.meta.dirname, 'fixtures', name)

  return JSON.parse(fs.readFileSync(file, 'utf8')) as T
}

function requestBase(
  fixtureData: Pick<RoundtripFixture, 'requestId' | 'sessionId' | 'model' | 'messages' | 'tools'>,
  provider: HarnessProvider,
  overrides: Partial<HarnessRequest> = {},
): HarnessRequest {
  let eventNumber = 0

  return {
    requestId: fixtureData.requestId,
    sessionId: fixtureData.sessionId,
    model: fixtureData.model,
    messages: fixtureData.messages,
    tools: fixtureData.tools,
    provider,
    clock: { now: () => 1_700_000_000_000 },
    sleeper: { sleep: async () => undefined },
    idGenerator: kind => `${kind}-synthetic-${++eventNumber}`,
    ...overrides,
  }
}

test('round-trip preserves exact provider message roles, order, and tool correlation', async () => {
  const data = fixture<RoundtripFixture>('turn-roundtrip.json')
  const requests: HarnessMessage[][] = []
  const executions: RoundtripFixture['expectedToolExecutions'] = []
  let providerCall = 0

  const result = await executeHarness(requestBase(data, {
    async complete(request) {
      requests.push([...request.messages])
      const response = data.providerResponses[providerCall]
      providerCall += 1
      assert.ok(response)

      return response
    },
  }, {
    toolExecutor: async execution => {
      const result = `${execution.call.name === 'first_tool' ? 'first' : 'second'} result`
      executions.push({
        id: execution.call.id,
        name: execution.call.name,
        arguments: execution.arguments as Record<string, string>,
        result,
      })

      return { content: result }
    },
  }))

  assert.equal(result.outcome, 'completed')
  assert.deepEqual(requests, data.expectedProviderMessages)
  assert.deepEqual(executions, data.expectedToolExecutions)

  const persisted = validateSessionMessages(data.persistedMessages, data.sessionId)
  assert.deepEqual(persisted, { valid: true })
  assert.equal(data.persistedMessages[0]?.schemaVersion, PERSISTENCE_SCHEMA_VERSION)
  assert.deepEqual(
    data.persistedMessages.slice(1).map(message => message.toolResult?.toolCallId),
    ['call-first-001', 'call-second-001'],
  )
})

test('round-trip accounts for usage from every provider response', async () => {
  const data = fixture<RoundtripFixture>('turn-roundtrip.json')
  const usages: { inputTokens: number; outputTokens: number; totalTokens: number }[] = []
  let providerCall = 0

  const result = await executeHarness(requestBase(data, {
    async complete() {
      const response = data.providerResponses[providerCall]
      providerCall += 1
      assert.ok(response)

      return response
    },
  }, {
    toolExecutor: async execution => ({
      content: execution.call.name === 'first_tool' ? 'first result' : 'second result',
    }),
    eventSink: event => {
      if (event.type === 'provider.completed') {usages.push(event.usage as typeof usages[number])}
    },
  }))

  assert.equal(result.outcome, 'completed')
  assert.deepEqual(usages.map(usage => usage.totalTokens), data.expectedUsage.providerTotals)
  assert.deepEqual(usages.reduce((sum, usage) => sum + usage.inputTokens, 0), data.expectedUsage.inputTokens)
  assert.deepEqual(usages.reduce((sum, usage) => sum + usage.outputTokens, 0), data.expectedUsage.outputTokens)
  assert.deepEqual(usages.reduce((sum, usage) => sum + usage.totalTokens, 0), data.expectedUsage.totalTokens)
})

test('retryable failure retries before terminal failure, while classification stays explicit', async () => {
  const data = fixture<FailureFixture>('failure-lifecycle.json')
  const events: HarnessEvent[] = []
  const sleeps: number[] = []
  let primaryCalls = 0

  const result = await executeHarness(requestBase(data, {
    async complete() {
      primaryCalls += 1
      throw new HarnessProviderError('Synthetic overload', { category: 'overloaded' })
    },
  }, {
    retryPolicy: data.retry.retryPolicy,
    sleeper: { sleep: async milliseconds => { sleeps.push(milliseconds) } },
    eventSink: event => { events.push(event) },
  }))

  assert.equal(result.outcome, data.retry.expectedTerminal)
  assert.deepEqual(events.map(event => event.type), data.retry.expectedEvents)
  assert.deepEqual(sleeps, data.retry.expectedSleepMs)
  assert.equal(primaryCalls, data.retry.expectedProviderCalls)

  const retry = events.find(event => event.type === 'retry.scheduled')
  assert.ok(retry?.type === 'retry.scheduled')
  assert.deepEqual(
    { providerIndex: retry.providerIndex, attempt: retry.attempt, delayMs: retry.delayMs },
    data.retry.expectedRetry,
  )

  for (const expected of data.classification) {
    const error = new ProviderError(expected.message, {
      category: expected.category,
      ...(expected.statusCode === undefined ? {} : { statusCode: expected.statusCode }),
    })

    const classified = classifyProviderError(error)
    assert.equal(classified.category, expected.category)
    assert.equal(classified.retryable, expected.retryable)
    assert.equal(classified.message, expected.message)
  }
})

test('cancellation emits one terminal event and propagates abort to provider', async () => {
  const data = fixture<FailureFixture>('failure-lifecycle.json')
  const events: HarnessEvent[] = []
  const controller = new AbortController()
  let observedAbort = false

  const result = await executeHarness(requestBase(data, {
    async complete(request) {
      request.signal.addEventListener('abort', () => { observedAbort = true }, { once: true })
      controller.abort()
      const error = new Error('Synthetic cancellation')
      error.name = 'AbortError'
      throw error
    },
  }, {
    signal: controller.signal,
    eventSink: event => { events.push(event) },
  }))

  assert.equal(result.outcome, data.cancellation.expectedTerminal)
  assert.deepEqual(events.map(event => event.type), data.cancellation.expectedEvents)
  assert.equal(events.filter(event => event.type === 'terminal').length, data.cancellation.expectedTerminalCount)
  assert.equal(observedAbort, true)
})

test('classified diagnostics retain redaction and synthetic secrets never enter output', () => {
  const data = fixture<FailureFixture>('failure-lifecycle.json')

  const diagnostics = new ProviderError(data.diagnostics.redactedMessage, {
    category: data.diagnostics.expected.category,
    statusCode: data.diagnostics.expected.statusCode,
    requestId: data.diagnostics.expected.requestId,
  })

  const classified = classifyProviderError(diagnostics)
  assert.deepEqual(classified, data.diagnostics.expected)
  assert.equal(JSON.stringify(classified).includes(data.diagnostics.syntheticSecret), false)
  assert.equal(JSON.stringify(classified).includes('authorization=***'), true)
})
