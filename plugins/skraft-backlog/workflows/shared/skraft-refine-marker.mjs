#!/usr/bin/env node
// Says whether an issue still needs a refinement proposal. A proposal comment carries a hidden
// marker with the plugin version and a hash of the issue's title and body; the work is done
// when a trusted comment carries the marker for the issue as it reads now.
//
//   node refine-marker.mjs hash --title <t> --body-file <f>          → prints the hash
//   node refine-marker.mjs check --repo o/r --issue N [--version V] [--force] [--aw-context JSON]
//
// Without --version, `check` takes the version of the skill it ships in (./version.mjs).
//
// `check` reads the issue through `gh api` and prints `todo=true|false` and a reason; with
// GITHUB_OUTPUT set it also writes `todo=…` and the resolved `issue=…` number there. It always exits 0: a failed lookup answers
// todo=true, so an outage costs one extra run instead of hiding the workflow.
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

export const renderMarker = ({ version, hash }) => `<!-- ${COMMAND} v=${version} hash=${hash} -->`

const MARKER = new RegExp(`<!--\\s*${COMMAND}\\s+v=(\\S+)\\s+hash=([0-9a-f]{16})\\s*-->`)

export function parseMarker(text) {
  const match = MARKER.exec(String(text ?? ''))
  return match ? { version: match[1], hash: match[2] } : null
}

/** A comment line starting with /skraft-refine and asking for --force. */
export const asksForce = (text) => new RegExp(`^\\s*/${COMMAND}\\b[^\\n]*--force\\b`, 'm').test(String(text ?? ''))

const trusted = (comment) => TRUSTED.has(String(comment?.author_association ?? '').toUpperCase())
  || String(comment?.user?.type ?? '') === 'Bot'

/**
 * @param {{ issue: { title: string, body: string }, comments: object[], version: string, force?: boolean }} input
 * @returns {{ todo: boolean, reason: string }}
 */
export function decide({ issue, comments = [], version, force = false }) {
  if (force) return { todo: true, reason: 'forced' }
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

/** Reads the issue, its comments and the triggering comment through `gh api`. */
export function check({ repo, issue, version, force = false, awContext = '' }, { run = defaultRun } = {}) {
  let context = {}
  try { context = awContext ? JSON.parse(awContext) : {} } catch { context = {} }
  const number = String(issue || context.item_number || '').trim()
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repo ?? ''))) return { todo: true, reason: `no usable repository (${repo})` }
  if (!/^\d+$/.test(number)) return { todo: true, reason: 'no issue number' }
  if (!version) return { todo: true, reason: 'no version given' }
  try {
    const data = ghJson(run, [`repos/${repo}/issues/${number}`])
    const pages = ghJson(run, ['--paginate', '--slurp', `repos/${repo}/issues/${number}/comments?per_page=100`])
    const comments = pages.flat()
    let forced = force
    if (!forced && /^\d+$/.test(String(context.comment_id ?? ''))) {
      const trigger = ghJson(run, [`repos/${repo}/issues/comments/${context.comment_id}`])
      forced = asksForce(trigger.body)
    }
    return { issue: number, ...decide({ issue: data, comments, version, force: forced }) }
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
    const key = { '--repo': 'repo', '--issue': 'issue', '--version': 'version', '--aw-context': 'awContext', '--title': 'title', '--body-file': 'bodyFile' }[arg]
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
  const result = check({ ...options, version: options.version ?? await version(), force }, { run })
  log(`todo=${result.todo}`)
  log(`reason=${result.reason}`)
  if (env.GITHUB_OUTPUT) append(env.GITHUB_OUTPUT, `todo=${result.todo}\n${result.issue ? `issue=${result.issue}\n` : ''}`)
  return 0
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exitCode = await main(process.argv.slice(2))
