// @vitest-environment jsdom

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import { PromptCommandComposer } from './PromptCommandComposer'
import type { SubpolarPromptCommand } from '@/lib/subpolar-api'

const commands: readonly SubpolarPromptCommand[] = [
  { id: 'review-id', ownerId: 'user', name: 'review', description: 'Review current changes', prompt: 'Review the current changes for regressions.', enabled: true, createdAt: '', updatedAt: '' },
  { id: 'release-id', ownerId: 'user', name: 'release', description: 'Prepare a release', prompt: 'Prepare the release notes.', enabled: true, createdAt: '', updatedAt: '' },
  { id: 'refactor-id', ownerId: 'user', name: 'refactor', description: 'Refactor carefully', prompt: 'Refactor this code.', enabled: false, createdAt: '', updatedAt: '' }
];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const mountedRoots: Root[] = []

function Harness({ onSubmit }: { onSubmit: () => void }) {
  const [draft, setDraft] = useState('')
  return <PromptCommandComposer draft={draft} setDraft={setDraft} commands={commands} disabled={false} onSubmit={onSubmit} />
}

async function mount(onSubmit = vi.fn()) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  mountedRoots.push(root)
  await act(async () => { root.render(<Harness onSubmit={onSubmit} />) })
  return { container, onSubmit }
}

async function inputText(container: HTMLElement, value: string) {
  const textarea = container.querySelector('textarea')
  if (textarea === null) throw new Error('Composer textarea was not rendered')
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    if (setter === undefined) throw new Error('Textarea value setter was not found')
    setter.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return textarea
}

afterEach(async () => {
  await act(async () => { mountedRoots.splice(0).forEach(root => root.unmount()) })
  document.body.innerHTML = ''
})

test('typing a command prefix opens enabled suggestions and filters from the beginning only', async () => {
  const { container } = await mount()
  await inputText(container, '/')
  expect(container.querySelector('[role="listbox"]')).not.toBeNull()
  expect(container.querySelectorAll('[role="option"]')).toHaveLength(2)

  await inputText(container, '/rev')
  expect(container.querySelectorAll('[role="option"]')).toHaveLength(1)
  expect(container.querySelector('[role="option"]')?.textContent).toContain('/review')

  await inputText(container, 'Can you explain /review?')
  expect(container.querySelector('[role="listbox"]')).toBeNull()
})

test('disabled commands stay hidden and selection expands the editable draft without submitting', async () => {
  const { container, onSubmit } = await mount()
  await inputText(container, '/')
  const disabledOption = [...container.querySelectorAll('[role="option"]')].find(option => option.textContent?.includes('/refactor'))
  expect(disabledOption).toBeUndefined()

  const review = [...container.querySelectorAll('[role="option"]')].find(option => option.textContent?.includes('/review'))
  if (!(review instanceof HTMLButtonElement)) throw new Error('Review command option was not rendered')
  await act(async () => { review.click() })
  const textarea = container.querySelector('textarea')
  expect(textarea?.value).toBe('Review the current changes for regressions.')
  expect(textarea?.selectionStart).toBe(textarea?.value.length)
  expect(onSubmit).not.toHaveBeenCalled()
})
