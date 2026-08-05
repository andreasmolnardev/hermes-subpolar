import { expect, test, type Page } from '@playwright/test'
import { readFileSync, realpathSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'

type TestState = {
  home: string
  allowedRoot: string
  repoRoot: string
  scheduledRoot: string
  webDist: string
  python: string
  otherWorkspaceId: string
}

const state = JSON.parse(
  readFileSync(path.join(process.cwd(), 'tests/browser/.server-state.json'), 'utf8')
) as TestState
const username = 'browser-owner'
const password = 'browser-e2e-password'
const projectName = 'Browser E2E Source Project'
const projectRoot = state.repoRoot

test.describe.configure({ mode: 'serial' })

async function signIn(page: Page) {
  const status = await page.request.get('/api/auth/bootstrap')
  expect(status.ok()).toBeTruthy()
  const bootstrap = (await status.json()) as { required: boolean }
  if (bootstrap.required) {
    const response = await page.request.post('/auth/bootstrap', {
      data: { username, password, display_name: 'Browser E2E Owner' }
    })
    expect(response.status()).toBe(200)
  } else {
    const response = await page.request.post('/auth/password-login', {
      data: { provider: 'basic', username, password, next: '/new' }
    })
    expect(response.status()).toBe(200)
  }
  await page.goto('/new')
  await expect(page.getByRole('heading', { name: 'What do you want to work on?' })).toBeVisible()
}

async function createWorkspace(page: Page, name: string, root: string) {
  const existing = await page.request.get('/api/subpolar/bootstrap')
  const existingBody = (await existing.json()) as { workspaces: Array<{ id: string; name: string; root: string }> }
  const found = existingBody.workspaces.find(workspace => workspace.name === name)
  if (found) return found
  const response = await page.request.post('/api/subpolar/workspaces', {
    headers: { Origin: 'http://127.0.0.1:19119' },
    data: { name, mode: 'local', root }
  })
  expect(response.status()).toBe(201)
  return (await response.json()) as { id: string; name: string; root: string }
}

async function waitForReady(child: ReturnType<typeof spawn>, port: number) {
  await new Promise<void>((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error(`restart server did not become ready: ${output}`)), 30_000)
    const onData = (chunk: Buffer) => {
      output += chunk.toString()
      if (output.includes(`HERMES_DASHBOARD_READY port=${port}`)) {
        clearTimeout(timer)
        resolve()
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', code => {
      if (code !== null && code !== 0) {
        clearTimeout(timer)
        reject(new Error(`restart server exited with ${code}: ${output}`))
      }
    })
  })
}

test('first user bootstrap, cookie login, protected access, and logout', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('form.provider-form')).toBeVisible()
  await expect(page.locator('input[name="username"]')).toBeVisible()

  const bootstrapStatus = await page.request.get('/api/auth/bootstrap')
  expect((await bootstrapStatus.json()).required).toBe(true)
  const bootstrap = await page.request.post('/auth/bootstrap', {
    data: { username, password, display_name: 'Browser E2E Owner' }
  })
  expect(bootstrap.status()).toBe(200)
  expect((await page.request.get('/api/auth/me')).status()).toBe(200)

  const logout = await page.request.post('/auth/logout')
  expect(logout.url()).toContain('/login')
  expect((await page.request.get('/api/subpolar/bootstrap')).status()).toBe(401)
  await page.goto('/new')
  await expect(page).toHaveURL(/\/login(?:\?|$)/)

  await expect(page.getByRole('link', { name: 'Create an account' })).toBeVisible()
  await page.getByRole('link', { name: 'Create an account' }).click()
  await expect(page).toHaveURL(/\/signup$/)
  await page.locator('input[name="username"]').fill('second-browser-user')
  await page.locator('input[name="password"]').fill('second-browser-password')
  await page.locator('input[name="display_name"]').fill('Second Browser User')
  await page.locator('form#signup-form button[type="submit"]').click()
  await expect(page).toHaveURL(/\/$|\/new$/)
  const secondIdentity = (await (await page.request.get('/api/auth/me')).json()) as { user_id: string }
  expect(secondIdentity.user_id).toBeTruthy()
  expect(secondIdentity.user_id).not.toBe(username)
  await page.request.post('/auth/logout')
  await page.goto('/new')
  await expect(page).toHaveURL(/\/login(?:\?|$)/)

  await page.locator('input[name="username"]').fill(username)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('form.provider-form button[type="submit"]').click()
  await expect(page).toHaveURL(/\/new$/)
  await expect(page.getByRole('heading', { name: 'What do you want to work on?' })).toBeVisible()

  await page.request.post('/auth/logout')
  await page.goto('/new')
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
})

