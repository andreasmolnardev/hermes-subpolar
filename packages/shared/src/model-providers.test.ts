import { describe, expect, it } from 'vitest'

import { MODEL_PROVIDER_CATALOG, modelProvider } from './model-providers'

describe('model provider catalog', () => {
  it('contains only the supported OpenAI-compatible provider', () => {
    expect(MODEL_PROVIDER_CATALOG).toEqual([
      {
        slug: 'openai-api',
        label: 'OpenAI-compatible',
        description: 'OpenAI-compatible chat completions',
        authType: 'api_key',
        baseUrl: 'https://api.openai.com/v1'
      }
    ])
  })

  it('remains a browser-safe JSON contract', () => {
    const encoded = JSON.stringify(MODEL_PROVIDER_CATALOG)

    expect(JSON.parse(encoded)).toEqual(MODEL_PROVIDER_CATALOG)
  })

  it('rejects unsupported providers before any network dispatch', () => {
    const unsupported = [
      'anthropic',
      'gemini',
      'vertex',
      'azure-foundry',
      'bedrock',
      'lmstudio',
      'ollama-cloud',
      'ollama',
      'local',
      'nous',
      'openai-codex',
      'xai-oauth',
      'minimax-oauth',
      'qwen-oauth',
      'copilot',
      'copilot-acp',
      'relay',
      'openrouter',
      'ai-gateway',
      'moa',
      'process',
      'external_process'
    ]

    for (const slug of unsupported) {
      expect(modelProvider(slug)).toBeUndefined()
    }
  })
})
