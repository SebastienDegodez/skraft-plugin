import { isTouchedBy } from '../../domain/evidence/touched-components.mjs'
import { evidenceFailures } from '../../domain/evidence/delivery-evidence.mjs'
import { baseOf } from '../config/bases.mjs'
import { readTrace } from '../evidence/run-trace-store.mjs'

/**
 * The evidence of a DELIVER attempt: what `skraft_repl` traced of its runs, read from the
 * attempt's folder, checked against the components the story changed and the commit the
 * attempt ends on. Nothing here runs a program.
 *
 * @typedef {{ code: 'evidence', line: string }} EvidenceFailure
 * @typedef {{ ok: true, failures: EvidenceFailure[], checked: Array<{ run: number, gate: string, cwd: string, log: string, sha256: string }> } | { ok: false, reason: string }} EvidenceCheck
 *   checked: the runs the evidence stands on, by id and hash, never their output; ok false: the machine could not read Git.
 */

/**
 * @param {any} deps
 * @param {{ slug: string, folder: string, events: any[], config: import('../../domain/config/skraft-config.mjs').SkraftConfig, base: import('../config/bases.mjs').Base[] }} attempt
 * @returns {Promise<EvidenceCheck>}
 */
export const checkEvidence = async (deps, { slug, folder, events, config, base }) => {
  const trace = await readTrace(deps, { slug, folder, events })
  if (!trace.ok) return { ok: true, failures: [{ code: 'evidence', line: trace.reason }], checked: [] }
  const subjects = await touchedSubjects(deps, config.components, base)
  if (typeof subjects === 'string') return { ok: false, reason: subjects }
  const lines = evidenceFailures(trace.records, subjects, config.components.map(({ root }) => root))
  const runs = /** @type {import('../../domain/evidence/run-trace.mjs').RunRecord[]} */ (trace.records.filter((record) => record.type === 'run'))
  return { ok: true, failures: lines.map((line) => ({ code: 'evidence', line })), checked: runs.map(({ run, gate, cwd, log, sha256 }) => ({ run, gate: gate ?? '', cwd, log, sha256 })) }
}

/**
 * The components the story changed since their base, with the commit their repository stands
 * on; a string when Git cannot tell.
 * @param {any} deps @param {import('../../domain/config/skraft-config.mjs').Component[]} components @param {import('../config/bases.mjs').Base[]} base
 */
const touchedSubjects = async (deps, components, base) => {
  const subjects = []
  for (const component of components) {
    const sha = baseOf(base, component.name)?.sha ?? null
    const changed = sha === null ? null : await deps.sourceControl.changedFiles(component.root, sha)
    if (changed !== null && !isTouchedBy(component, components, changed)) continue
    const head = await deps.sourceControl.head(component.root)
    if (head === null) return `Git cannot tell the commit ${component.root} stands on`
    subjects.push({ name: component.name, root: component.root, head })
  }
  return subjects
}
