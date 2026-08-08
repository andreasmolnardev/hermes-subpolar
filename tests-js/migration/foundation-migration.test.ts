import { strict as assert } from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { test } from 'vitest'

import {
  createRecordedResponseProvider,
  type ProviderContentPart,
  type ProviderRequest,
  type ProviderStreamEvent,
} from '../../packages/chat-provider-interface/src/index'
import type { SessionRecord } from '../../packages/data-layer/src/contracts'
import { SQLiteSessionRepository } from '../../packages/data-layer/src/sqlite'
import {
  executeHarness,
  type HarnessEvent,
  type HarnessMessage,
  type HarnessProvider,
  type HarnessRequest,
  type HarnessToolExecution,
} from '../../packages/harness/src/index'

type StreamFixture = {
  requestId: string
  model: string
  events: ProviderStreamEvent[]
  expectedContent: ProviderContentPart[]
  expectedReasoning: string
  expectedUsage: { inputTokens: number; outputTokens: number; totalTokens: number }
}

type PersistenceFixture = {
  requestId: string
  sessionId: string
  model: string
  seedMessage: { id: string; content: string; createdAt: string }
  tool: { name: string; callId: string; arguments: string; result: string }
  timestamps: { runtime: string; turn: string }
  expectedFirstRunRoles: string[]
  expectedRecoveredRoles: string[]
}

type ToolSafetyFixture = {
  requestId: string
  sessionId: string
  model: string
  toolName: string
  callId: string
  maxBytes: number
  oversizedOutput: string
  expectedBoundedOutput: string
  timeoutMs: number
  timeoutToolName: string
  timeoutCallId: string
}

type RecordedFixture = {
  requestId: string
  model: string
  events: ProviderStreamEvent[]
  expectedUsage: { inputTokens: number; outputTokens: number; totalTokens: number }
}

function fixture<T>(name: string): T {
  const file = path.join(import.meta.dirname, 'fixtures', name)

  return JSON.parse(fs.readFileSync(file, 'utf8')) as T
}

function harnessRequest(
  values: Pick<HarnessRequest, 'requestId' | 'sessionId' | 'model' | 'messages' | 'tools'>,
  provider: HarnessProvider,
  overrides: Partial<HarnessRequest> = {},
): HarnessRequest {
  let eventNumber = 0

  return {
    ...values,
    provider,
    clock: { now: () => 1_700_000_000_000 },
    sleeper: { sleep: async () => undefined },
    idGenerator: kind => `${kind}-migration-${++eventNumber}`,
    ...overrides,
  }
}

async function withTemporaryHermesHome<T>(operation: (home: string) => Promise<T>): Promise<T> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-migration-'))
  const previous = process.env.HERMES_HOME
  process.env.HERMES_HOME = home

  try {
    return await operation(home)
  } finally {
    if (previous === undefined) {delete process.env.HERMES_HOME}
    else {process.env.HERMES_HOME = previous}

    fs.rmSync(home, { recursive: true, force: true })
  }
}

function response(message: HarnessMessage) {
  return { message, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }
}

test('recorded stream preserves interleaved text, reasoning, tool calls, and results', async () => {
  const data = fixture<StreamFixture>('stream-interleaving.json')
  const provider = createRecordedResponseProvider({ events: data.events })

  const result = await provider.complete({
    model: data.model,
    messages: [],
    tools: [],
    requestId: data.requestId,
  })

  assert.deepEqual(result.message.content, data.expectedContent)
  assert.deepEqual(result.message.toolCalls, [{
    id: 'call-stream-001',
    name: 'search',
    arguments: '{"q":"hermes"}',
  }])
  assert.deepEqual(result.toolResults, [{
    toolCallId: 'call-stream-001',
    content: 'found',
  }])
  assert.equal(result.reasoning, data.expectedReasoning)
  assert.deepEqual(result.usage, data.expectedUsage)
  assert.deepEqual(result.metadata, {
    source: 'migration-fixture',
    phase: 'finish',
  })
})

