import { defineConfig } from '@playwright/test'
import path from 'node:path'

const root = path.resolve(__dirname, '../..')
const port = Number(process.env.HERMES_E2E_PORT ?? '19119')

export default defineConfig({
  testDir: __dirname,
  testMatch: '**/*.browser.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['json', { outputFile: 'playwright-report/browser.json' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'bun run tests/browser/server.ts',
    cwd: root,
    url: `http://127.0.0.1:${port}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      HERMES_E2E_PORT: String(port),
    },
  },
})
