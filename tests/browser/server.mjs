import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const localPython = path.join(root, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python')
const python = process.env.HERMES_E2E_PYTHON || (existsSync(localPython) ? localPython : 'python3')
const port = Number(process.env.HERMES_E2E_PORT || 19119)
const home = mkdtempSync(path.join(os.tmpdir(), 'hermes-browser-e2e-'))
const allowedRoot = path.join(home, 'workspaces')
const repoRoot = path.join(allowedRoot, 'source-project')
const scheduledRoot = path.join(allowedRoot, 'scheduled-project')
const stateFile = path.join(root, 'tests/browser/.server-state.json')

mkdirSync(allowedRoot, { recursive: true })
mkdirSync(repoRoot, { recursive: true })
mkdirSync(scheduledRoot, { recursive: true })
writeFileSync(path.join(repoRoot, 'tracked.txt'), 'initial\n', 'utf8')

const git = args => execFileSync('git', args, { cwd: repoRoot, stdio: 'pipe' })
git(['init'])
git(['config', 'user.email', 'e2e@example.invalid'])
git(['config', 'user.name', 'Hermes Browser E2E'])
git(['add', 'tracked.txt'])
git(['commit', '-m', 'initial'])
writeFileSync(path.join(repoRoot, 'tracked.txt'), 'changed by browser e2e\n', 'utf8')

const seed = spawnSync(
  python,
  [
    '-c',
    [
      'import json, sys',
      'from hermes_cli.subpolar_store import SubpolarStore',
      "record = SubpolarStore().create_workspace(owner='other-user', name='Private other owner project', mode='local', root=sys.argv[1])",
      'print(json.dumps(record))'
    ].join('; '),
    path.join(allowedRoot, 'other-owner-project')
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      HERMES_HOME: home,
      SUBPOLAR_ALLOWED_ROOTS: allowedRoot
    },
    encoding: 'utf8'
  }
)
if (seed.status !== 0) {
  process.stderr.write(seed.stderr || 'Could not seed browser E2E data\n')
  process.exit(seed.status || 1)
}

const state = {
  home,
  allowedRoot,
  repoRoot,
  scheduledRoot,
  webDist: path.join(root, 'hermes_cli/web_dist'),
  python,
  otherWorkspaceId: JSON.parse(seed.stdout).id
}
writeFileSync(stateFile, JSON.stringify(state), 'utf8')

const env = {
  ...process.env,
  HERMES_HOME: home,
  HERMES_SUBPOLAR_ONLY: '1',
  SUBPOLAR_ALLOWED_ROOTS: allowedRoot,
  HERMES_WEB_DIST: state.webDist,
  HERMES_DASHBOARD_BASIC_AUTH_USERNAME: '',
  HERMES_DASHBOARD_BASIC_AUTH_PASSWORD: '',
  HERMES_DASHBOARD_BASIC_AUTH_PASSWORD_HASH: '',
  HERMES_DASHBOARD_BASIC_AUTH_SECRET: '',
  HERMES_DASHBOARD_BASIC_AUTH_ALLOW_REGISTRATION: '1'
}
const child = spawn(
  python,
  ['-m', 'hermes_cli.main', 'dashboard', '--host', '0.0.0.0', '--port', String(port), '--no-open', '--skip-build'],
  { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] }
)
child.stdout.pipe(process.stdout)
child.stderr.pipe(process.stderr)

let stopping = false
const stop = (signal = 'SIGTERM') => {
  if (stopping) return
  stopping = true
  child.kill(signal)
}
process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))
process.on('exit', () => {
  if (child.exitCode === null) child.kill('SIGKILL')
  try {
    rmSync(stateFile, { force: true })
    rmSync(home, { recursive: true, force: true })
  } catch {
    // Best-effort cleanup. Playwright's webServer owns process lifetime.
  }
})
child.on('exit', (code, signal) => {
  if (!stopping && code !== 0) process.exit(code ?? 1)
  if (stopping) process.exit(0)
  if (signal) process.exit(1)
})