test('atomic turn writes survive restart and recovered tool calls are not replayed', async () => {
  const data = fixture<PersistenceFixture>('persistence-recovery.json')

  await withTemporaryHermesHome(async home => {
    const database = path.join(home, 'state', 'sessions.db')
    const firstRepository = new SQLiteSessionRepository({ path: database, runtimeVersion: 'migration-test' })

    const session: SessionRecord = {
      schemaVersion: 1,
      id: data.sessionId,
      workspaceId: 'workspace-migration-001',
      status: 'active',
      createdAt: data.timestamps.runtime,
      updatedAt: data.timestamps.runtime,
      runtime: { runtimeVersion: 'migration-test', schemaVersion: 1 },
    }

    try {
      await firstRepository.createSession(session)
      await firstRepository.appendMessages(data.sessionId, [{
        id: data.seedMessage.id,
        role: 'user',
        content: data.seedMessage.content,
        createdAt: data.seedMessage.createdAt,
      }])

      const interruption = new AbortController()
      let providerCalls = 0

      const firstRun = await executeHarness(harnessRequest({
        requestId: data.requestId,
        sessionId: data.sessionId,
        model: data.model,
        messages: [{ role: 'user', content: data.seedMessage.content }],
        tools: [{ name: data.tool.name, policy: 'allow' }],
      }, {
        async complete(request) {
          providerCalls += 1

          if (providerCalls === 1) {
            return response({
              role: 'assistant',
              content: '',
              toolCalls: [{ id: data.tool.callId, name: data.tool.name, arguments: data.tool.arguments }],
            })
          }

          interruption.abort()
          const error = new Error('deterministic interruption')
          error.name = 'AbortError'

          return new Promise((_resolve, reject) => {
            request.signal.addEventListener('abort', () => reject(error), { once: true })
          })
        },
      }, {
        signal: interruption.signal,
        sessionRepository: firstRepository,
        toolExecutor: async () => ({ content: data.tool.result }),
      }))

      assert.equal(firstRun.outcome, 'cancelled')
      assert.equal(providerCalls, 2)
      assert.deepEqual(
        (await firstRepository.listMessages(data.sessionId)).map(message => message.role),
        data.expectedFirstRunRoles,
      )
      assert.equal((await firstRepository.listToolResults(data.sessionId))[0]?.toolCallId, data.tool.callId)
      assert.equal((await firstRepository.listUsage(data.sessionId)).length, 1)
    } finally {
      firstRepository.close()
    }

    const restartedRepository = new SQLiteSessionRepository({ path: database, runtimeVersion: 'migration-test' })
    let recoveredRequest: HarnessMessage[] | undefined
    let replayedTool = false
    let restartId = 0

    try {
      const recovered = await executeHarness(harnessRequest({
        requestId: data.requestId,
        sessionId: data.sessionId,
        model: data.model,
        messages: [{ role: 'user', content: data.seedMessage.content }],
        tools: [{ name: data.tool.name, policy: 'allow' }],
      }, {
        async complete(request) {
          recoveredRequest = [...request.messages]

          return response({ role: 'assistant', content: 'recovered response' })
        },
      }, {
        sessionRepository: restartedRepository,
        idGenerator: kind => `${kind}-migration-restart-${++restartId}`,
        toolExecutor: async () => {
          replayedTool = true

          return { content: 'must not replay' }
        },
      }))

      assert.equal(recovered.outcome, 'completed', JSON.stringify(recovered))
      assert.deepEqual(recoveredRequest?.map(message => message.role), data.expectedFirstRunRoles)
      assert.equal(replayedTool, false)
      assert.deepEqual(
        (await restartedRepository.listMessages(data.sessionId)).map(message => message.role),
        data.expectedRecoveredRoles,
      )
      assert.equal((await restartedRepository.listUsage(data.sessionId)).length, 2)
    } finally {
      restartedRepository.close()
    }
  })
})

