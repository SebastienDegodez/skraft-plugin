import { readTrace } from '../evidence/run-trace-store.mjs'

/**
 * What `skraft_design_repl` traced of an attempt, read from the attempt's folder through its signatures,
 * kept for the readers of the journal: the DELIVER review, which judges the quality evidence, the
 * run view and the scenario review. Nothing here runs a program nor refuses an attempt.
 *
 * @typedef {{ run: number, gate: string, cwd: string, log: string, sha256: string }} TracedRun
 *   the run by id and hash, never its output.
 */

/**
 * Every run the delivering attempt traced, in the order they ran; none, with the code of what
 * breaks it, when its trace cannot be verified (an edited or unsigned line), so that nothing stands for it.
 * @param {any} deps @param {{ slug: string, folder: string, events: any[] }} attempt
 * @returns {Promise<{ runs: TracedRun[], invalid?: import('../evidence/run-trace-store.mjs').TraceRefusal }>}
 */
export const tracedRuns = async (deps, attempt) => {
  const trace = await readTrace(deps, attempt)
  if (!trace.ok) return { runs: [], invalid: trace.code }
  return { runs: trace.records.flatMap((record) => (record.type === 'run' ? [factOf(record)] : [])) }
}

/** @param {import('../../domain/evidence/run-trace.mjs').RunRecord} record @returns {TracedRun} */
const factOf = ({ run, gate, cwd, log, sha256 }) => ({ run, gate: gate ?? '', cwd, log, sha256 })

/**
 * The traced run of the acceptance tests the designer labelled `red`: the last one of the attempt,
 * which the review of DISTILL reads in place of a log; null when the trace holds none or cannot be read.
 * @param {any} deps @param {{ slug: string, folder: string, events: any[] }} attempt
 * @returns {Promise<TracedRun | null>}
 */
export const redRunOf = async (deps, attempt) => {
  const trace = await readTrace(deps, attempt)
  const found = trace.ok ? trace.records.findLast((record) => record.type === 'run' && record.label === 'red') : undefined
  return found === undefined || found.type !== 'run' ? null : factOf(found)
}
