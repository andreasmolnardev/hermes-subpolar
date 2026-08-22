// @vitest-environment jsdom

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { VoiceInputButton } from './VoiceInputButton'

const { transcribeVoice } = vi.hoisted(() => ({ transcribeVoice: vi.fn() }))
vi.mock('@/lib/subpolar-api', () => ({ transcribeVoice }))

class FakeRecorder {
  static current: FakeRecorder | null = null
  mimeType = 'audio/webm'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn(() => {
    this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) })
    this.onstop?.()
  })
  constructor(stream: MediaStream) { void stream; FakeRecorder.current = this }
}

const mountedRoots: Root[] = []
const trackStop = vi.fn()

function Harness() {
  const [draft, setDraft] = useState('Existing')
  return <><VoiceInputButton draft={draft} setDraft={setDraft} disabled={false} /><output>{draft}</output></>
}

beforeEach(() => {
  transcribeVoice.mockResolvedValue({ text: 'dictated text' })
  trackStop.mockReset()
  FakeRecorder.current = null
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] }) } })
  vi.stubGlobal('MediaRecorder', FakeRecorder)
})

afterEach(async () => {
  await act(async () => mountedRoots.splice(0).forEach(root => root.unmount()))
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('VoiceInputButton', () => {
  test('requires an explicit action, inserts transcription, and releases media tracks', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    mountedRoots.push(root)
    await act(async () => root.render(<Harness />))
    const button = container.querySelector('button')
    expect(button?.getAttribute('aria-label')).toBe('Record voice message')
    expect(trackStop).not.toHaveBeenCalled()

    await act(async () => button?.click())
    expect(FakeRecorder.current).not.toBeNull()
    expect(button?.getAttribute('aria-label')).toBe('Stop recording')
    await act(async () => button?.click())
    expect(await container.querySelector('output')?.textContent).toBe('Existing dictated text')
    expect(trackStop).toHaveBeenCalledTimes(1)
  })
})
