import { permissionDecider, runPipelineThroughSdk } from './sdk-pipeline-run.mjs'

/**
 * `skraft-run`: the command a developer types in a VS Code terminal, or a VS Code task runs, to
 * run the pipeline through the Copilot SDK. Its services come from the entry, the one file that
 * loads the SDK.
 *
 * @typedef {import('./sdk-pipeline-run.mjs').SdkOutcome} SdkOutcome
 * @typedef {import('../../application/ports/copilot-sdk.mjs').CopilotSdkLocation} CopilotSdkLocation
 * @typedef {{
 *   cwd: string, pluginRoot: string,
 *   locate: () => Promise<CopilotSdkLocation>,
 *   load: (location: Extract<CopilotSdkLocation, { found: true }>) => Promise<import('./sdk-pipeline-run.mjs').CopilotSdkModule>,
 *   confirm: (question: string) => Promise<boolean>,
 *   out: (line: string) => void, err: (line: string) => void,
 *   timings?: import('./sdk-pipeline-run.mjs').SdkHost['timings'], signal?: AbortSignal,
 * }} RunServices
 *   load: the SDK module at that location; confirm: the person's yes to a question asked in the terminal.
 */

export const RUN_USAGE = 'usage: skraft-run [<slug>] [--issue <number>] [--title <text>] [--base <ref>] [--from-artifacts] [--allow-all-tools]'

const VALUED = Object.freeze(['--issue', '--title', '--base'])
const FLAGS = Object.freeze(['--from-artifacts', '--allow-all-tools'])

/**
 * Runs the pipeline through the SDK and prints its outcome; 0 when it is done or waits for a
 * question, 1 otherwise, 2 for a malformed command line.
 * @param {string[]} argv @param {RunServices} services @returns {Promise<number>}
 */
export const runSkraftRun = async (argv, services) => {
  const request = requestOf(argv)
  if (request === null) return complain(services, RUN_USAGE, 2)
  const location = await services.locate()
  if (!location.found) return complain(services, `no Copilot SDK under ${location.looked}: install the Copilot CLI, or let the Skraft - Orchestrator agent conduct skraft next and skraft record`, 1)
  const sdk = await loaded(services, location)
  if (sdk === null) return complain(services, `the Copilot SDK in ${location.sdk} could not be loaded; run skraft doctor`, 1)
  const outcome = await runPipelineThroughSdk(hostOf(services, { sdk, sdkPath: location.sdk, allowAll: request.allowAll }), request.args)
  services.out(outcomeLine(outcome))
  return outcome.status === 'done' || outcome.status === 'waiting' ? 0 : 1
}

/** @param {SdkOutcome} outcome */
const outcomeLine = ({ status, slug, phase, code, reason }) => `skraft${slug ? ` ${slug}` : ''}: ${status}${code ? ` (${code})` : ''}${phase ? ` in ${phase}` : ''} — ${reason}`

/**
 * @param {RunServices} services
 * @param {{ sdk: import('./sdk-pipeline-run.mjs').CopilotSdkModule, sdkPath: string, allowAll: boolean }} chosen
 * @returns {import('./sdk-pipeline-run.mjs').SdkHost}
 */
const hostOf = ({ cwd, pluginRoot, confirm, err, timings, signal }, { sdk, sdkPath, allowAll }) => ({
  sdk, sdkPath, cwd, pluginRoot, timings, signal, log: err,
  permissions: permissionDecider({ allowAll, confirm }),
})

/**
 * @param {RunServices} services @param {Extract<CopilotSdkLocation, { found: true }>} location
 * @returns {Promise<import('./sdk-pipeline-run.mjs').CopilotSdkModule | null>} null when it fails to load or has no client
 */
const loaded = async (services, location) => {
  try {
    const sdk = await services.load(location)
    return typeof sdk.CopilotClient === 'function' ? sdk : null
  } catch {
    return null
  }
}

/** @param {RunServices} services @param {string} line @param {number} code */
const complain = (services, line, code) => {
  services.err(line)
  return code
}

/**
 * The workflow arguments a command line asks for: a slug first, then each option once; null when
 * it is malformed.
 * @param {string[]} argv
 * @returns {{ args: import('./sdk-pipeline-run.mjs').WorkflowArgs, allowAll: boolean } | null}
 */
const requestOf = (argv) => {
  const [slug, rest] = argv[0] !== undefined && !argv[0].startsWith('--') ? [argv[0], argv.slice(1)] : [undefined, argv]
  const options = optionsOf(rest)
  if (options === null || !/^([1-9]\d*)?$/.test(options['--issue'] ?? '')) return null
  return { args: workflowArgs(slug, options), allowAll: options['--allow-all-tools'] === 'true' }
}

/**
 * @param {string | undefined} slug @param {Record<string, string>} options
 * @returns {import('./sdk-pipeline-run.mjs').WorkflowArgs}
 */
const workflowArgs = (slug, options) => ({
  ...(slug === undefined ? {} : { slug }),
  ...(options['--issue'] === undefined ? {} : { issue: Number(options['--issue']) }),
  ...(options['--title'] === undefined ? {} : { title: options['--title'] }),
  ...(options['--base'] === undefined ? {} : { base: options['--base'] }),
  ...(options['--from-artifacts'] === undefined ? {} : { fromArtifacts: true }),
})

/**
 * `--name value` pairs and flags (`'true'`), each at most once; null for an unknown, repeated or
 * valueless option.
 * @param {string[]} args @returns {Record<string, string> | null}
 */
const optionsOf = (args) => {
  /** @type {Record<string, string>} */
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const [name, value] = [args[index], args[index + 1]]
    if (name in options) return null
    if (FLAGS.includes(name)) options[name] = 'true'
    else if (VALUED.includes(name) && value !== undefined && !value.startsWith('--')) options[name] = args[(index += 1)]
    else return null
  }
  return options
}
