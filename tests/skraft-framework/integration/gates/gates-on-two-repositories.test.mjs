import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { commitAll, git, journal, skraft, tempFolder } from '../support/workspace.mjs'

/**
 * `payment-api/` (the working copy, .NET) and `payment-web/` beside it (React, its own
 * repository). Every gate command is `node recorder.mjs <component>/<gate>`: it appends what
 * ran and from where to ran.log, and exits with the code in fail.json, if any. A mutation gate
 * also writes, where Stryker.NET writes it, a report whose one mutant is killed.
 */
const twoRepositories = (t) => {
  const root = tempFolder(t)
  const recorder = join(root, 'recorder.mjs')
  const killed = { schemaVersion: '1', files: { 'src/Payment.cs': { language: 'cs', source: '', mutants: [{ id: '1', mutatorName: 'Equality', status: 'Killed', location: { start: { line: 1, column: 1 }, end: { line: 1, column: 5 } } }] } } }
  writeFileSync(recorder, [
    "import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'",
    "import { basename, join } from 'node:path'",
    'const [, , gate, log, fail, ...rest] = process.argv',
    'appendFileSync(log, `${[basename(process.cwd()), gate, ...rest].join(\' \')}\\n`)',
    "if (gate.endsWith('/mutation')) {",
    "  mkdirSync(join('StrykerOutput', 'reports'), { recursive: true })",
    `  writeFileSync(join('StrykerOutput', 'reports', 'mutation-report.json'), ${JSON.stringify(JSON.stringify(killed))})`,
    '}',
    "const codes = existsSync(fail) ? JSON.parse(readFileSync(fail, 'utf8')) : {}",
    'process.exit(codes[gate] ?? 0)',
    '',
  ].join('\n'))
  const log = join(root, 'ran.log')
  const fail = join(root, 'fail.json')
  const command = (gate) => `node "${recorder}" ${gate} "${log}" "${fail}"`
  const api = join(root, 'payment-api')
  mkdirSync(join(api, 'src'), { recursive: true })
  writeFileSync(join(api, 'Payment.sln'), '')
  writeFileSync(join(api, 'src', 'Payment.cs'), 'class Payment {}\n')
  writeFileSync(join(api, 'skraft-config.json'), JSON.stringify({
    components: [
      { name: 'api', root: '.', stack: 'dotnet', mocking: { strategy: 'inprocess' }, commands: { build: command('api/build'), test: command('api/test'), mutation: `${command('api/mutation')} --since:{baseSha}` } },
      { name: 'web', root: '../payment-web', stack: 'react', mocking: { strategy: 'inprocess' }, commands: { lint: command('web/lint'), test: command('web/test') } },
    ],
  }, null, 2))
  writeFileSync(join(api, '.gitignore'), '.copilot-tracking/\n')
  const apiBase = commitAll(api)
  const web = join(root, 'payment-web')
  mkdirSync(join(web, 'src'), { recursive: true })
  writeFileSync(join(web, 'package.json'), '{"dependencies":{"react":"^19.0.0"}}\n')
  writeFileSync(join(web, 'src', 'App.tsx'), 'export const App = () => null\n')
  const webBase = commitAll(web)
  const ran = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split(/\r?\n/) : [])
  return { root, api, web, apiBase, webBase, ran, failWith: (codes) => writeFileSync(fail, JSON.stringify(codes)), resetLog: () => writeFileSync(log, '') }
}