test('scopes workspaces, creates project, exercises source control, and handles terminal reconnect', async ({
  page
}) => {
  await signIn(page)
  const before = (await (await page.request.get('/api/subpolar/bootstrap')).json()) as {
    workspaces: Array<{ id: string; name: string }>
  }
  expect(before.workspaces.some(workspace => workspace.id === state.otherWorkspaceId)).toBe(false)
  expect((await page.request.get(`/api/subpolar/workspaces/${state.otherWorkspaceId}`)).status()).toBe(404)

  await page.getByRole('button', { name: 'New Project' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New Project' })
  await dialog.getByLabel('Project name').fill(projectName)
  await dialog.getByLabel('Workspace root').fill(projectRoot)
  await dialog.locator('button[type=submit]').click()
  await expect(dialog).toBeHidden()

  const workspaceResponse = await page.request.get('/api/subpolar/bootstrap')
  const workspaceBody = (await workspaceResponse.json()) as {
    workspaces: Array<{ id: string; name: string; root: string }>
  }
  const workspace = workspaceBody.workspaces.find(item => item.name === projectName)
  expect(workspace?.root).toBe(realpathSync(projectRoot))
  expect(page.getByLabel('Select workspace')).toHaveValue(workspace!.id)

  await page.getByRole('tab', { name: 'Source Control' }).click()
  await expect(page.getByText('tracked.txt', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Stage' }).click()
  await expect(page.getByRole('button', { name: 'Unstage' })).toBeVisible()
  const changed = await page.request.get(`/api/subpolar/source-control/changed-files?workspace_id=${workspace?.id}`)
  expect(changed.status()).toBe(200)
  const changedBody = (await changed.json()) as { files: Array<{ path: string; staged?: boolean }> }
  expect(changedBody.files.some(file => file.path === 'tracked.txt' && file.staged)).toBe(true)

  await page.getByRole('tab', { name: 'Terminal' }).click()
  await page.getByRole('button', { name: '+ Terminal' }).click()
  await expect(page.getByText('Terminal 1', { exact: true })).toBeVisible()
  const terminals = (await (await page.request.get('/api/subpolar/terminals')).json()) as {
    terminals: Array<{ id: string; workspace_id: string }>
  }
  const terminal = terminals.terminals.find(item => item.workspace_id === workspace?.id)
  expect(terminal).toBeTruthy()

  const ticket = (await (await page.request.post('/api/auth/ws-ticket')).json()) as { ticket: string }
  const socketResult = await page.evaluate(
    async ({ terminalId, wsTicket }) => {
      return await new Promise<{ kind: 'open' | 'closed'; code?: number }>(resolve => {
        const url = new URL('/api/subpolar/terminals/ws', window.location.href)
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
        url.searchParams.set('terminal_id', terminalId)
        url.searchParams.set('ticket', wsTicket)
        const socket = new WebSocket(url)
        const timer = window.setTimeout(() => {
          socket.close()
          resolve({ kind: 'closed', code: 1000 })
        }, 5_000)
        socket.onopen = () => {
          window.clearTimeout(timer)
          socket.send(JSON.stringify({ type: 'resize', cols: 80, rows: 24 }))
          socket.close()
          resolve({ kind: 'open' })
        }
        socket.onclose = event => {
          window.clearTimeout(timer)
          resolve({ kind: 'closed', code: event.code })
        }
        socket.onerror = () => undefined
      })
    },
    { terminalId: terminal?.id ?? '', wsTicket: ticket.ticket }
  )
  expect(['open', 'closed']).toContain(socketResult.kind)
  if (socketResult.kind === 'closed') expect(socketResult.code).toBe(1011)
})

test('enforces scheduled policy and supports run-now without an LLM', async ({ page }) => {
  await signIn(page)
  const workspace = await createWorkspace(page, 'Browser E2E Scheduled Project', state.scheduledRoot)
  const agentResponse = await page.request.post('/api/subpolar/agents', {
    headers: { Origin: 'http://127.0.0.1:19119' },
    data: {
      name: 'Browser E2E Scheduled Agent',
      scope: 'global',
      instructions: 'No provider call',
      permissions: { tools: { 'mock.run': 'ask' } }
    }
  })
  expect(agentResponse.status()).toBe(201)
  const agent = (await agentResponse.json()) as { id: string }

  const safeTaskResponse = await page.request.post('/api/subpolar/schedules', {
    headers: { Origin: 'http://127.0.0.1:19119' },
    data: {
      name: 'Safe scheduled task',
      prompt: 'record metadata only',
      schedule: 'every 1h',
      workspace_id: workspace.id,
      agent_id: agent.id,
      permission_mode: 'scheduled',
      enabled: true
    }
  })
  expect(safeTaskResponse.status(), await safeTaskResponse.text()).toBe(201)
  const safeTask = (await safeTaskResponse.json()) as {
    id: string
    cron_job_id: string | null
    last_error: string | null
  }
  expect(safeTask.cron_job_id).toBeTruthy()
  expect(safeTask.last_error).toBeNull()

  const blockedResponse = await page.request.post('/api/subpolar/schedules', {
    headers: { Origin: 'http://127.0.0.1:19119' },
    data: {
      name: 'Blocked scheduled task',
      prompt: 'must not run interactive tool',
      schedule: 'every 1h',
      workspace_id: workspace.id,
      agent_id: agent.id,
      permission_mode: 'scheduled',
      enabled: true,
      draft_json: { requested_tools: ['mock.run'] }
    }
  })
  expect(blockedResponse.status()).toBe(201)
  const blockedTask = (await blockedResponse.json()) as {
    id: string
    cron_job_id: string | null
    last_error: string | null
  }
  expect(blockedTask.cron_job_id).toBeNull()
  expect(blockedTask.last_error).toContain('scheduled execution denied')

  await page.getByRole('button', { name: 'Scheduled' }).click()
  await expect(page.getByRole('heading', { name: 'Scheduled', exact: true })).toBeVisible()
  const safeArticle = page.locator('article').filter({ hasText: 'Safe scheduled task' })
  const runNow = page.waitForResponse(
    response =>
      response.url().includes(`/api/subpolar/schedules/${safeTask.id}/run-now`) &&
      response.request().method() === 'POST'
  )
  await safeArticle.getByRole('button', { name: 'Run now' }).click()
  expect((await runNow).status()).toBe(200)
  await expect
    .poll(
      async () =>
        (
          (await (await page.request.get(`/api/subpolar/schedules/${safeTask.id}`)).json()) as {
            last_error: string | null
          }
        ).last_error
    )
    .toBeNull()
  await expect(page.locator('article').filter({ hasText: 'Blocked scheduled task' })).toContainText(
    'scheduled execution denied'
  )
})

test('preserves authenticated workspace state across dashboard restart', async ({ page, browser }) => {
  await signIn(page)
  const before = (await (await page.request.get('/api/subpolar/bootstrap')).json()) as {
    workspaces: Array<{ name: string }>
  }
  expect(before.workspaces.some(workspace => workspace.name === projectName)).toBe(true)
  const storageState = await page.context().storageState()
  const restartPort = 19120
  const restart = spawn(
    state.python,
    [
      '-m',
      'hermes_cli.main',
      'dashboard',
      '--host',
      '0.0.0.0',
      '--port',
      String(restartPort),
      '--no-open',
      '--skip-build'
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HERMES_HOME: state.home,
        HERMES_SUBPOLAR_ONLY: '1',
        SUBPOLAR_ALLOWED_ROOTS: state.allowedRoot,
        HERMES_WEB_DIST: state.webDist,
        HERMES_DASHBOARD_BASIC_AUTH_USERNAME: '',
        HERMES_DASHBOARD_BASIC_AUTH_PASSWORD: '',
        HERMES_DASHBOARD_BASIC_AUTH_PASSWORD_HASH: '',
        HERMES_DASHBOARD_BASIC_AUTH_SECRET: ''
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
  try {
    await waitForReady(restart, restartPort)
    const restartedContext = await browser.newContext({ baseURL: `http://127.0.0.1:${restartPort}`, storageState })
    try {
      const restartedPage = await restartedContext.newPage()
      await restartedPage.goto('/new')
      await expect(restartedPage.getByRole('heading', { name: 'What do you want to work on?' })).toBeVisible()
      const after = (await (await restartedPage.request.get('/api/subpolar/bootstrap')).json()) as {
        workspaces: Array<{ name: string }>
      }
      expect(after.workspaces.some(workspace => workspace.name === projectName)).toBe(true)
      expect((await restartedPage.request.get('/api/auth/me')).status()).toBe(200)
    } finally {
      await restartedContext.close()
    }
  } finally {
    restart.kill('SIGTERM')
    await new Promise<void>(resolve => restart.once('exit', () => resolve()))
  }
})
