#!/usr/bin/env node
// Installs the versioned .githooks/pre-push into this clone's hooks directory.
// It writes ONLY pre-push, so any existing local hooks (e.g. post-commit) are
// left untouched — we deliberately do NOT switch core.hooksPath.
import { copyFileSync, chmodSync, existsSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const source = '.githooks/pre-push'
if (!existsSync(source)) {
  console.error(`Missing ${source} — run from the repository root.`)
  process.exit(1)
}

// `--git-path hooks` resolves the real hooks dir (handles worktrees too).
const hooksDir = execSync('git rev-parse --git-path hooks', { encoding: 'utf8' }).trim()
if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true })

const target = join(hooksDir, 'pre-push')
copyFileSync(source, target)
chmodSync(target, 0o755)

console.log(`✓ Installed pre-push hook → ${target}`)
console.log('  It runs `node scripts/local-ci.mjs` before every push.')
console.log('  Existing hooks in that directory were left untouched.')
