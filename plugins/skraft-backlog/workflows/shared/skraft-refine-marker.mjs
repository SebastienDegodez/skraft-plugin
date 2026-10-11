#!/usr/bin/env node
// Says whether an issue still needs a refinement proposal. A proposal comment ends with a small
// visible marker carrying the plugin version and a hash of the issue's title and body; the work
// is done when a trusted comment carries the marker for the issue as it reads now. The marker is
// visible text, not an HTML comment: GitHub Agentic Workflows strips HTML comments from the
// comments it posts.
//
//   node refine-marker.mjs hash --title <t> --body-file <f>          → prints the hash
//   node refine-marker.mjs check --repo o/r [--issue N] [--version V] [--force]
//                                [--event-name E --event-path P]
//
// Without --version, `check` takes the version of the skill it ships in (./version.mjs).
// In a GitHub Actions step, --event-name and --event-path default to GITHUB_EVENT_NAME and
// GITHUB_EVENT_PATH: `check` first decides whether the event asks for a refinement at all —
// a new issue, the `skraft-refine` label, a comment starting with `/skraft-refine`, or a manual
// run with --issue — then reads the issue through `gh api`.
//
// It prints `todo=true|false` and a reason; with GITHUB_OUTPUT set it also writes `todo=…` and
// the resolved `issue=…` number there. It always exits 0. A failed lookup answers todo=true, so
// an outage costs one extra run instead of hiding the workflow; an event that does not ask for a
// refinement answers todo=false.
//
// This file is self-contained on purpose: the workflow installs a copy of it under
// .github/workflows/shared/ and runs it before any skill is available.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const COMMAND = 'skraft-refine'
const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR'])

/** Normalized hash of what the proposal was written for: the issue title and body. */
export function issueHash(title, body) {
  const text = `${String(title ?? '').trim()}\n${String(body ?? '').replace(/\r\n?/g, '\n').trim()}`
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16)
}

export const renderMarker = ({ version, hash }) => `<sub>${COMMAND} v=${version} hash=${hash}</sub>`

const MARKER = new RegExp(`\\b${COMMAND}\\s+v=(\\d[\\w.+-]*)\\s+hash=([0-9a-f]{16})\\b`)

export function parseMarker(text) {
  const match = MARKER.exec(String(text ?? ''))
  return match ? { version: match[1], hash: match[2] } : null
}

const COMMAND_LINE = new RegExp(`^\\s*/${COMMAND}(?![\\w-])`)

/** A comment whose first word is /skraft-refine. */
export const asksRefine = (text) => COMMAND_LINE.test(String(text ?? ''))

/** A comment whose first line is /skraft-refine … --force. */
export const asksForce = (text) => asksRefine(text) && /--force\b/.test(String(text ?? '').trimStart().split('\n')[0])

const trusted = (comment) => TRUSTED.has(String(comment?.author_association ?? '').toUpperCase())
  || String(comment?.user?.type ?? '') === 'Bot'

/**
 * Whether the triggering event asks for a refinement, and of which issue.
 * @returns {{ run: true, issue: string, force: boolean } | { run: false, reason: string }}
 */
export function gate({ eventName, payload = {}, issue, force = false }) {
  const number = String(payload.issue?.number ?? issue ?? '').trim()
  switch (eventName) {
    case 'issues':
      if (payload.action === 'opened') return { run: true, issue: number, force }
      if (payload.action === 'labeled' && payload.label?.name === COMMAND) return { run: true, issue: number, force }
      return { run: false, reason: `issues.${payload.action} with label "${payload.label?.name ?? ''}" does not ask for a refinement` }
    case 'issue_comment':
      if (payload.issue?.pull_request) return { run: false, reason: 'a comment on a pull request' }
      if (!asksRefine(payload.comment?.body)) return { run: false, reason: `the comment does not start with /${COMMAND}` }
      return { run: true, issue: number, force: force || asksForce(payload.comment?.body) }
    case 'workflow_dispatch':
    case undefined:
    case '':
      return { run: true, issue: String(issue ?? '').trim(), force }
    default:
      return { run: false, reason: `the ${eventName} event does not ask for a refinement` }
  }
}

/**
 * @param {{ issue: { title: string, body: string, state?: string, pull_request?: object }, comments: object[], version: string, force?: boolean }} input
 * @returns {{ todo: boolean, reason: string }}
 */
