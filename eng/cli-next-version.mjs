#!/usr/bin/env node
// Decides whether cli-release.yml publishes @skraft/cli: it asks semantic-release (dry run,
// from cli/) which version comes next, then asks npm whether that version already exists.
// It writes `publish=true|false` and `version=<v>` to $GITHUB_OUTPUT and says why on stdout.
// Run from cli/. `--no-ci` makes semantic-release read the branch from git: a workflow_run
// event carries the default branch in GITHUB_REF, not the branch Release just released.
import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const NEXT = /The next release version is (\S+)/

/** @param {string} dryRunOutput @returns {string | null} */
export const nextVersion = (dryRunOutput) => NEXT.exec(dryRunOutput)?.[1] ?? null

/**
 * @param {{ version: string | null, published: boolean }} facts
 * @returns {{ publish: boolean, reason: string }}
 */
export const decide = ({ version, published }) => {
  if (version === null) return { publish: false, reason: 'no cli/ commit asks for a release' }
  if (published) return { publish: false, reason: `@skraft/cli@${version} is already on npm` }
  return { publish: true, reason: `@skraft/cli@${version} has never been published` }
}

// The release job runs on ubuntu-latest: npx and npm are real executables there, no shell needed.
const run = (program, args) => spawnSync(program, args, { encoding: 'utf8' })

const isPublished = (version) => {
  const view = run('npm', ['view', `@skraft/cli@${version}`, 'version'])
  return view.status === 0 && view.stdout.trim() === version
}

const main = () => {
  const dryRun = run('npx', ['semantic-release', '--dry-run', '--no-ci'])
  if (dryRun.status !== 0) {
    process.stdout.write(dryRun.stdout + dryRun.stderr)
    process.exit(1)
  }
  const version = nextVersion(dryRun.stdout)
  const { publish, reason } = decide({ version, published: version !== null && isPublished(version) })
  process.stdout.write(`${reason}\n`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `publish=${publish}\nversion=${version ?? ''}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
