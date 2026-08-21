// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import { SkillsSettings } from './SettingsPage'
import type { SubpolarSkill } from '@/lib/subpolar-api'

const apiMocks = vi.hoisted(() => ({
  skills: vi.fn(),
  createSkill: vi.fn(),
  updateSkill: vi.fn(),
  deleteSkill: vi.fn()
}))

vi.mock('@/lib/subpolar-api', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/subpolar-api')>()), ...apiMocks }))

const initialSkills: readonly SubpolarSkill[] = [
  { id: 'react', ownerId: 'user', name: 'React Development', description: 'Build React interfaces.', instructions: 'Use React.', enabled: true, createdAt: '', updatedAt: '', assignmentCount: 2 },
  { id: 'legacy', ownerId: 'user', name: 'Legacy Deployment', description: 'Old deployment guidance.', instructions: 'Deploy carefully.', enabled: false, createdAt: '', updatedAt: '', assignmentCount: 0 }
];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const mountedRoots: Root[] = []

async function mount() {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  mountedRoots.push(root)
  await act(async () => { root.render(<SkillsSettings />) })
  return container
}

function articleFor(container: HTMLElement, name: string): HTMLElement {
  const article = [...container.querySelectorAll('article')].find(candidate => candidate.textContent?.includes(name))
  if (!(article instanceof HTMLElement)) throw new Error(`${name} article was not rendered`)
  return article
}

afterEach(async () => {
  await act(async () => { mountedRoots.splice(0).forEach(root => root.unmount()) })
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

test('Skills settings loads, searches, toggles, confirms deletion, and opens create/edit forms', async () => {
  apiMocks.skills.mockResolvedValue({ skills: initialSkills })
  apiMocks.updateSkill.mockImplementation(async (id: string, changes: Partial<SubpolarSkill>) => ({ skill: { ...initialSkills.find(skill => skill.id === id)!, ...changes } }))
  apiMocks.deleteSkill.mockResolvedValue({ deleted: true })
  const container = await mount()

  expect(container.textContent).toContain('React Development')
  expect(container.textContent).toContain('assigned to 2 Agents')
  expect(container.textContent).toContain('Legacy Deployment')
  expect(container.textContent).toContain('Disabled')

  const search = container.querySelector('input[placeholder="Search Skills..."]')
  if (!(search instanceof HTMLInputElement)) throw new Error('Skills search was not rendered')
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(search, 'legacy')
    search.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(container.textContent).toContain('Legacy Deployment')
  expect(container.textContent).not.toContain('React Development')

  const legacy = articleFor(container, 'Legacy Deployment')
  const enable = [...legacy.querySelectorAll('button')].find(button => button.textContent === 'Enable')
  if (!(enable instanceof HTMLButtonElement)) throw new Error('Enable action was not rendered')
  await act(async () => { enable.click() })
  expect(apiMocks.updateSkill).toHaveBeenCalledWith('legacy', { enabled: true })

  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  const deleteButton = [...legacy.querySelectorAll('button')].find(button => button.textContent === 'Delete')
  if (!(deleteButton instanceof HTMLButtonElement)) throw new Error('Delete action was not rendered')
  await act(async () => { deleteButton.click() })
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Delete “Legacy Deployment”?'))
  expect(apiMocks.deleteSkill).toHaveBeenCalledWith('legacy')

  const create = [...container.querySelectorAll('button')].find(button => button.textContent === 'Create Skill')
  if (!(create instanceof HTMLButtonElement)) throw new Error('Create action was not rendered')
  await act(async () => { create.click() })
  expect(container.textContent).toContain('Create Skill')
  const close = [...container.querySelectorAll('button')].find(button => button.textContent === 'Close')
  if (!(close instanceof HTMLButtonElement)) throw new Error('Create form was not rendered')
  await act(async () => { close.click() })

  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(search, '')
    search.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const react = articleFor(container, 'React Development')
  const edit = [...react.querySelectorAll('button')].find(button => button.textContent === 'Edit')
  if (!(edit instanceof HTMLButtonElement)) throw new Error('Edit action was not rendered')
  await act(async () => { edit.click() })
  expect(container.textContent).toContain('Edit Skill')
  expect((container.querySelector('input[required]') as HTMLInputElement).value).toBe('React Development')
})