export function decide({ issue, comments = [], version, force = false }) {
  if (issue?.pull_request) return { todo: false, reason: 'a pull request, not an issue' }
  if (force) return { todo: true, reason: 'forced' }
  if (String(issue?.state ?? 'open') === 'closed') return { todo: false, reason: 'the issue is closed' }
  const hash = issueHash(issue?.title, issue?.body)
  const done = comments.find((comment) => {
    const marker = parseMarker(comment?.body)
    return marker && marker.hash === hash && marker.version === version && trusted(comment)
  })
  if (done) return { todo: false, reason: `proposal ${done.html_url ?? done.id} already covers this issue text with version ${version}` }
  const stale = comments.some((comment) => parseMarker(comment?.body) && trusted(comment))
  return { todo: true, reason: stale ? 'the issue or the plugin version changed since the last proposal' : 'no proposal yet' }
}

const ghJson = (run, args) => JSON.parse(run('gh', ['api', ...args]))

/** Decides from the event, then reads the issue and its comments through `gh api`. */
export function check({ repo, issue, version, force = false, eventName, payload }, { run = defaultRun } = {}) {
  const asked = gate({ eventName, payload, issue, force })
  if (!asked.run) return { todo: false, reason: asked.reason }
  const number = asked.issue
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repo ?? ''))) return { todo: true, reason: `no usable repository (${repo})` }
  if (!/^\d+$/.test(number)) return { todo: false, reason: 'no issue number' }
  if (!version) return { issue: number, todo: true, reason: 'no version given' }
  try {
    const data = ghJson(run, [`repos/${repo}/issues/${number}`])
    const pages = ghJson(run, ['--paginate', '--slurp', `repos/${repo}/issues/${number}/comments?per_page=100`])
    return { issue: number, ...decide({ issue: data, comments: pages.flat(), version, force: asked.force }) }
  } catch (error) {
    return { issue: number, todo: true, reason: `lookup failed, running anyway: ${String(error.message).split('\n')[0]}` }
  }
}

function defaultRun(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}

export function parseArgs(argv) {
  const [mode, ...rest] = argv
  const options = { mode }
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index]
    if (arg === '--force') { options.force = true; continue }
    const key = {
      '--repo': 'repo', '--issue': 'issue', '--version': 'version', '--title': 'title', '--body-file': 'bodyFile',
      '--event-name': 'eventName', '--event-path': 'eventPath',
    }[arg]
    if (!key) throw new Error(`unknown argument: ${arg}`)
    const value = rest[++index]
    if (value === undefined) throw new Error(`${arg} needs a value`)
    options[key] = value
  }
  if (mode !== 'check' && mode !== 'hash') throw new Error('usage: refine-marker.mjs hash|check …')
  return options
}

const shippedVersion = async () => {
  try { return (await import('./version.mjs')).VERSION } catch { return undefined }
}

export async function main(argv, { run = defaultRun, log = console.log, env = process.env, read = (path) => readFileSync(path, 'utf8'), append = appendFileSync, version = shippedVersion } = {}) {
  let options
  try { options = parseArgs(argv) } catch (error) { log(`refine-marker: ${error.message}`); return 2 }
  if (options.mode === 'hash') {
    log(issueHash(options.title, options.bodyFile ? read(options.bodyFile) : ''))
    return 0
  }
  const force = options.force || /^(true|1)$/i.test(String(env.SKRAFT_REFINE_FORCE ?? ''))
  const eventName = options.eventName ?? env.GITHUB_EVENT_NAME
  const eventPath = options.eventPath ?? env.GITHUB_EVENT_PATH
  let payload = {}
  if (eventPath) {
    try { payload = JSON.parse(read(eventPath)) } catch (error) { log(`refine-marker: unreadable event payload: ${error.message}`) }
  }
  const result = check({ ...options, eventName, payload, version: options.version ?? await version(), force }, { run })
  log(`todo=${result.todo}`)
  log(`reason=${result.reason}`)
  if (env.GITHUB_OUTPUT) append(env.GITHUB_OUTPUT, `todo=${result.todo}\n${result.issue ? `issue=${result.issue}\n` : ''}`)
  return 0
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exitCode = await main(process.argv.slice(2))
