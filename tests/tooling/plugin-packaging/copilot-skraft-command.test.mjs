import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { readFrontMatter } from '../../../eng/lib/front-matter.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../../..')
const framework = join(repoRoot, 'plugins/skraft-framework')
const backlog = join(repoRoot, 'plugins/skraft-backlog')
const drivers = join(framework, 'engine/drivers')
const commandPath = join(framework, 'com.github.copilot/commands/skraft.md')

const walk = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name)
        return entry.isDirectory() ? walk(path) : [path]
      })
    : []

const readCommand = () => readFileSync(commandPath, 'utf8')

test('the /skraft command ships for Copilot only, with the Claude Code syntax as its argument hint', () => {
  assert.ok(existsSync(commandPath), 'com.github.copilot/commands/skraft.md exists')
  const { data } = readFrontMatter(readCommand())
  assert.ok(String(data.description ?? '').length > 0, 'description')
  const hint = String(data['argument-hint'])
  for (const syntax of ['<slug>', '#issue', '--base <ref>', '--from-artifacts', 'status', 'decide', 'review <number> [--publish]', 'backlog'])
    assert.ok(hint.includes(syntax), `the hint names ${syntax}`)
  assert.doesNotMatch(hint, /story|resume|--issue|--title/)
  assert.equal(existsSync(join(framework, 'commands')), false, 'Claude Code keeps the mod /skraft: no commands/ folder')
})

const runTable = () => {
  const section = /## Run[\s\S]*?\n\| Typed[^\n]*\n\|[^\n]*\n((?:\|[^\n]*\n)+)/.exec(readCommand())
  assert.ok(section, 'the Run section holds a table')
  return section[1].trim().split('\n').map((line) => {
    const [, typed, json] = /^\|\s*`([^`]*)`\s*\|\s*`(\{.*\})`\s*\|$/.exec(line)
    return { typed, expected: JSON.parse(json) }
  })
}

// The drivers hold no request-to-workflow-arguments mapping (`toolRequest` is the inverse and
// refuses issue 0), so the mapping stays here; the test fails when a parsed field is not mapped.
const ARGUMENT_OF = Object.freeze({
  slug: (request) => ({ slug: request.slug }),
  story: (request) => ({
    ...(request.story?.issue != null && { issue: request.story.issue }),
    ...(request.story?.title != null && { title: request.story.title }),
  }),
  base: (request) => (request.base != null ? { base: request.base } : {}),
  fromArtifacts: (request) => (request.fromArtifacts ? { fromArtifacts: true } : {}),
})

const workflowArgs = (request) => {
  const fields = Object.keys(request).filter((key) => key !== 'command')
  assert.deepEqual(fields.filter((key) => !(key in ARGUMENT_OF)), [], 'every parsed field is mapped to a workflow argument')
  return Object.assign({}, ...fields.map((key) => ARGUMENT_OF[key](request)))
}

test('each run example asks the workflow for what /skraft asks in Claude Code', async () => {
  const { parseSkraftCommand } = await import(pathToFileURL(join(drivers, 'claude-mod/command-args.mjs')).href)
  const { readArgs } = await import(pathToFileURL(join(drivers, 'copilot-workflow/workflow-args.mjs')).href)
  const rows = runTable()
  for (const typed of ['paiement #42 Paiement par carte', 'paiement --base develop', 'paiement --from-artifacts', 'paiement Support --base flag', 'paiement #0'])
    assert.ok(rows.some((row) => row.typed === typed), `the table has the example ${typed}`)
  for (const { typed, expected } of rows) {
    assert.deepEqual(workflowArgs(parseSkraftCommand(typed)), expected, typed)
    const read = await readArgs({ args: expected })
    assert.equal(read.ok, true, `${typed} is accepted by the workflow`)
  }
})

test('the command routes the word backlog differently from Claude Code only when the backlog tracking folder exists (intended divergence)', async () => {
  const { parseSkraftCommand } = await import(pathToFileURL(join(drivers, 'claude-mod/command-args.mjs')).href)
  assert.deepEqual(parseSkraftCommand('backlog'), { command: 'run', slug: 'backlog', story: null, base: null, fromArtifacts: false })
  const prose = readCommand().replace(/\s+/g, ' ')
  assert.match(prose, /`backlog` → Backlog, except that `backlog` is a slug → Run when `\.copilot-tracking\/skraft-plans\/backlog\/` exists/)
  assert.match(prose, /the person selects `Skraft - Backlog Discoverer` as the chat's agent directly/)
  assert.doesNotMatch(prose, /ask(ing)? whether they meant/)
})

test('no shipped prompt names the skraft_decide tool', () => {
  const plugins = ['skraft-framework', 'skraft-backlog', 'skraft-brownfield'].map((name) => join(repoRoot, 'plugins', name))
  const prompts = plugins
    .flatMap((root) => ['com.github.copilot/agents', 'com.anthropic.claude-code/agents', 'skills', 'com.github.copilot/commands', 'commands'].map((dir) => join(root, dir)))
    .flatMap(walk)
    .filter((path) => path.endsWith('.md'))
  assert.ok(prompts.length > 0)
  assert.deepEqual(prompts.filter((path) => readFileSync(path, 'utf8').includes('skraft_decide')), [])
})

test('the command names only agents the plugins ship', () => {
  const shipped = [framework, backlog]
    .flatMap((root) => walk(join(root, 'com.github.copilot/agents')))
    .map((path) => readFrontMatter(readFileSync(path, 'utf8')).data.name)
  const named = [...readCommand().matchAll(/`(Skraft - [^`]+)`/g)].map((match) => match[1])
  assert.ok(named.length > 0, 'the command names agents')
  assert.deepEqual(named.filter((name) => !shipped.includes(name)), [])
})

test('the agent the command hands a run to takes every run argument', () => {
  const orchestrator = readFileSync(join(framework, 'com.github.copilot/agents/skraft-orchestrator.agent.md'), 'utf8')
  const init = /`skraft init [^`\n]*`/.exec(orchestrator)
  assert.ok(init, 'the run line names the skraft init command')
  assert.match(init[0], /--base <ref>/)
  assert.match(init[0], /--from-artifacts/)
  const list = /Start or resume the run with `\{([^}]*)\}`/.exec(orchestrator)
  assert.ok(list, 'the argument list is given')
  const keys = list[1].split(',').map((key) => key.trim().replace('?', ''))
  assert.ok(keys.includes('base') && keys.includes('fromArtifacts'), 'the argument list includes base and fromArtifacts')
})
