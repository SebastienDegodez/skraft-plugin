import { signedLine } from '../../../../plugins/skraft-framework/engine/domain/journal/signature.mjs'

/** The gates the engine asks a delivery attempt for, per component. */
export const GATES = Object.freeze(['build', 'format', 'lint', 'test', 'architecture', 'coverage'])

const componentsOf = (host) => JSON.parse(host.workspace.files.get('skraft-config.json') ?? '{}').components ?? []

/**
 * What the REPL traced of an attempt: one signed line per ended run, the way `skraft_repl`
 * writes them (the file is read by the engine through its signatures). Each component gets a
 * passing run of every gate on the HEAD the repository holds now, `test` being the run of the
 * commit line, unless `trace` changes it.
 * @param {any} host
 * @param {{ step: string, visit: number, attempt: number }} step
 * @param {{ omit?: string[], absent?: string[], edit?: (run: any) => any, open?: boolean, unsigned?: boolean, edited?: boolean }} [trace]
 *   omit: `<component>/<gate>` never run; absent: declared absent; edit: changes each run of the trace;
 *   edited: each line changed after it was signed
 */
export const writeDeliveryTrace = async (host, { step, visit, attempt }, { omit = [], absent = [], edit = (run) => run, open = false, unsigned = false, edited = false } = {}) => {
  const folder = `logs/runs/${step}-${visit}-${attempt}`
  const records = []
  let run = 0
  for (const component of componentsOf(host)) {
    for (const gate of GATES) {
      const name = `${component.name}/${gate}`
      if (absent.includes(name)) records.push({ type: 'absent', cell: 1, at: 'then', gate, component: component.name, reason: 'the docs name none' })
      if (omit.includes(name) || absent.includes(name)) continue
      run += 1
      const head = await host.git.head(await host.git.repository(component.root))
      records.push(edit({ type: 'run', run, cell: 1, at: 'then', command: `${gate} ${component.name}`, argv: ['sh', '-c', gate], shell: 'sh', cwd: component.root, gate, label: gate === 'test' ? 'green' : null, durationMs: 1, exitCode: 0, signal: null, timedOut: false, killed: false, started: true, bytes: 0, cut: false, sha256: await host.deps.hasher.sha256(''), log: `${folder}/${run}.log`, headBefore: head, headAfter: head, clean: gate !== 'test' }))
      await host.tracking.write(host.slug, `${folder}/${run}.log`, '')
    }
  }
  if (open) records.push({ type: 'start', run: run + 1, cell: 1, at: 'then', command: 'npm test', cwd: '.', gate: 'test', label: null })
  await host.tracking.write(host.slug, `${folder}/runs.jsonl`, `${(await Promise.all(records.map((record) => lineOf(host, record, unsigned, edited)))).join('\n')}\n`)
}

const lineOf = async (host, record, unsigned, edited = false) => {
  const body = JSON.stringify(record)
  if (unsigned) return body
  const keyId = host.events().find((event) => typeof event.keyId === 'string').keyId
  const sig = await host.deps.hasher.hmacSha256(await host.deps.journalKeys.read(keyId), body)
  return signedLine(edited ? body.replace('"exitCode":0', '"exitCode":1') : body, sig)
}

/**
 * A traced e2e run of a component, the way `skraft_repl` writes it: one signed line, its log beside it.
 * @param {any} host @param {{ cwd: string, command: string, exitCode: number, folder?: string }} run
 */
export const writeE2eTrace = async (host, { cwd, command, exitCode, folder = 'logs/runs/deliver-1-1' }) => {
  const record = { type: 'run', run: 1, cell: 1, at: 'then', command, argv: ['sh', '-c', command], shell: 'sh', cwd, gate: 'e2e', label: null, durationMs: 1, exitCode, signal: null, timedOut: false, killed: false, started: true, bytes: 0, cut: false, sha256: await host.deps.hasher.sha256(''), log: `${folder}/1.log`, headBefore: null, headAfter: null, clean: true }
  await host.tracking.write(host.slug, `${folder}/1.log`, '')
  await host.tracking.write(host.slug, `${folder}/runs.jsonl`, `${await lineOf(host, record, false)}\n`)
}

/**
 * The designer's run of its acceptance tests, the way `skraft_repl` writes it: one signed line labelled `red`, its log beside it.
 * @param {any} host @param {{ step: string, visit: number, attempt: number }} step
 */
export const writeRedTrace = async (host, { step, visit, attempt }) => {
  const folder = `logs/runs/${step}-${visit}-${attempt}`
  const [first] = componentsOf(host)
  const text = 'S1_pays: expected paid 10, got nothing\n'
  const record = { type: 'run', run: 1, cell: 1, at: 'then', command: 'dotnet test', argv: ['sh', '-c', 'dotnet test'], shell: 'sh', cwd: first?.root ?? '.', gate: 'test', label: 'red', durationMs: 1, exitCode: 1, signal: null, timedOut: false, killed: false, started: true, bytes: text.length, cut: false, sha256: await host.deps.hasher.sha256(text), log: `${folder}/1.log`, headBefore: null, headAfter: null, clean: true }
  await host.tracking.write(host.slug, `${folder}/1.log`, text)
  await host.tracking.write(host.slug, `${folder}/runs.jsonl`, `${await lineOf(host, record, false)}\n`)
}
