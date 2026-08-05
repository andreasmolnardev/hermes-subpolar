import { defineConfig } from '@playwright/test'
import path from 'node:path'

const root = path.resolve(__dirname, '../..')

export default defineConfig({
  testDir: __dirname,
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['json', { outputFile: 'playwright-report/browser.json' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:19119',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    command: 'node tests/browser/server.mjs',
    cwd: root,
    url: 'http://127.0.0.1:19119/api/health',
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      HERMES_E2E_PORT: '19119'
    }
  }
})
