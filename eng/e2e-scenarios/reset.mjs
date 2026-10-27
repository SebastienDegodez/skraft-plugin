#!/usr/bin/env node
// Resets the sandbox of an e2e scenario, so the same story can be played again from scratch.
// See eng/e2e-scenarios/README.md.
//   node eng/e2e-scenarios/reset.mjs <case> --workdir <dir> --plugin <plugins/skraft-framework of the tree Copilot loads>
// It rewrites main of the sandbox repository named in <case>/scenario.json from the case's seed
// (force push), closes its open pull requests, its scenario and backlog issues, deletes its
// milestones and every other branch. A case with an issue.md opens that issue again and leaves a
// fresh clone in --workdir on the run's branch; a case without one leaves the clone on main.
// Exit: 0 reset, 2 usage or environment error.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { branchOf, readIssue, renderConfig } from './seed.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const LABEL = 'skraft-scenario'
// What the backlog workflow labels the issues it publishes (plugins/skraft-backlog/prd-backlog/publish.mjs).
const BACKLOG_LABEL = 'skraft-backlog'
const PIPELINE = 'skraft-pipeline'
const MARKER = join('.git', 'skraft-scenario.json')
const TEMPLATE = 'skraft-config.template.json'
// What a hand check of the seed or of one of its components leaves behind; never part of the sandbox.
const GENERATED = new Set(['node_modules', 'dist', 'reports', '.stryker-tmp', '.copilot-tracking', 'test-results', 'playwright-report', 'skraft-visuals'])

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
  if (!name || !values.workdir || !values.plugin) throw new UsageError('usage: reset.mjs <case> --workdir <dir> --plugin <dir>')
  const scenario = join(HERE, name)
  if (!existsSync(join(scenario, 'scenario.json'))) throw new UsageError(`no scenario named ${name} in ${HERE}`)
  // The repository is the scenario's, never an argument: a slip would wipe another repository.
  const { repo, slug, seed = name, workflow = PIPELINE, prd } = JSON.parse(readFileSync(join(scenario, 'scenario.json'), 'utf8'))
  if (!existsSync(join(HERE, seed, 'seed'))) throw new UsageError(`${name}: no seed in ${join(HERE, seed)}`)
  return { name, scenario, seed: join(HERE, seed, 'seed'), repo, slug, workflow, prd, workdir: resolve(values.workdir), plugin: resolve(values.plugin) }
}

// The plugins under test must carry the workflow the scenario runs.
const checkPlugin = ({ plugin, workflow }) => {
  if (!existsSync(join(plugin, 'workflows', 'pipeline.skraft.dot'))) {
    throw new UsageError(`${plugin} holds no workflows/pipeline.skraft.dot: install the plugin from integration/v2-next first (see README)`)
  }
  if (workflow !== PIPELINE && !existsSync(join(plugin, '..', 'skraft-backlog', 'com.github.copilot', 'extensions', workflow))) {
    throw new UsageError(`${join(plugin, '..', 'skraft-backlog')} ships no ${workflow} extension: install skraft-backlog from the same tree (see README)`)
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

// The seed, then the case's own files on top of it (a scenario may replay another case's seed).
const plantSeed = ({ scenario, seed, workdir, plugin }) => {
  cpSync(seed, workdir, { recursive: true, filter: (source) => !relative(seed, source).split(sep).some((part) => GENERATED.has(part)) })
  if (existsSync(join(scenario, 'files'))) cpSync(join(scenario, 'files'), workdir, { recursive: true })
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

// Every issue an earlier pass opened or published, whichever scenario played it.
const closeIssues = (repo) => {
  for (const label of [LABEL, BACKLOG_LABEL]) {
    const numbers = lines(run('gh', ['issue', 'list', '--repo', repo, '--label', label, '--state', 'open', '--limit', '500', '--json', 'number', '--jq', '.[].number']))
    for (const number of numbers) run('gh', ['issue', 'close', number, '--repo', repo, '--reason', 'not planned', '--comment', 'Remise à zéro du scénario.'])
  }
}

// The backlog workflow reuses a milestone by its title: a fresh pass must create its own.
const deleteMilestones = (repo) => {
  for (const number of lines(run('gh', ['api', `repos/${repo}/milestones?state=all&per_page=100`, '--jq', '.[].number']))) {
    run('gh', ['api', '--method', 'DELETE', `repos/${repo}/milestones/${number}`])
  }
}

const reopenIssue = ({ scenario, repo, workdir }) => {
  run('gh', ['label', 'create', LABEL, '--repo', repo, '--force', '--color', '5319e7', '--description', 'Issue rejouée par eng/e2e-scenarios'])
  const issue = readIssue(readFileSync(join(scenario, 'issue.md'), 'utf8'))
  const bodyFile = join(workdir, '.git', 'skraft-scenario-issue.md')
  writeFileSync(bodyFile, issue.body)
  const url = run('gh', ['issue', 'create', '--repo', repo, '--title', issue.title, '--body-file', bodyFile, '--label', LABEL])
  const number = Number(url.split('/').pop())
  if (!Number.isInteger(number) || number < 1) throw new UsageError(`gh issue create answered ${url}, not an issue URL`)
  return { number, title: issue.title }
}

// A pipeline case works on its issue's branch; a backlog case reads its PRD on main.
const startingPoint = (target) => {
  if (!existsSync(join(target.scenario, 'issue.md'))) return { branch: 'main', opened: 'no issue opened', args: { prd: target.prd, slug: target.slug } }
  const issue = reopenIssue(target)
  const branch = branchOf(issue.number, target.slug)
  run('git', ['switch', '--quiet', '--create', branch], target.workdir)
  return { branch, opened: `issue #${issue.number} opened`, args: { slug: target.slug, issue: issue.number, title: issue.title } }
}

const main = () => {
  const target = options()
  checkPlugin(target)
  run('gh', ['auth', 'status', '--hostname', 'github.com'])
  freshWorkdir(target.workdir)
  plantSeed(target)
  pushMain(target)
  closePullRequests(target.repo)
  deleteBranches(target.workdir)
  closeIssues(target.repo)
  deleteMilestones(target.repo)
  const { branch, opened, args } = startingPoint(target)
  writeFileSync(join(target.workdir, MARKER), `${JSON.stringify({ scenario: target.name, repo: target.repo, plugin: target.plugin, workflow: target.workflow, branch, args }, null, 2)}\n`)
  process.stdout.write([
    `Sandbox ${target.repo} reset to the ${target.name} scenario; ${opened}.`,
    `Clone: ${target.workdir} (branch ${branch})`,
    `Next: install the clone as its README says, then start the ${target.workflow} workflow with:`,
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
