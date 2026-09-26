#!/usr/bin/env node
// Native matcher experiment. Installs only disposable plugins; two bounded model calls.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: {
  cli: { type: 'string' }, 'expected-version': { type: 'string' }, help: { type: 'boolean' },
} })
if (values.help) {
  console.log('Usage: node scripts/copilot-matcher-smoke.mjs --cli /absolute/runtime [--expected-version 1.0.83]')
  process.exit(0)
}
if (!values.cli) throw new Error('--cli must pin the runtime executable')
const cli = resolve(values.cli)
const root = mkdtempSync(join(tmpdir(), 'skraft matcher smoke '))
console.log(`Evidence: ${root}`)
const write = (path, value) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n')
}
const cases = [
  ['unfiltered', undefined], ['Bash', 'Bash'], ['bash', 'bash'], ['Write', 'Write'],
  ['never', 'NoSuchToolForMatcherProbe'], ['alternation', 'Bash|Write'], ['wildcard', '.*'],
]
const results = []
for (const format of ['legacy', 'v1']) {
  const dir = join(root, format)
  const workspace = join(dir, 'workspace')
  const marketplace = join(dir, 'marketplace')
  const plugin = join(marketplace, 'plugin')
  const env = { ...process.env, COPILOT_HOME: join(dir, 'home'),
    COPILOT_CACHE_HOME: join(dir, 'cache'), COPILOT_AUTO_UPDATE: 'false',
    SKRAFT_MATCHER_RECEIPT: join(dir, 'receipts.jsonl') }
  mkdirSync(workspace, { recursive: true })
  mkdirSync(env.COPILOT_HOME, { recursive: true })
  const run = (args) => {
    const r = spawnSync(cli, args, { cwd: workspace, env, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 })
    if (r.error || r.status !== 0) throw new Error(`${args[0]}: ${r.error?.message ?? r.stderr ?? r.stdout}`)
    return r.stdout
  }
  const version = run(['--version']).trim()
  if (values['expected-version'] && !version.includes(`CLI ${values['expected-version']}.`)) throw new Error(version)
  write(join(marketplace, '.github/plugin/marketplace.json'), {
    name: 'matcher-probe', owner: { name: 'probe' }, plugins: [{ name: 'matcher-probe', source: './plugin' }],
  })
  write(join(plugin, 'plugin.json'), { name: 'matcher-probe', version: '1.0.0',
    ...(format === 'v1' ? { $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json' } : {}),
  })
  write(join(plugin, 'record.mjs'), `import { appendFileSync } from 'node:fs';
let text = ''; for await (const chunk of process.stdin) text += chunk;
const raw = JSON.parse(text || '{}');
appendFileSync(process.env.SKRAFT_MATCHER_RECEIPT, JSON.stringify({
  event: process.argv[2], label: process.argv[3], toolName: raw.toolName ?? raw.tool_name,
  toolArgs: raw.toolArgs ?? raw.tool_input ?? raw.toolInput,
}) + '\\n');
`)
  const hooks = Object.fromEntries(['PreToolUse', 'PostToolUse'].map((event) => [event,
    cases.map(([label, matcher]) => ({ ...(matcher === undefined ? {} : { matcher }), hooks: [{
      type: 'command', command: `node "\${CLAUDE_PLUGIN_ROOT}/record.mjs" ${event} ${label}`,
    }] })),
  ]))
  write(join(plugin, format === 'v1' ? 'com.github.copilot/hooks/hooks.json' : 'hooks/hooks.json'), { hooks })
  run(['plugin', 'marketplace', 'add', marketplace])
  run(['plugin', 'install', 'matcher-probe@matcher-probe'])
  const output = run(['-p', 'Use bash exactly once to run: echo matcher-probe. Then stop. Do not use other tools.',
    '--allow-tool', 'shell(echo matcher-probe)', '--log-level', 'debug', '--log-dir', join(dir, 'logs')])
  write(join(dir, 'output.txt'), output)
  const receipts = existsSync(env.SKRAFT_MATCHER_RECEIPT)
    ? readFileSync(env.SKRAFT_MATCHER_RECEIPT, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : []
  const observations = Object.fromEntries(['PreToolUse', 'PostToolUse'].map((event) => [event,
    cases.map(([label, matcher]) => ({ label, matcher: matcher ?? null,
      count: receipts.filter((r) => r.event === event && r.label === label).length })),
  ]))
  const result = { format, version, observations, receipts }
  results.push(result)
  write(join(dir, 'result.json'), result)
  console.log(JSON.stringify(result, null, 2))
  for (const event of ['PreToolUse', 'PostToolUse']) {
    if (receipts.filter((r) => r.event === event && r.label === 'unfiltered').length !== 1) {
      throw new Error(`${format}/${event}: expected exactly one unfiltered control; experiment inconclusive`)
    }
  }
}
write(join(root, 'results.json'), results)
console.log('Matcher observations captured; successful execution is not an assertion that matching is supported.')