#!/usr/bin/env bun

const files = (await new Response(Bun.stdin).text()).split(/\r?\n/).map(item => item.trim()).filter(Boolean)
const frontend = files.some(file => file === 'package.json' || file === 'bun.lock' || file.startsWith('packages/'))
const docker = files.some(file => file === 'Dockerfile' || file === 'docker-compose.yml' || file.startsWith('docker/'))
const ciReviewFiles = files.filter(file => file === '.prettierrc' || file.startsWith('.github/'))
const all = files.length === 0 || files.some(file => file.startsWith('.github/'))
const output = {
  frontend: all || frontend,
  docker_meta: all || docker,
  scan: all || files.some(file => file === 'bun.lock' || file.endsWith('.mjs') || file.endsWith('.ts')),
  ci_review: all || ciReviewFiles.length > 0,
  ci_review_files: [...new Set(ciReviewFiles)].sort()
}

const lines = Object.entries(output).map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
const text = `${lines.join('\n')}\n`
if (process.env.GITHUB_OUTPUT) await Bun.write(process.env.GITHUB_OUTPUT, text)
process.stdout.write(text)