test('tool output is UTF-8 bounded before continuation and marked truncated', async () => {
  const data = fixture<ToolSafetyFixture>('tool-safety.json')
  const events: HarnessEvent[] = []
  let providerCalls = 0
  let providerContent: unknown

  const result = await executeHarness(harnessRequest({
    requestId: data.requestId,
    sessionId: data.sessionId,
    model: data.model,
    messages: [{ role: 'user', content: 'bound this output' }],
    tools: [{ name: data.toolName, policy: 'allow' }],
  }, {
    async complete(request) {
      providerCalls += 1

      if (providerCalls === 1) {
        return response({
          role: 'assistant',
          content: '',
          toolCalls: [{ id: data.callId, name: data.toolName, arguments: '{}' }],
        })
      }

      providerContent = request.messages.at(-1)?.content

      return response({ role: 'assistant', content: 'bounded' })
    },
  }, {
    eventSink: event => { events.push(event) },
    toolOutputLimits: { maxBytes: data.maxBytes },
    toolExecutor: async () => ({ content: data.oversizedOutput }),
  }))

  assert.equal(result.outcome, 'completed')
  assert.equal(providerContent, data.expectedBoundedOutput)
  const completed = events.find(event => event.type === 'tool.completed')
  assert.ok(completed?.type === 'tool.completed')
  assert.deepEqual(completed.result, { content: data.expectedBoundedOutput, truncated: true })
})

test('tool timeout aborts the executor and prevents provider continuation', async () => {
  const data = fixture<ToolSafetyFixture>('tool-safety.json')
  const events: HarnessEvent[] = []
  let providerCalls = 0
  let executorAborted = false

  const result = await executeHarness(harnessRequest({
    requestId: data.requestId,
    sessionId: data.sessionId,
    model: data.model,
    messages: [{ role: 'user', content: 'time limit' }],
    tools: [{ name: data.timeoutToolName, policy: 'allow' }],
  }, {
    async complete() {
      providerCalls += 1

      return response({
        role: 'assistant',
        content: '',
        toolCalls: [{ id: data.timeoutCallId, name: data.timeoutToolName, arguments: '{}' }],
      })
    },
  }, {
    eventSink: event => { events.push(event) },
    toolTimeoutMs: data.timeoutMs,
    toolExecutor: async execution => await new Promise((_resolve, reject) => {
      execution.signal.addEventListener('abort', () => {
        executorAborted = true
        reject(new Error('executor observed timeout'))
      }, { once: true })
    }),
  }))

  assert.equal(result.outcome, 'tool_failure')
  assert.equal(providerCalls, 1)
  assert.equal(executorAborted, true)
  assert.equal(events.filter(event => event.type === 'terminal').length, 1)
})

test('native shell tool fails closed before spawning an unallowlisted command', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-shell-migration-'))
  const executable = fs.realpathSync('/usr/bin/printf')
  let spawned = false

  try {
    const runtimeModule = () => '../../packages/tool-runtime/src/index'
    const { createShellTool } = await import(runtimeModule())
    const tool = createShellTool({
      policy: {
        allowedCommands: [{ executable, argumentPrefix: ['safe'] }],
        executableRoots: ['/usr/bin'],
        cwdRoots: [cwd],
        maxTimeoutMs: 1_000,
        maxOutputBytes: 128,
      },
      processPort: {
        spawn() {
          spawned = true
          throw new Error('unallowlisted command was spawned')
        },
        terminate() {},
      },
    })

    const executableHandle = tool.executable as { handle: { execute: (...args: unknown[]) => Promise<unknown> } }
    await assert.rejects(
      executableHandle.handle.execute({ argv: [executable, 'unsafe'], cwd }),
      /allowlisted/,
    )
    assert.equal(spawned, false)
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
})

test('recorded response provider normalizes omitted usage counters and retains request identity', async () => {
  const data = fixture<RecordedFixture>('recorded-response.json')
  const provider = createRecordedResponseProvider({ events: data.events })

  const request: ProviderRequest = {
    model: data.model,
    messages: [],
    tools: [],
    requestId: data.requestId,
  }

  const result = await provider.complete(request)

  assert.equal(result.message.content, 'normalized response')
  assert.deepEqual(result.usage, data.expectedUsage)
  assert.equal(result.finishReason, 'stop')
  assert.deepEqual(result.metadata, { source: 'recorded-fixture', recording: 'stable' })
  assert.equal(result.requestId, data.requestId)
  assert.deepEqual(provider.requests, [request])
})
