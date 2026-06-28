#!/usr/bin/env node
// Installs the versioned .githooks/pre-push into this clone's hooks directory.
// It writes ONLY pre-push, so any existing local hooks (e.g. cce post-commit) are
// left untouched — we deliberately do NOT switch core.hooksPath.
//
// Wired to the npm `prepare` lifecycle, so it runs automatically on every
// `npm install`. It must therefore NEVER fail the install: outside a git work
// tree (CI tarball install, no .git) it just no-ops.
import { copyFileSync, chmodSync, existsSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const skip = (reason) => {
  console.log(`↷ pre-push hook not installed (${reason}).`)
  process.exit(0)
}

const source = '.githooks/pre-push'
if (!existsSync(source)) skip(`missing ${source}`)

let hooksDir
try {
  // Fails (throws) when there is no git work tree — then we just skip.
  hooksDir = execSync('git rev-parse --git-path hooks', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
} catch {
  skip('not a git repository')
}

try {
  if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true })
  const target = join(hooksDir, 'pre-push')
  copyFileSync(source, target)
  chmodSync(target, 0o755)
  console.log(`✓ pre-push hook installed → ${target} (existing hooks left untouched).`)
} catch (error) {
  skip(error.message)
}

