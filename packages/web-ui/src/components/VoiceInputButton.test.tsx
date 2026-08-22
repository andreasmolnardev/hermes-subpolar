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
const getUserMedia = vi.fn()

function Harness({ configured = true }: { configured?: boolean }) {
  const [draft, setDraft] = useState('Existing')
  return <><VoiceInputButton draft={draft} setDraft={setDraft} disabled={false} configured={configured} /><output>{draft}</output></>
}

beforeEach(() => {
  transcribeVoice.mockResolvedValue({ text: 'dictated text' })
  trackStop.mockReset()
  getUserMedia.mockReset()
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: trackStop }] })
  FakeRecorder.current = null
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
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

  test('does not request the microphone when speech-to-text is not configured', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    mountedRoots.push(root)
    await act(async () => root.render(<Harness configured={false} />))
    const button = container.querySelector('button')
    expect(button?.getAttribute('aria-label')).toBe('Configure speech-to-text in Voice settings')
    expect(button).toHaveProperty('disabled', true)
    await act(async () => button?.click())
    expect(getUserMedia).not.toHaveBeenCalled()
  })
})
