import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { readFrontMatter } from '../../eng/lib/front-matter.mjs'

// A harness discovers agents by walking the plugin's `agents/` directory and treating
// every markdown file it finds as an agent descriptor. Anything parked there that is not
// an agent — a template, a note, a scratch file — is therefore published as a real,
// dispatchable agent with no description and, absent a `tools:` list, unrestricted tool
// access. That is exactly what five template files under `agents/assets/` did until they
// moved to the plugin's `assets/` directory.
//
// `eng/catalog/scan.mjs` never caught it because it filters on `.agent.md`; the harness
// does not filter at all. These tests hold the directory to what the harness actually sees.
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../..')
const agentsRoot = join(repoRoot, 'plugins/skraft-framework/agents')

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })

const markdownFiles = walk(agentsRoot).filter((path) => path.endsWith('.md'))
const fromRoot = (path) => relative(repoRoot, path).split('\\').join('/')

test('agent-discovery: every markdown file under agents/ is an agent descriptor', () => {
  const strays = markdownFiles.filter((path) => !path.endsWith('.agent.md')).map(fromRoot)
  assert.deepEqual(
    strays,
    [],
    'a harness publishes these as agents with no description and unrestricted tools — ' +
      'move non-agent markdown to the plugin\'s assets/ directory',
  )
})

test('agent-discovery: every agent descriptor declares a description', () => {
  assert.ok(markdownFiles.length > 0, 'expected the plugin to ship agent descriptors')

  for (const path of markdownFiles) {
    const { data } = readFrontMatter(readFileSync(path, 'utf8'))
    const description = typeof data.description === 'string' ? data.description.trim() : ''
    assert.notEqual(description, '', `${fromRoot(path)}: agent declares no front-matter description`)
  }
})
