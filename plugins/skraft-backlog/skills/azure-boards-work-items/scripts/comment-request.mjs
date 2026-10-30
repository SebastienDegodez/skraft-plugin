#!/usr/bin/env node
// Wraps a prepared Markdown comment into the request body of the Azure Boards comments API
// ({ "text": … }), byte for byte, so `az devops invoke --in-file` sends it unchanged.
//
//   node comment-request.mjs --in <comment.md> --out <comment.json>
//
// Exits 0 on success, 1 when the input is unreadable or the output exists, 2 on bad arguments.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const commentRequest = (markdown) => `${JSON.stringify({ text: markdown })}\n`

export function parseArgs(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = { '--in': 'input', '--out': 'output' }[argv[index]]
    if (!key || argv[index + 1] === undefined) return null
    options[key] = argv[index + 1]
  }
  return options.input && options.output ? options : null
}

export function main(argv, { read = (path) => readFileSync(path, 'utf8'), write = (path, text) => writeFileSync(path, text, { encoding: 'utf8', flag: 'wx' }), log = console.log } = {}) {
  const options = parseArgs(argv)
  if (!options) { log('usage: comment-request.mjs --in <comment.md> --out <comment.json>'); return 2 }
  try {
    write(options.output, commentRequest(read(options.input)))
  } catch (error) {
    log(JSON.stringify({ error: error.code === 'EEXIST' ? 'output_exists' : 'unreadable_input', path: error.path }))
    return 1
  }
  log(JSON.stringify({ out: options.output }))
  return 0
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exitCode = main(process.argv.slice(2))
