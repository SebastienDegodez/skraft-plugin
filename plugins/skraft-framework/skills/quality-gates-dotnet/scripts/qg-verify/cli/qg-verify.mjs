#!/usr/bin/env node
// Deterministic verification of a quality-gates evidence log against the files it cites
// and the Git history it claims. Prints { verdict, findings } as JSON.
// Exit: 0 pass · 1 fail · 2 inconclusive · 3 usage error.
//
//   node "$SKRAFT_PLUGIN_ROOT/src/cli/qg-verify.mjs" --log <repo-relative qg-{story}.json> [--root <repo>] [--base <sha>]
//
// --base defaults to the DELIVER base the active pipeline recorded (mark-phase-started).
import { readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createGitRepository } from '../adapters/infrastructure/git-repository.mjs'
import { createActiveSlugStore } from '../adapters/infrastructure/active-slug-store.mjs'
import { resolveTrackingRoot } from '../adapters/infrastructure/tracking-root-resolver.mjs'
import { verifyEvidenceLog } from '../application/evidence-verification-service.mjs'
import { firstValidProjectSlug } from '../domain/value-objects.mjs'

const EXIT = { pass: 0, fail: 1, inconclusive: 2 }

let values
try {
  ({ values } = parseArgs({ options: { log: { type: 'string' }, root: { type: 'string' }, base: { type: 'string' } } }))
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(3)
}
if (!values.log) {
  process.stderr.write('usage: qg-verify.mjs --log <path> [--root <repo>] [--base <sha>]\n')
  process.exit(3)
}

const root = resolve(values.root ?? process.cwd())
const logPath = relative(root, resolve(root, values.log)).split('\\').join('/')

const recordedBase = async () => {
  const trackingRoot = resolveTrackingRoot({ cwd: root })
  const slug = firstValidProjectSlug(process.env.SKRAFT_PROJECT_SLUG, createActiveSlugStore(trackingRoot).read())
  if (!slug) return undefined
  try {
    return JSON.parse(await readFile(join(trackingRoot, slug, 'state.json'), 'utf8')).phaseHistory?.DELIVER?.baseSha ?? undefined
  } catch {
    return undefined
  }
}

const result = await verifyEvidenceLog({
  logPath,
  base: values.base ?? (await recordedBase()),
  files: { read: (path) => readFile(join(root, path), 'utf8') },
  git: createGitRepository({ cwd: root }),
})
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
process.exitCode = EXIT[result.verdict]
