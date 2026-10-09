#!/usr/bin/env node
// Runs the skraft-refine workflow for real, on a repository you own, one scenario per issue,
// then checks each proposal comment. Every scenario is a paid agent run: this is a manual check
// before a release, never part of CI.
//
//   node tests/skraft-backlog/trial/run-trial.mjs --repo <owner/trial-repo> [--only <name>] [--dry-run]
//
// Needs `gh` logged in with repo scope, the gh-aw extension, and in the trial repository the
// engine secret (COPILOT_GITHUB_TOKEN) and a published release of skraft-backlog for the
// skills the workflow pins.
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const workflow = fileURLToPath(new URL('../../../plugins/skraft-backlog/workflows/skraft-refine.md', import.meta.url))
const { scenarios, rerun, docs } = JSON.parse(readFileSync(join(here, 'scenarios.json'), 'utf8'))

const args = process.argv.slice(2)
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined }
const repo = option('--repo')
const only = option('--only')
const dryRun = args.includes('--dry-run')
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
  console.error('usage: run-trial.mjs --repo <owner/trial-repo> [--only <name>] [--dry-run]')
  process.exit(2)
}

const gh = (ghArgs, input) => {
  if (dryRun) { console.log(`$ gh ${ghArgs.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`); return '{}' }
  return execFileSync('gh', ghArgs, { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 })
}

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? walk(path) : [path]
})

// 1. The documents the scenarios link or should only offer for confirmation, and the marker
// check the workflow's pre-activation step runs (`gh aw add` installs it from aw.yml; a trial
// of the workflow file alone does not).
const marker = fileURLToPath(new URL('../../../plugins/skraft-backlog/workflows/shared/skraft-refine-marker.mjs', import.meta.url))
const uploads = [
  ...walk(join(here, docs)).map((path) => [path, relative(here, path).split(sep).join('/')]),
  [marker, '.github/workflows/shared/skraft-refine-marker.mjs'],
]
for (const [path, target] of uploads) {
  let sha
  try { sha = JSON.parse(gh(['api', `repos/${repo}/contents/${target}`])).sha } catch { sha = undefined }
  gh(['api', '--method', 'PUT', `repos/${repo}/contents/${target}`, '-f', `message=trial: ${target}`,
    '-f', `content=${readFileSync(path).toString('base64')}`, ...(sha ? ['-f', `sha=${sha}`] : [])])
}

const markerComments = (number) => dryRun ? [] : JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${repo}/issues/${number}/comments?per_page=100`]))
  .flat().filter((comment) => /skraft-refine v=\S+ hash=[0-9a-f]{16}/.test(comment.body))

const failures = []
const issues = {}
for (const scenario of scenarios.filter((s) => !only || s.name === only)) {
  // 2. The issue first: created before the workflow is installed, it triggers nothing.
  const url = gh(['issue', 'create', '--repo', repo, '--title', `[trial ${scenario.name}] ${scenario.title}`, '--body-file', '-'], scenario.body).trim()
  const number = dryRun ? '<n>' : url.split('/').pop()
  issues[scenario.name] = number
  // 3. The workflow, dispatched by hand on that issue.
  gh(['aw', 'trial', workflow, '--repo', repo, '--trigger-context', dryRun ? `https://github.com/${repo}/issues/<n>` : url, '--yes', '--timeout', '30'])
  if (dryRun) continue
  const comment = markerComments(number).at(-1)
  if (!comment) { failures.push(`${scenario.name}: no proposal comment on #${number}`); continue }
  for (const pattern of scenario.expect ?? []) if (!new RegExp(pattern, 'm').test(comment.body)) failures.push(`${scenario.name}: missing /${pattern}/`)
  for (const pattern of scenario.reject ?? []) if (new RegExp(pattern, 'm').test(comment.body)) failures.push(`${scenario.name}: unexpected /${pattern}/`)
}

// 4. The same issue again, unchanged: the pre-activation check skips it.
if (rerun && issues[rerun.of] && !dryRun) {
  const before = markerComments(issues[rerun.of]).length
  gh(['aw', 'trial', workflow, '--repo', repo, '--trigger-context', `https://github.com/${repo}/issues/${issues[rerun.of]}`, '--yes', '--timeout', '30'])
  if (markerComments(issues[rerun.of]).length !== before) failures.push(`${rerun.name}: an issue already refined got a second proposal`)
}

if (failures.length) {
  console.error(`✗ ${failures.length} trial check(s) failed:\n${failures.join('\n')}`)
  process.exit(1)
}
console.log(dryRun ? 'dry run: commands above' : '✓ every trial scenario holds')
