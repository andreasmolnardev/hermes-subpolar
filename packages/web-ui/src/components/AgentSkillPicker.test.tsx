// @vitest-environment jsdom

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import { AgentSkillPicker } from './AgentSkillPicker'
import type { SubpolarSkill } from '@/lib/subpolar-api'

const skills: readonly SubpolarSkill[] = [
  { id: 'react', ownerId: 'user', name: 'React Development', description: 'Build React interfaces.', instructions: 'Use React.', enabled: true, createdAt: '', updatedAt: '' },
  { id: 'legacy', ownerId: 'user', name: 'Legacy Deployment', description: 'Old deployment guidance.', instructions: 'Deploy carefully.', enabled: false, createdAt: '', updatedAt: '' }
];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const mountedRoots: Root[] = []

function Harness({ onChange }: { onChange: (ids: readonly string[]) => void }) {
  const [assignedIds, setAssignedIds] = useState<readonly string[]>(['legacy'])
  return <AgentSkillPicker skills={skills} assignedIds={assignedIds} onChange={ids => { setAssignedIds(ids); onChange(ids) }} />
}

async function mount(onChange = vi.fn()) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  mountedRoots.push(root)
  await act(async () => { root.render(<Harness onChange={onChange} />) })
  return { container, onChange }
}

afterEach(async () => {
  await act(async () => { mountedRoots.splice(0).forEach(root => root.unmount()) })
  document.body.innerHTML = ''
})

test('Agent Skill picker shows descriptions and keeps disabled assignments visible', async () => {
  const { container } = await mount()
  expect(container.textContent).toContain('React Development')
  expect(container.textContent).toContain('Legacy Deployment')
  expect(container.textContent).toContain('(Disabled)')
  expect((container.querySelector('input[aria-label="Legacy Deployment"]') as HTMLInputElement).checked).toBe(true)
})

test('Agent Skill picker persists the selected assignment order through changes', async () => {
  const { container, onChange } = await mount()
  const react = container.querySelector('input[aria-label="React Development"]')
  if (!(react instanceof HTMLInputElement)) throw new Error('React Skill checkbox was not rendered')
  await act(async () => { react.click() })
  expect(onChange).toHaveBeenLastCalledWith(['legacy', 'react'])
  expect(react.checked).toBe(true)

  const legacy = container.querySelector('input[aria-label="Legacy Deployment"]')
  if (!(legacy instanceof HTMLInputElement)) throw new Error('Legacy Skill checkbox was not rendered')
  await act(async () => { legacy.click() })
  expect(onChange).toHaveBeenLastCalledWith(['react'])
})
