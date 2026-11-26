// The CI workflow's entry for a `/skraft-answer` reply read in a draft pull request (#662): it hands
// the saved comment and its author to the engine, which records it only when the author has
// write access and the reply answers the pending question. No model reads the comment, and no MCP
// tool offers this to one. node ci-reply.mjs --author <login> --comment-file <path>
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createNodeAdapters } from '../../infrastructure/node-adapters.mjs'
import { runStandalone } from './standalone-run.mjs'

const pluginRoot = fileURLToPath(new URL('../../../', import.meta.url))

const main = async () => {
  const { values } = parseArgs({ options: { author: { type: 'string' }, 'comment-file': { type: 'string' } } })
  const cwd = process.cwd()
  const services = { cwd, pluginVersion: () => '0.1.0', pluginFolder: () => pluginRoot, adapters: () => createNodeAdapters({ cwd, pluginRoot }) }
  const console = { out: (line) => process.stdout.write(`${line}\n`), err: (line) => process.stderr.write(`${line}\n`) }
  const body = values['comment-file'] ? readFileSync(values['comment-file'], 'utf8') : ''
  process.exitCode = await runStandalone(['reply', JSON.stringify({ author: values.author ?? '', body })], services, console)
}

await main()
