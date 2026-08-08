import { expect, test } from '@playwright/test'

const username = 'browser-owner'
const password = 'browser-e2e-password'

function csrfCookie(cookies: readonly { name: string; value: string }[]): string {
  const cookie = cookies.find(item => item.name === 'subpolar_csrf')
  if (cookie === undefined) throw new Error('CSRF cookie was not set')
  return cookie.value
}

test('serves static content, authenticates, enforces CSRF, and completes setup', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://127.0.0.1:19119').origin

  const health = await page.request.get('/api/health')
  expect(health.status()).toBe(200)
  expect(await health.json()).toEqual({ status: 'ok' })

  const staticPage = await page.goto('/')
  expect(staticPage?.status()).toBe(200)
  await expect(page).toHaveTitle('Hermes API Gateway E2E')
  await expect(page.getByRole('heading', { name: 'Hermes API Gateway E2E' })).toBeVisible()

  const bootstrapStatus = await page.request.get('/v1/auth/bootstrap')
  expect(bootstrapStatus.status()).toBe(200)
  expect(await bootstrapStatus.json()).toEqual({ required: true })

  const bootstrap = await page.request.post('/v1/auth/bootstrap', {
    headers: { origin },
    data: { username, password },
  })
  expect(bootstrap.status()).toBe(201)
  expect((await bootstrap.json()).user.username).toBe(username)

  const cookies = await page.context().cookies()
  const csrf = csrfCookie(cookies)
  expect((await page.request.get('/v1/me')).status()).toBe(200)

  const csrfRejected = await page.request.post('/v1/setup/provider', {
    headers: { origin },
    data: {
      provider: 'openai-api',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'browser-e2e-key',
      model: 'browser-e2e-model',
    },
  })
  expect(csrfRejected.status()).toBe(403)
  expect(await csrfRejected.json()).toEqual({ error: 'csrf_rejected' })

  const setupBefore = await page.request.get('/v1/setup')
  expect(setupBefore.status()).toBe(200)
  expect(await setupBefore.json()).toEqual({ complete: false, providerConfigured: false })

  const authHeaders = { origin, 'x-csrf-token': csrf }
  const provider = await page.request.post('/v1/setup/provider', {
    headers: authHeaders,
    data: {
      provider: 'openai-api',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'browser-e2e-key',
      model: 'browser-e2e-model',
    },
  })
  expect(provider.status()).toBe(200)
  expect(await provider.json()).toEqual({ configured: true })

  const agents = await page.request.post('/v1/setup/agents', {
    headers: authHeaders,
    data: { templates: ['research'] },
  })
  expect(agents.status()).toBe(201)
  expect((await agents.json()).agents.length).toBeGreaterThan(0)

  const setupAfter = await page.request.get('/v1/setup')
  expect(setupAfter.status()).toBe(200)
  expect(await setupAfter.json()).toEqual({ complete: true, providerConfigured: true })

  const logout = await page.request.post('/v1/auth/logout', { headers: authHeaders })
  expect(logout.status()).toBe(200)
  expect((await page.request.get('/v1/me')).status()).toBe(401)

  const login = await page.request.post('/v1/auth/login', {
    headers: { origin },
    data: { username, password },
  })
  expect(login.status()).toBe(200)
  expect((await login.json()).user.username).toBe(username)
  expect((await page.request.get('/v1/me')).status()).toBe(200)
})
