import { describe, expect, it } from 'vitest'

import { MODEL_PROVIDER_CATALOG, modelProvider } from './model-providers'
import { HERMES_PROVIDER_PARITY } from './provider-parity'

describe('model provider registry', () => {
  it('contains declarative profiles for shared API modes', () => {
    expect(MODEL_PROVIDER_CATALOG.length).toBeGreaterThan(10)
    expect(modelProvider('openai-api')?.apiMode).toBe('chat_completions')
    expect(modelProvider('anthropic')?.apiMode).toBe('anthropic_messages')
    expect(modelProvider('xai')?.apiMode).toBe('codex_responses')
    expect(modelProvider('openai-codex')?.id).toBe('openai-codex')
    expect(modelProvider('bedrock')?.authType).toBe('aws_sdk')
  })

  it('remains a browser-safe JSON contract and resolves aliases', () => {
    const encoded = JSON.stringify(MODEL_PROVIDER_CATALOG)
    expect(JSON.parse(encoded)).toEqual(MODEL_PROVIDER_CATALOG)
    expect(modelProvider('kimi')?.id).toBe('moonshot')
    expect(modelProvider('not-a-provider')).toBeUndefined()
  })

  it('assigns an explicit Hermes parity status to every profile', () => {
    expect(MODEL_PROVIDER_CATALOG.every(provider => HERMES_PROVIDER_PARITY[provider.id] !== undefined)).toBe(true)
    expect(Object.keys(HERMES_PROVIDER_PARITY).sort()).toEqual(MODEL_PROVIDER_CATALOG.map(provider => provider.id).sort())
  })
})
