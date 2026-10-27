import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HOLDER = fileURLToPath(new URL('./holder.mjs', import.meta.url))

/**
 * Another session's process holding the pipeline's lease. `said()` resolves with its next line
 * on stdout; `release()` ends its lease and the process; `kill()` ends the process alone, as a
 * crash or a machine switched off does.
 * @param {string} cwd @param {string} slug
 */
export const otherSession = (cwd, slug) => {
  const child = spawn(process.execPath, [HOLDER, cwd, slug], { stdio: ['pipe', 'pipe', 'inherit'] })
  child.stdout.setEncoding('utf8')
  const lines = []
  const waiting = []
  child.stdout.on('data', (text) => {
    lines.push(...text.split('\n').filter(Boolean))
    while (waiting.length > 0 && lines.length > 0) waiting.shift()(lines.shift())
  })
  const exited = new Promise((resolve) => child.once('exit', resolve))
  return {
    said: () => (lines.length > 0 ? Promise.resolve(lines.shift()) : new Promise((resolve) => waiting.push(resolve))),
    release: async () => {
      child.stdin.write('release\n')
      await exited
    },
    kill: async () => {
      child.kill('SIGKILL')
      await exited
    },
  }
}
