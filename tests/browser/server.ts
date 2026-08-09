import { mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import { startApiGatewayServer } from '../../packages/api-gateway/src/server.ts'

const port = Number(process.env.HERMES_E2E_PORT ?? '19119')
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('HERMES_E2E_PORT must be a valid TCP port')

const dataDir = mkdtempSync(join(tmpdir(), 'hermes-browser-e2e-'))
const staticRoot = resolve(process.cwd(), process.env.HERMES_E2E_STATIC_ROOT ?? 'tests/browser/fixtures')

const cleanup = () => {
  rmSync(dataDir, { recursive: true, force: true })
}
process.once('exit', cleanup)

const server = startApiGatewayServer({
  hostname: '127.0.0.1',
  port,
  dataDir,
  staticRoot,
})

let stopping = false
const stop = () => {
  if (stopping) return
  stopping = true
  void server.shutdown().then(
    () => process.exit(0),
    error => {
      console.error('Bun api-gateway shutdown failed', error)
      process.exit(1)
    },
  )
}

process.once('SIGINT', stop)
process.once('SIGTERM', stop)
