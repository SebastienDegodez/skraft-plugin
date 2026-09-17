#!/usr/bin/env node
// Compare native discovery in disposable installations; --live-hooks opts into model calls.
// Run before changing the shipped format; an installed plugin is not proof of loading.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: {
  cli: { type: 'string' },
  'expected-version': { type: 'string' },
  'live-hooks': { type: 'boolean', default: false },
  help: { type: 'boolean' },
} })
if (values.help) {
  console.log('Usage: node scripts/copilot-plugin-compat-smoke.mjs --cli /absolute/path/to/copilot [--expected-version 1.0.83] [--live-hooks]')
  process.exit(0)
}
if (!values.cli) throw new Error('--cli is required to pin the executable across working directories')
const cli = resolve(values.cli)
const root = mkdtempSync(join(tmpdir(), 'skraft plugin compatibility '))
console.log(`Evidence retained: ${root}`)

const write = (path, content) => {
  mkdirSync(resolve(path, '..'), { recursive: true })
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n')
}
const run = (args, cwd, env) => {
  const result = spawnSync(cli, args, { cwd, env, encoding: 'utf8', timeout: 60_000 })
  if (result.error || result.status !== 0) {
    throw new Error(`${args.join(' ')}: ${result.error?.message ?? result.stderr ?? result.stdout}`)
  }
  return result.stdout.trim()
}

const results = []
for (const format of ['legacy', 'v1']) {
  const dir = join(root, format)
  const home = join(dir, 'home')
  const workspace = join(dir, 'workspace')
  const marketplace = join(dir, 'marketplace')
  const plugin = join(marketplace, 'plugin')
  for (const path of [home, workspace, plugin]) mkdirSync(path, { recursive: true })
  const env = { ...process.env, COPILOT_HOME: home, COPILOT_CACHE_HOME: join(dir, 'cache'),
    COPILOT_AUTO_UPDATE: 'false', SKRAFT_COMPAT_RECEIPT: join(dir, 'receipt.jsonl') }
  write(join(marketplace, '.github/plugin/marketplace.json'), {
    name: 'compat', owner: { name: 'compat' }, plugins: [{ name: 'compat', source: './plugin' }],
  })
  write(join(plugin, 'plugin.json'), {
    ...(format === 'v1' ? { $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json' } : {}),
    name: 'compat', version: '1.0.0', description: 'Isolated discovery probe',
  })
  const namespace = format === 'v1' ? 'com.github.copilot/' : ''
  for (const [id, visible] of [['compat-visible', true], ['compat-hidden', false]]) {
    write(join(plugin, namespace, 'agents', `${id}.agent.md`),
      `---\nname: ${id}\ndescription: Isolated plugin discovery probe\nuser-invocable: ${visible}\n---\nReturn only compatibility-probe.\n`)
  }
  write(join(plugin, 'skills/compat-skill/SKILL.md'),
    '---\nname: compat-skill\ndescription: Isolated skill discovery probe\n---\nReturn only compatibility-probe.\n')
  write(join(plugin, 'receipt.mjs'),
    'import { appendFileSync } from "node:fs"; appendFileSync(process.env.SKRAFT_COMPAT_RECEIPT, JSON.stringify({event: process.argv[2], root: process.env.CLAUDE_PLUGIN_ROOT, url: import.meta.url}) + "\\n");\n')
  const hookManifest = { hooks: Object.fromEntries(
    ['SessionStart', 'PreToolUse'].map((event) => [event, [{ hooks: [{
      type: 'command', command: `node "\${CLAUDE_PLUGIN_ROOT}/receipt.mjs" ${event}`,
    }] }]]),
  ) }
  write(join(plugin, namespace, 'hooks/hooks.json'), hookManifest)
  // Match the shipping package: native Claude root plus Copilot v1 namespace.
  if (format === 'v1') write(join(plugin, 'hooks/hooks.json'), hookManifest)
  const version = run(['--version'], workspace, env)
  if (values['expected-version'] && !version.includes(`CLI ${values['expected-version']}.`)) {
    throw new Error(`Unexpected runtime version: ${version}`)
  }
  console.log(`${format}: ${version.split('\n')[0]}`)
  run(['plugin', 'marketplace', 'add', marketplace], workspace, env)
  run(['plugin', 'install', 'compat@compat'], workspace, env)
  const installed = run(['plugin', 'list'], workspace, env)
  write(join(dir, 'installed.txt'), installed)

  // An intentionally unknown selection prints the runtime's available IDs and exits
  // before inference. This is a version-sensitive diagnostic, not a public list API.
  const discovery = spawnSync(cli, ['--agent', 'compat-does-not-exist', '-p', 'Do not run tools.'], {
    cwd: workspace, env, encoding: 'utf8', timeout: 60_000,
  })
  const output = `${discovery.stdout ?? ''}\n${discovery.stderr ?? ''}`
  write(join(dir, 'agent-selection.txt'), output)
  if (discovery.error || !/No such agent: compat-does-not-exist, available:/.test(output)) {
    throw new Error(`Agent discovery diagnostic unavailable: ${discovery.error?.message ?? output}`)
  }
  const agents = output.match(/available:([^\r\n]*)/)?.[1].split(',').map((id) => id.trim()).filter(Boolean) ?? []
  if (values['live-hooks']) {
    // No agent selection: the fixture agent deliberately disallows useful work.
    // The only authorized tool command is harmless and never writes project files.
    const response = run(['-p', 'Use bash to run exactly: echo compatibility-hook-probe. Then stop.',
      '--allow-tool', 'shell(echo compatibility-hook-probe)',
      '--log-level', 'debug', '--log-dir', join(dir, 'live-logs')], workspace, env)
    write(join(dir, 'live-output.txt'), response)
  }
  const receipt = existsSync(env.SKRAFT_COMPAT_RECEIPT)
    ? readFileSync(env.SKRAFT_COMPAT_RECEIPT, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []
  const result = { format, version, agents, hooksTested: values['live-hooks'], hookReceipts: receipt }
  results.push(result)
  write(join(dir, 'discovery.json'), result)
  console.log(JSON.stringify(result, null, 2))
}
write(join(root, 'results.json'), results)
const legacy = results.find((result) => result.format === 'legacy')
if (!['compat:compat-visible', 'compat:compat-hidden'].every((id) => legacy.agents.includes(id))) {
  throw new Error('Legacy control agent not discovered; comparison is inconclusive, not a v1 failure')
}
if (values['live-hooks'] && !legacy.hookReceipts.some((entry) => entry.event === 'PreToolUse')) {
  throw new Error('Legacy hook control did not run; comparison is inconclusive, not a v1 failure')
}
for (const result of results) {
  if (!['compat:compat-visible', 'compat:compat-hidden'].every((id) => result.agents.includes(id))) {
    throw new Error(`${result.format}: expected agents missing`)
  }
  if (values['live-hooks']) {
    for (const event of ['SessionStart', 'PreToolUse']) {
      const count = result.hookReceipts.filter((entry) => entry.event === event).length
      if (count !== 1) throw new Error(`${result.format}: expected one ${event} receipt, got ${count}`)
    }
  }
}
// Report observations, not a certification: this does not exercise a tool refusal,
// a model-dispatched hidden agent, or the interactive picker visibility filter.
console.log('Discovery comparison captured; inspect evidence before migrating the shipped package.')