test('init journals the merge base of each repository; --base and baseBranch choose another one', async (t) => {
  const { api, web, apiBase, webBase } = twoRepositories(t)
  git(api, 'checkout', '-q', '-b', 'feature/pay')
  git(web, 'checkout', '-q', '-b', 'develop')
  writeFileSync(join(web, 'src', 'Cart.tsx'), 'export const Cart = () => null\n')
  git(web, 'add', '-A')
  git(web, 'commit', '-q', '-m', 'cart')
  const developHead = git(web, 'rev-parse', 'HEAD')
  git(web, 'checkout', '-q', '-b', 'feature/pay')

  const init = await skraft(api, ['init', 'checkout'])

  assert.equal(init.status, 0, init.stderr)
  assert.deepEqual(journal(api, 'checkout')[0].base, [
    { component: null, root: '.', repository: '.', ref: 'main', source: 'default', sha: apiBase },
    { component: 'api', root: '.', repository: '.', ref: 'main', source: 'default', sha: apiBase },
    { component: 'web', root: '../payment-web', repository: '../payment-web', ref: 'main', source: 'default', sha: webBase },
  ])

  const config = JSON.parse(readFileSync(join(api, 'skraft-config.json'), 'utf8'))
  config.components[1].baseBranch = 'develop'
  writeFileSync(join(api, 'skraft-config.json'), JSON.stringify(config))
  assert.equal((await skraft(api, ['init', 'refund'])).status, 0)
  assert.deepEqual(journal(api, 'refund')[0].base.at(-1), { component: 'web', root: '../payment-web', repository: '../payment-web', ref: 'develop', source: 'component', sha: developHead })

  const flagged = await skraft(api, ['init', 'payout', '--base', 'develop'])
  assert.equal(flagged.status, 1)
  assert.equal(flagged.stderr, 'the working copy (.) has no merge base with develop; component api (.) has no merge base with develop; set baseBranch in skraft-config.json or pass --base <ref>\n')
  assert.equal((await skraft(api, ['init', 'payout', '--base', 'main'])).status, 0)
  assert.deepEqual(journal(api, 'payout')[0].base.map(({ ref, source }) => `${ref} ${source}`), ['main flag', 'main flag', 'main flag'])
})

test('a change in the front runs the front gates only; --all runs every gate, each from its own root', async (t) => {
  const { api, web, apiBase, ran, resetLog } = twoRepositories(t)
  assert.equal((await skraft(api, ['init', 'checkout'])).status, 0)
  writeFileSync(join(web, 'src', 'Cart.tsx'), 'export const Cart = () => null\n')

  const loop = await skraft(api, ['gate'])

  assert.equal(loop.status, 0, loop.stdout + loop.stderr)
  assert.deepEqual(ran(), ['payment-web web/lint', 'payment-web web/test'])
  assert.equal(loop.stdout, 'pass  web/lint\npass  web/test\nskraft checkout: gates passed — 2 gates passed on web\n')
  const asJson = JSON.parse((await skraft(api, ['gate', '--json'])).stdout)
  assert.deepEqual([asJson.status, asJson.scope, asJson.components], ['passed', 'touched', ['web']])

  resetLog()
  const closure = await skraft(api, ['gate', '--all'])

  assert.equal(closure.status, 0, closure.stdout)
  assert.deepEqual(ran(), ['payment-api api/build', 'payment-api api/test', `payment-api api/mutation --since:${apiBase}`, 'payment-web web/lint', 'payment-web web/test'])
  const mutation = journal(api, 'checkout').find((event) => event.type === 'gate.ran' && event.gate === 'mutation')
  assert.ok(mutation.command.endsWith('--since:{baseSha}'))
  assert.match(readFileSync(join(api, '.copilot-tracking', 'skraft-plans', 'checkout', 'gates', 'api', 'mutation-1.log'), 'utf8'), new RegExp(`^\\$ node .*--since:${apiBase}\\ncwd: \\.\\nresult: pass`))
})

test('a failing gate exits 1 as deterministic; a missing program exits 1 as environment', async (t) => {
  const { api, failWith } = twoRepositories(t)
  assert.equal((await skraft(api, ['init', 'checkout'])).status, 0)
  failWith({ 'api/test': 2 })

  const failed = await skraft(api, ['gate', '--all', '--json'])

  assert.equal(failed.status, 1)
  const outcome = JSON.parse(failed.stdout)
  assert.deepEqual([outcome.status, outcome.failure, outcome.reason], ['failed', 'deterministic', 'api/test: exited 2'])
  assert.match(readFileSync(outcome.gates[1].evidence, 'utf8'), /^result: fail \(deterministic\): exited 2$/m)

  const config = JSON.parse(readFileSync(join(api, 'skraft-config.json'), 'utf8'))
  config.components[1].commands.lint = 'skraft-no-such-linter .'
  writeFileSync(join(api, 'skraft-config.json'), JSON.stringify(config))
  failWith({})

  const missing = await skraft(api, ['gate', '--all'])

  assert.equal(missing.status, 1)
  assert.match(missing.stdout, /^fail \(environment\) {2}web\/lint: command not found: skraft-no-such-linter; install it or change the command in skraft-config\.json$/m)
})

test('gate without an active pipeline is refused and exits 1', async (t) => {
  const { api } = twoRepositories(t)

  const run = await skraft(api, ['gate'])

  assert.equal(run.status, 1)
  assert.match(run.stdout, /^skraft: gates refused \(no-active-pipeline\) — no active pipeline/m)
})
