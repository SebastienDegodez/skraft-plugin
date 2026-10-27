// The forge a run started from an issue reads it from: the working copy's origin names it, and a
// fake gh, first on this process's PATH for the test's length, answers for it (no test reaches a
// forge). gh is signed in and shows the story's issue; it answers nothing else, so the run keeps
// no comment on the issue and pushes nothing. Every driver reads PATH from this process: its
// child processes inherit it, the Node adapters read process.env.
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { commitAll, git, tempFolder } from './workspace.mjs'

/** The story's issue on the forge. */
export const ISSUE = Object.freeze({
  number: 42,
  title: 'Pay by card',
  url: 'https://github.example.com/acme/payment/issues/42',
  body: '## Acceptance criteria\n\n- paying 10 answers paid 10',
})

/** Where the run keeps the issue, under its tracking folder, on the day it started. @param {string} day */
export const issueFile = (day) => `plans/${day}/issue-${ISSUE.number}.md`

/** Why a run on this forge keeps no comment on its issue. */
export const NO_COMMENT = `gh could not tell which user is signed in on github.example.com, so the run's comment on issue #${ISSUE.number} is neither found nor posted`

/** Why a run on this forge opens no pull request. */
export const NO_PULL_REQUEST = 'the forge does not say which branch is the repository\'s default, so nothing is pushed'

// gh keeps each argv in gh-calls.jsonl beside it.
const FAKE_GH = [
  "import { appendFileSync } from 'node:fs'",
  "import { dirname, join } from 'node:path'",
  "import { fileURLToPath } from 'node:url'",
  'const here = dirname(fileURLToPath(import.meta.url))',
  'const args = process.argv.slice(2)',
  "appendFileSync(join(here, 'gh-calls.jsonl'), `${JSON.stringify(args)}\\n`)",
  "if (args[0] === '--version') { process.stdout.write('gh version 2.92.0\\n'); process.exit(0) }",
  "if (args[0] === 'auth') process.exit(0)",
  `if (args[0] === 'issue' && args[2] === '${ISSUE.number}') { process.stdout.write(${JSON.stringify(JSON.stringify(ISSUE))}); process.exit(0) }`,
  "if (args[0] === 'issue') { process.stderr.write(`GraphQL: Could not resolve to an issue or pull request with the number of ${args[2]}. (repository.issue)\\n`); process.exit(1) }",
  'process.exit(1)',
  '',
].join('\n')

/**
 * A folder made a Git repository, the tracking folder ignored, then issueForge on it.
 * @param {import('node:test').TestContext} t @param {string} cwd
 */
export const repositoryOnForge = (t, cwd) => {
  writeFileSync(join(cwd, '.gitignore'), '.copilot-tracking/\n')
  commitAll(cwd)
  return issueForge(t, cwd)
}

/**
 * Gives the working copy its origin on the forge, which pushes to nowhere, and puts the fake gh
 * first on PATH until the test ends.
 * @param {import('node:test').TestContext} t @param {string} cwd
 * @returns {{ calls: () => string[][] }}
 */
export const issueForge = (t, cwd) => {
  const bin = tempFolder(t, 'skraft-forge-')
  git(cwd, 'remote', 'add', 'origin', 'https://github.example.com/acme/payment.git')
  git(cwd, 'config', 'remote.origin.pushurl', join(bin, 'no-remote.git'))
  writeFileSync(join(bin, 'gh.mjs'), FAKE_GH)
  writeFileSync(join(bin, 'gh-calls.jsonl'), '')
  writeFileSync(join(bin, 'gh.cmd'), `@"${process.execPath}" "%~dp0gh.mjs" %*\r\n`)
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\nexec "${process.execPath}" "${join(bin, 'gh.mjs')}" "$@"\n`)
  chmodSync(join(bin, 'gh'), 0o755)
  const key = Object.keys(process.env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH'
  const path = process.env[key]
  process.env[key] = [bin, path].join(delimiter)
  t.after(() => { process.env[key] = path })
  return { calls: () => readFileSync(join(bin, 'gh-calls.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) }
}
