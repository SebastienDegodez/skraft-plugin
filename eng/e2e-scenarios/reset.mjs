#!/usr/bin/env node
// Resets the sandbox of an e2e scenario, so the same story can be played again from scratch.
// See eng/e2e-scenarios/README.md.
//   node eng/e2e-scenarios/reset.mjs <case> --workdir <dir> [--plugin <dir>]
// It rewrites main of the sandbox repository named in <case>/scenario.json from the case's seed
// (force push), closes its open pull requests and scenario issues, deletes every other branch,
// opens the case's issue again, and leaves a fresh clone in --workdir on the run's branch.
// Exit: 0 reset, 2 usage or environment error.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { branchOf, readIssue, renderConfig } from './seed.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const COPILOT_HOME = process.env.COPILOT_HOME || join(homedir(), '.copilot')
const DEFAULT_PLUGIN = join(COPILOT_HOME, 'installed-plugins', 'skraft', 'skraft')
const LABEL = 'skraft-scenario'
const MARKER = join('.git', 'skraft-scenario.json')
const TEMPLATE = 'skraft-config.template.json'
// What a hand check of the seed leaves at its root; never part of the sandbox.
const GENERATED = new Set(['node_modules', 'reports', '.stryker-tmp', '.copilot-tracking'])

class UsageError extends Error {}

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) throw new UsageError(`${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout || String(result.error)).trim()}`)
  return result.stdout.trim()
}

const lines = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean)

const options = () => {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { workdir: { type: 'string' }, plugin: { type: 'string' } } })
  const [name] = positionals
  if (!name || !values.workdir) throw new UsageError('usage: reset.mjs <case> --workdir <dir> [--plugin <dir>]')
  const scenario = join(HERE, name)
  if (!existsSync(join(scenario, 'seed'))) throw new UsageError(`no scenario named ${name} in ${HERE}`)
  // The repository is the scenario's, never an argument: a slip would wipe another repository.
  const { repo, slug } = JSON.parse(readFileSync(join(scenario, 'scenario.json'), 'utf8'))
  return { name, scenario, repo, slug, workdir: resolve(values.workdir), plugin: resolve(values.plugin ?? DEFAULT_PLUGIN) }
}

// The plugin under test must carry the shipped workflow the seed's run follows.
const checkPlugin = (plugin) => {
  if (!existsSync(join(plugin, 'workflows', 'pipeline.skraft.dot'))) {
    throw new UsageError(`${plugin} holds no workflows/pipeline.skraft.dot: install the plugin from integration/v2-next first (see README)`)
  }
}

// Only a folder this script made is deleted; the marker is written before anything can fail.
const freshWorkdir = (workdir) => {
  if (existsSync(workdir) && !existsSync(join(workdir, MARKER))) throw new UsageError(`${workdir} exists and was not made by reset.mjs: choose another --workdir`)
  rmSync(workdir, { recursive: true, force: true })
  mkdirSync(workdir, { recursive: true })
  run('git', ['init', '--quiet', '--initial-branch', 'main'], workdir)
  writeFileSync(join(workdir, MARKER), '{}\n')
}

const plantSeed = ({ scenario, workdir, plugin }) => {
  const seed = join(scenario, 'seed')
  cpSync(seed, workdir, { recursive: true, filter: (source) => !GENERATED.has(relative(seed, source).split(sep)[0]) })
  const template = join(workdir, TEMPLATE)
  writeFileSync(join(workdir, 'skraft-config.json'), renderConfig(readFileSync(template, 'utf8'), plugin))
  rmSync(template)
}

const pushMain = ({ name, repo, workdir }) => {
  run('git', ['add', '--all'], workdir)
  run('git', ['commit', '--quiet', '--message', `chore: graine du scénario ${name}`], workdir)
  run('git', ['remote', 'add', 'origin', `https://github.com/${repo}.git`], workdir)
  run('git', ['push', '--quiet', '--force', 'origin', 'main'], workdir)
}

const closePullRequests = (repo) => {
  for (const number of lines(run('gh', ['pr', 'list', '--repo', repo, '--state', 'open', '--json', 'number', '--jq', '.[].number']))) {
    run('gh', ['pr', 'close', number, '--repo', repo, '--comment', 'Remise à zéro du scénario.'])
  }
}

const deleteBranches = (workdir) => {
  const heads = lines(run('git', ['ls-remote', '--heads', 'origin'], workdir)).map((line) => line.split('refs/heads/')[1])
  for (const branch of heads.filter((head) => head !== 'main')) run('git', ['push', '--quiet', 'origin', '--delete', branch], workdir)
}

const reopenIssue = ({ scenario, repo, workdir }) => {
  run('gh', ['label', 'create', LABEL, '--repo', repo, '--force', '--color', '5319e7', '--description', 'Issue rejouée par eng/e2e-scenarios'])
  for (const number of lines(run('gh', ['issue', 'list', '--repo', repo, '--label', LABEL, '--state', 'open', '--json', 'number', '--jq', '.[].number']))) {
    run('gh', ['issue', 'close', number, '--repo', repo, '--reason', 'not planned', '--comment', 'Remise à zéro du scénario.'])
  }
  const issue = readIssue(readFileSync(join(scenario, 'issue.md'), 'utf8'))
  const bodyFile = join(workdir, '.git', 'skraft-scenario-issue.md')
  writeFileSync(bodyFile, issue.body)
  const url = run('gh', ['issue', 'create', '--repo', repo, '--title', issue.title, '--body-file', bodyFile, '--label', LABEL])
  const number = Number(url.split('/').pop())
  if (!Number.isInteger(number) || number < 1) throw new UsageError(`gh issue create answered ${url}, not an issue URL`)
  return { number, title: issue.title }
}

const main = () => {
  const target = options()
  checkPlugin(target.plugin)
  run('gh', ['auth', 'status', '--hostname', 'github.com'])
  freshWorkdir(target.workdir)
  plantSeed(target)
  pushMain(target)
  closePullRequests(target.repo)
  deleteBranches(target.workdir)
  const issue = reopenIssue(target)
  const branch = branchOf(issue.number, target.slug)
  run('git', ['switch', '--quiet', '--create', branch], target.workdir)
  const args = { slug: target.slug, issue: issue.number, title: issue.title }
  writeFileSync(join(target.workdir, MARKER), `${JSON.stringify({ scenario: target.name, repo: target.repo, plugin: target.plugin, branch, args }, null, 2)}\n`)
  process.stdout.write([
    `Sandbox ${target.repo} reset to the ${target.name} seed; issue #${issue.number} opened.`,
    `Clone: ${target.workdir} (branch ${branch})`,
    'Next: npm ci in the clone, then start the skraft-pipeline workflow with:',
    JSON.stringify(args),
    '',
  ].join('\n'))
}

try {
  main()
} catch (error) {
  process.stderr.write(`reset: ${error.message}\n`)
  process.exitCode = 2
}
