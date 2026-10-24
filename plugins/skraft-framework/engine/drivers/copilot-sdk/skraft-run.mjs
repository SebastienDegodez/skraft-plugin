#!/usr/bin/env node
// `skraft-run`: the pipeline through the Copilot SDK, from a VS Code terminal or task. The one
// file that loads the SDK, from the Copilot CLI's own packages; it starts nothing when imported.
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createCopilotSdkLocator } from '../../infrastructure/copilot/copilot-sdk-locator.mjs'
import { runSkraftRun } from './skraft-run-command.mjs'

const PLUGIN_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)))

/**
 * @param {string[]} argv
 * @param {{ cwd: string, home: string, env: Record<string, string | undefined>, ask: (question: string) => Promise<string>, out: (line: string) => void, err: (line: string) => void, signal?: AbortSignal }} machine
 *   env: where the SDK finds the Copilot CLI entry (`COPILOT_CLI_PATH`, set to the one beside the
 *   SDK unless already set, as the host probe does); ask: the person's answer to a question;
 *   signal: aborted when the person stops the command (Ctrl-C).
 * @returns {Promise<number>} exit code
 */
export const main = (argv, { cwd, home, env, ask, out, err, signal }) => runSkraftRun(argv, {
  cwd, pluginRoot: PLUGIN_ROOT, out, err, signal,
  locate: () => createCopilotSdkLocator({ home }).locate(),
  load: (location) => {
    env.COPILOT_CLI_PATH ??= location.cli
    return import(pathToFileURL(join(location.sdk, 'index.js')).href)
  },
  confirm: async (question) => /^y(es)?$/i.test((await ask(question)).trim()),
})

/**
 * The person's answer typed in the terminal; none when no one can type there.
 * @param {{ input: NodeJS.ReadableStream & { isTTY?: boolean }, output: NodeJS.WritableStream }} terminal
 * @returns {(question: string) => Promise<string>}
 */
export const terminalAsk = ({ input, output }) => async (question) => {
  if (input.isTTY !== true) return ''
  const reading = createInterface({ input, output })
  try {
    return await reading.question(question)
  } finally {
    reading.close()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stopping = new AbortController()
  process.once('SIGINT', () => stopping.abort())
  process.exitCode = await main(process.argv.slice(2), {
    signal: stopping.signal,
    cwd: process.cwd(), home: homedir(), env: process.env, ask: terminalAsk({ input: process.stdin, output: process.stderr }),
    out: (line) => process.stdout.write(`${line}\n`), err: (line) => process.stderr.write(`${line}\n`),
  })
}
