// The simulated Copilot SDK: a CopilotClient whose sessions run the real skraft-pipeline workflow
// body on the simulated workflow context, as the Copilot CLI runs the workflow the skraft
// extension registers. What the driver asks of it is recorded; what goes wrong is scripted.
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { actsAs, copilotHost, simulatedContext } from '../copilot-workflow/simulated-host.mjs'

/** A text the driver must never pass on: planted in every error the SDK or the host throws. */
export const SENTINEL = 'sdk-sentinel-7f3a'

const fails = (what) => { throw new Error(`${what} ${SENTINEL}`) }
const never = () => new Promise(() => undefined)

/**
 * @param {{
 *   llm?: { act: (prompt: string) => string | undefined },
 *   start?: 'fails' | 'hangs', session?: 'fails', rejections?: number, getRun?: 'fails' | 'hangs', getRunFailures?: number,
 *   refusal?: string, reads?: Array<'fails' | { status: string, result?: unknown }>,
 *   envelope?: { status: string, result?: unknown, error?: string },
 *   permissionRequests?: object[],
 * }} [script] llm: the agents of a real run; rejections: how many workflow.run calls the host
 *   rejects before the workflow is registered; envelope: the run's terminal envelope instead of
 *   a real run; permissionRequests: what the session asks the driver once it starts; refusal: the
 *   message workflow.run is rejected with every time; getRunFailures: how many reads fail first;
 *   reads: what each read answers in turn, a failure or an envelope
 */
export const simulatedSdk = (script = {}) => {
  const record = { clients: [], sessions: [], runs: [], reads: 0, stopped: 0, disconnected: 0, permissions: [] }
  class CopilotClient {
    constructor(options) { record.clients.push(options) }
    async start() {
      if (script.start === 'hangs') await never()
      if (script.start === 'fails') fails('start')
    }
    async stop() { record.stopped += 1 }
    async createSession(options) {
      if (script.session === 'fails') fails('createSession')
      record.sessions.push(options)
      for (const request of script.permissionRequests ?? []) record.permissions.push(await options.onPermissionRequest(request))
      return simulatedSession(script, record, options)
    }
  }
  return { sdk: { CopilotClient }, record }
}

const simulatedSession = (script, record, options) => {
  let rejections = script.rejections ?? 0
  let getRunFailures = script.getRunFailures ?? 0
  const runs = new Map()
  return {
    disconnect: async () => { record.disconnected += 1 },
    rpc: { workflow: {
      run: async ({ name, args }) => {
        record.runs.push({ name, args })
        if (script.refusal !== undefined) throw new Error(`${script.refusal} ${SENTINEL}`)
        if (rejections > 0) {
          rejections -= 1
          fails(`No workflow registered with name "${name}"`)
        }
        const runId = `run-${record.runs.length}`
        runs.set(runId, script.envelope ? { status: 'running' } : started(script, options, args))
        return { runId, status: 'running' }
      },
      getRun: async ({ runId }) => {
        record.reads += 1
        if (script.getRun === 'hangs') await never()
        if (script.getRun === 'fails') fails('getRun')
        const scripted = script.reads?.shift()
        if (scripted === 'fails') fails('getRun')
        if (scripted !== undefined) return { runId, ...scripted }
        if (getRunFailures > 0) {
          getRunFailures -= 1
          fails('getRun')
        }
        if (script.envelope) return { runId, ...script.envelope }
        return { runId, ...runs.get(runId) }
      },
    } },
  }
}

/** A run of the real workflow body in the session's directory with its plugin; its envelope follows it. */
const started = (script, options, args) => {
  const envelope = { status: 'running' }
  const { ctx } = simulatedContext({ args, otherwise: actsAs(script.llm) })
  runSkraftPipelineWorkflow(ctx, copilotHost(options.workingDirectory, options.pluginDirectories[0])).then(
    (result) => Object.assign(envelope, { status: 'completed', result }),
    (error) => Object.assign(envelope, error.name === 'AbortError' ? { status: 'paused' } : { status: 'error', error: `${error.message} ${SENTINEL}` }),
  )
  return envelope
}
