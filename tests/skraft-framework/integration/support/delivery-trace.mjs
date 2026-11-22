import { spawnSync } from 'node:child_process'
import { createHash, createHmac } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, journal } from './workspace.mjs'

const GATES = ['build', 'format', 'lint', 'test', 'architecture', 'coverage']

/**
 * What the REPL would have traced of a delivery attempt that passes every gate on the commit it
 * ends on: one run of each gate per component, signed with the run's key under the home folder
 * beside the working copy, the way `skraft_repl` writes them.
 * @param {string} cwd @param {string} slug
 */
export const traceDelivery = (cwd, slug) => {
  const events = journal(cwd, slug)
  const { step, visit, attempt } = events.findLast((event) => event.type === 'step.started')
  const folder = join(cwd, '.copilot-tracking', 'skraft-plans', slug, 'logs', 'runs', `${step}-${visit}-${attempt}`)
  mkdirSync(folder, { recursive: true })
  const key = Buffer.from(readFileSync(join(`${cwd}-home`, '.skraft', 'journal-keys', `${events[0].keyId}.key`), 'utf8').trim(), 'hex')
  const empty = createHash('sha256').update('').digest('hex')
  const components = JSON.parse(readFileSync(join(cwd, 'skraft-config.json'), 'utf8')).components
  const withE2e = components.filter((component) => component.commands.e2e !== undefined)
  const records = [...components.flatMap((component) => GATES.map((gate) => ({ component, gate }))), ...withE2e.map((component) => ({ component, gate: 'e2e' }))]
    .map(({ component, gate }, index) => runOf({ component, gate, run: index + 1, head: git(join(cwd, component.root), 'rev-parse', 'HEAD'), empty, folder: `logs/runs/${step}-${visit}-${attempt}`, exitCode: gate === 'e2e' ? e2eOf(cwd, component) : 0 }))
  for (const record of records) writeFileSync(join(folder, `${record.run}.log`), '')
  writeFileSync(join(folder, 'runs.jsonl'), records.map((record) => signed(record, key)).join('\n').concat('\n'))
}

/** The front end's own e2e command, started as the engineer would start it through the REPL. */
const e2eOf = (cwd, { root, commands }) => spawnSync(commands.e2e, { cwd: join(cwd, root), shell: true }).status

const runOf = ({ component, gate, run, head, empty, folder, exitCode }) => ({
  type: 'run', run, cell: 1, at: 'then', command: gate === 'e2e' ? component.commands.e2e : `${gate} ${component.name}`, argv: ['sh', '-c', gate], shell: 'sh', cwd: component.root, gate, label: gate === 'test' ? 'green' : null,
  durationMs: 1, exitCode, signal: null, timedOut: false, killed: false, started: true, bytes: 0, cut: false, sha256: empty, log: `${folder}/${run}.log`, headBefore: head, headAfter: head, clean: gate !== 'test',
})

const signed = (record, key) => {
  const body = JSON.stringify(record)
  return `${body.slice(0, -1)},"sig":"${createHmac('sha256', key).update(body, 'utf8').digest('hex')}"}`
}
