#!/usr/bin/env node
// Seeds a fresh pipeline state for the report suites: `init-state.mjs init --slug <slug>`.
// Uses the state service bundled in qa-reporting, so the state.json it writes is the one
// report.mjs reads back.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createStateService } from '../../../../plugins/skraft-framework/skills/qa-reporting/scripts/report/application/state-service.mjs'
import { resolveTrackingRoot } from '../../../../plugins/skraft-framework/skills/qa-reporting/scripts/report/adapters/infrastructure/tracking-root-resolver.mjs'

const [command, flag, slug] = process.argv.slice(2)
if (command !== 'init' || flag !== '--slug' || !slug) {
  process.stderr.write('usage: init-state.mjs init --slug <slug>\n')
  process.exit(2)
}

const root = resolveTrackingRoot()
const path = (projectSlug) => join(root, projectSlug, 'state.json')
const service = createStateService({
  stateReader: { read: async (projectSlug) => JSON.parse(readFileSync(path(projectSlug), 'utf8')) },
  stateWriter: {
    write: async (projectSlug, state) => {
      mkdirSync(join(root, projectSlug), { recursive: true })
      writeFileSync(path(projectSlug), JSON.stringify(state, null, 2))
      return { ok: true, value: undefined }
    },
  },
})

const result = await service.init(slug)
if (!result.ok) {
  process.stderr.write(`${result.error.code}: ${result.error.reason ?? ''}\n`)
  process.exit(1)
}
process.stdout.write(JSON.stringify({ created: result.value.created, currentPhase: result.value.currentPhase }) + '\n')
