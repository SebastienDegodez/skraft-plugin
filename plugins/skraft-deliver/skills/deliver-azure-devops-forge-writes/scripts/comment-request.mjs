#!/usr/bin/env node
// Wraps a prepared Markdown comment into the request body `az devops invoke --in-file` sends,
// byte for byte:
//   work-item (default)  a work item comment, added or updated   { "text": … }
//   thread               a new pull request thread, created Closed { "comments": [{ "parentCommentId": 0, "content": …, "commentType": 1 }], "status": 4 }
//   thread-comment       the first comment of a thread, updated   { "content": … }
//
//   node comment-request.mjs --in <comment.md> --out <comment.json> [--kind work-item|thread|thread-comment]
//
// Exits 0 on success, 1 when the input is unreadable or the output exists, 2 on bad arguments.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const THREAD_CLOSED = 4

const BODIES = {
  'work-item': (markdown) => ({ text: markdown }),
  thread: (markdown) => ({ comments: [{ parentCommentId: 0, content: markdown, commentType: 1 }], status: THREAD_CLOSED }),
  'thread-comment': (markdown) => ({ content: markdown }),
}

export const commentRequest = (markdown, kind = 'work-item') => `${JSON.stringify(BODIES[kind](markdown))}\n`

export function parseArgs(argv) {
  const options = { kind: 'work-item' }
  for (let index = 0; index < argv.length; index += 2) {
    const key = { '--in': 'input', '--out': 'output', '--kind': 'kind' }[argv[index]]
    if (!key || argv[index + 1] === undefined) return null
    options[key] = argv[index + 1]
  }
  return options.input && options.output && Object.hasOwn(BODIES, options.kind) ? options : null
}

export function main(argv, { read = (path) => readFileSync(path, 'utf8'), write = (path, text) => writeFileSync(path, text, { encoding: 'utf8', flag: 'wx' }), log = console.log } = {}) {
  const options = parseArgs(argv)
  if (!options) { log('usage: comment-request.mjs --in <comment.md> --out <comment.json> [--kind work-item|thread|thread-comment]'); return 2 }
  try {
    write(options.output, commentRequest(read(options.input), options.kind))
  } catch (error) {
    log(JSON.stringify({ error: error.code === 'EEXIST' ? 'output_exists' : 'unreadable_input', path: error.path }))
    return 1
  }
  log(JSON.stringify({ out: options.output }))
  return 0
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exitCode = main(process.argv.slice(2))
