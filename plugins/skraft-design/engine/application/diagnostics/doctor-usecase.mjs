import { CONFIG_FILE, NO_COMPONENT } from '../../domain/config/skraft-config.mjs'
import { gatesOf } from '../../domain/evidence/gate-names.mjs'
import { loadConfig } from '../config/bases.mjs'
import { readWorkflows } from '../workflow/load-workflow.mjs'
import { findComponentSkills } from '../pipeline/component-skills.mjs'
import { forgeCheck, screenshotsCheck } from './forge-check.mjs'
import { modelChecks } from './model-checks.mjs'
import { joinRelative } from '../../domain/config/relative-path.mjs'
import { policyLines } from '../../domain/config/infrastructure-policy.mjs'

/**
 * @typedef {import('../../domain/config/skraft-config.mjs').Component} Component
 * @typedef {import('../../domain/config/skraft-config.mjs').BddPair} BddPair
 * @typedef {import('../../domain/config/skraft-config.mjs').SkraftConfig} SkraftConfig
 * @typedef {{ subject: string, status: 'ok' | 'warn' | 'fail', detail: string }} DoctorCheck
 *   subject: `node`, `config`, `forge`, `models`, `models/<host>`, `<component>`,
 *   `<component>/<command>`, `infrastructure` or `vscode`; warn: worth
 *   knowing, never a failure.
 * @typedef {{ ok: boolean, checks: DoctorCheck[], assignments: import('./model-checks.mjs').AssignmentTable | null }} DoctorReport
 *   assignments: what each agent the workflow dispatches runs on, by host; null when the
 *   configuration or the workflow cannot be read.
 * @typedef {{
 *   workspace: Pick<import('../ports/workspace.mjs').Workspace, 'read' | 'list' | 'write'>,
 *   userSettings: import('../ports/user-settings.mjs').UserSettings,
 *   workflowSource: import('../ports/workflow-source.mjs').WorkflowSource,
 *   commandRunner: import('../ports/command-runner.mjs').CommandRunner,
 *   sourceControl: import('../ports/source-control.mjs').SourceControl,
 *   runtime: import('../ports/runtime.mjs').Runtime,
 *   copilotSdk: import('../ports/copilot-sdk.mjs').CopilotSdk,
 * } & import('./model-checks.mjs').ModelCheckDeps & import('../config/forge.mjs').ForgeDeps } DoctorDeps
 */

const NODE_MAJOR = 22

/**
 * Doctor — checks the configuration and lists the commands of every component, which it starts
 * never: Node, the configuration, the forge, each component's root, each command's line, the skills the agents writing
 * its tests are asked to read, the infrastructure policy of its tests,
 * Docker or Podman when a policy runs a container, then what each agent the workflow dispatches
 * runs on, per host, and last how VS Code runs the pipeline.
 * @param {DoctorDeps} deps
 */
export const createDoctor = (deps) => Object.freeze({
  /** @param {object} [_request] @returns {Promise<DoctorReport>} */
  check: () => check(deps),
})

/**
 * Node, then the configuration; the rest only once the configuration names components.
 * @param {DoctorDeps} deps
 * @returns {Promise<DoctorReport>}
 */
const check = async (deps) => {
  const checks = [nodeCheck(deps.runtime.nodeVersion())]
  const configured = configCheck(await loadConfig(deps))
  checks.push(configured.check)
  const vscode = vscodeCheck(await deps.copilotSdk.locate())
  if (!configured.ok) return report([...checks, vscode], null)
  const forge = [await forgeCheck(deps, configured.config.forge), ...(await screenshotsCheck(deps, configured.config))]
  const commands = await configuredChecks(deps, configured.config)
  const models = await modelsOf(deps, configured.config)
  return report([...checks, ...forge, ...commands, ...models.checks, vscode], models.assignments)
}

/**
 * How VS Code runs the pipeline: through the Copilot SDK when the Copilot CLI ships one, else
 * through the agent loop the orchestrator agent conducts.
 * @param {import('../ports/copilot-sdk.mjs').CopilotSdkLocation} location @returns {DoctorCheck}
 */
const vscodeCheck = (location) => ({
  subject: 'vscode', status: 'ok',
  detail: location.found
    ? `Copilot SDK ${location.version} (${location.sdk}): under VS Code, run the pipeline through it with engine/drivers/copilot-sdk/skraft-run.mjs`
    : `no Copilot SDK under ${location.looked}: under VS Code, the Skraft Design - Orchestrator agent conducts skraft next and skraft record; install the Copilot CLI to run the pipeline through its SDK`,
})

/**
 * Each component, then the infrastructure of their tests.
 * @param {DoctorDeps} deps @param {SkraftConfig} config
 * @returns {Promise<DoctorCheck[]>}
 */
const configuredChecks = async (deps, config) => {
  /** @type {DoctorCheck[]} */
  const checks = []
  for (const component of config.components) checks.push(...await componentChecks(deps, component))
  return [...checks, ...config.components.flatMap(infrastructureChecks)]
}

/**
 * What the component's tests run each dependency on, row by row.
 * @param {Component} component @returns {DoctorCheck[]}
 */
const infrastructureChecks = (component) => policyLines(component).map((detail) => ({ subject: 'infrastructure', status: /** @type {const} */ ('ok'), detail }))

/**
 * The config check, and the configuration once it names at least one component.
 * @param {Awaited<ReturnType<typeof loadConfig>>} loaded
 * @returns {{ ok: true, check: DoctorCheck, config: SkraftConfig } | { ok: false, check: DoctorCheck }}
 */
const configCheck = (loaded) => {
  if (!loaded.ok) return { ok: false, check: configFails(loaded.reason) }
  const { components } = loaded.config
  if (!loaded.present) return { ok: false, check: configFails(`no ${CONFIG_FILE}; run skraft init to detect the components`) }
  if (components.length === 0) return { ok: false, check: configFails(NO_COMPONENT) }
  const names = components.map(({ name }) => name).join(', ')
  return { ok: true, check: { subject: 'config', status: 'ok', detail: `${components.length} components: ${names}` }, config: loaded.config }
}

/**
 * The root, each command, then its skills; a root that is not a folder is the only check.
 * @param {DoctorDeps} deps @param {Component} component
 * @returns {Promise<DoctorCheck[]>}
 */
const componentChecks = async (deps, component) => {
  if ((await deps.workspace.list(component.root)) === null) {
    return [{ subject: component.name, status: 'fail', detail: `root ${component.root} is not a folder` }]
  }
  /** @type {DoctorCheck[]} */
  const checks = commandNames(component).map((name) => commandCheck(component, name))
  return [...checks, ...await bddChecks(deps, component), ...await skillChecks(deps, component)]
}

/**
 * Where each runner of the component reads its scenarios; a component that declines Gherkin says
 * nothing, and one that decided neither way fails, since no run of it would start. A pair whose
 * scenarios are written and whose bindings folder is not a folder is a warning: nothing binds
 * them, the runner reports them undefined, and `test` still passes.
 * @param {DoctorDeps} deps @param {Component} component @returns {Promise<DoctorCheck[]>}
 */
const bddChecks = async (deps, component) => {
  const subject = `${component.name}/bdd`
  if (component.bdd === null) return [{ subject, status: 'fail', detail: UNDECIDED }]
  return Promise.all(component.bddPaths.map((pair) => bddCheck(deps, component.root, subject, pair)))
}

/** What a component whose Gherkin nobody decided leaves the developer to do. */
const UNDECIDED = 'the component does not say whether it describes its behaviour in Gherkin; run /skraft-init, or write "bdd" in skraft-design-config.json'

/**
 * One pair's line: where its runner reads, and a failure naming each folder of the pair that is no
 * folder of the working copy — a path that names nothing holds no scenario and binds no step,
 * whatever the gates say. A pair bound to nothing is read from the pair alone.
 * @param {DoctorDeps} deps @param {string} root @param {string} subject @param {BddPair} pair
 * @returns {Promise<DoctorCheck>}
 */
const bddCheck = async (deps, root, subject, pair) => {
  const named = pair.runner === null ? '' : `${pair.runner}: `
  const missing = await missingFolders(deps, root, pair)
  if (missing.length > 0) return { subject, status: 'fail', detail: `${named}${listed(missing)} ${missing.length === 1 ? 'is no folder' : 'are no folders'} of the working copy` }
  if (pair.steps === null) return { subject, status: 'ok', detail: `${named}${pair.features}, bound to nothing` }
  return { subject, status: 'ok', detail: `${named}${pair.features} → ${pair.steps}` }
}

/** The folders of the pair the working copy has not got. @param {DoctorDeps} deps @param {string} root @param {BddPair} pair */
const missingFolders = async (deps, root, { features, steps }) => {
  // Stryker disable next-line ConditionalExpression: a pair that binds nothing names no second folder, and asking the port about the absent one asks about the component root, whose own check answers for it; both readings report the same missing folders
  const named = steps === null ? [features] : [features, steps]
  const found = await Promise.all(named.map((inner) => isFolder(deps, root, inner)))
  return named.filter((_, index) => !found[index])
}

/** `a`, `a and b`: what a reader says out loud. @param {string[]} folders */
const listed = (folders) => folders.join(' and ')

/** Whether a folder of the component is a folder. @param {DoctorDeps} deps @param {string} root @param {string} inner */
const isFolder = async (deps, root, inner) => (await deps.workspace.list(joinRelative(root, inner))) !== null

/**
 * The skills the component asks of the agents writing its tests that exist nowhere: a warning,
 * the skills' own rules choosing another recipe for its tests or stopping them.
 * @param {DoctorDeps} deps @param {Component} component @returns {Promise<DoctorCheck[]>}
 */
const skillChecks = async ({ agentCatalog }, component) => {
  const { nowhere } = await findComponentSkills(agentCatalog, [component])
  if (nowhere.length === 0) return []
  const names = nowhere.map(({ skill }) => skill).join(', ')
  return [{ subject: component.name, status: 'warn', detail: `skills found nowhere, in the plugin or the working copy: ${names}; design-mocking-strategy-roster and design-contract-testing say which recipe its tests use instead, or that they stop` }]
}

/** Gates first, in their order, then the other commands as written. @param {Component} component */
const commandNames = (component) => {
  const gates = gatesOf(component)
  return [...gates, ...Object.keys(component.commands).filter((name) => !gates.includes(name))]
}

/**
 * A command is listed as the developer wrote it: skraft starts none; the agents run it through skraft_design_repl.
 * @param {Component} component @param {string} name @returns {DoctorCheck}
 */
const commandCheck = (component, name) => ({ subject: `${component.name}/${name}`, status: 'ok', detail: `${component.commands[name]} (listed; skraft_design_repl starts it, never skraft)` })

/**
 * What the agents of the workflow run on, and the checks of it; nothing when the workflow cannot
 * be read, which `skraft workflow check` reports.
 * @param {DoctorDeps} deps @param {SkraftConfig} config
 */
const modelsOf = async (deps, config) => {
  const { read } = await readWorkflows(deps)
  return read.ok ? modelChecks(deps, config, read.workflow) : { checks: [], assignments: null }
}

/** @param {string} version @returns {DoctorCheck} */
const nodeCheck = (version) => {
  const major = Number.parseInt(version.slice(1), 10)
  return major >= NODE_MAJOR
    ? { subject: 'node', status: 'ok', detail: `Node ${version}` }
    : { subject: 'node', status: 'fail', detail: `Node ${version}; skraft needs Node ${NODE_MAJOR} or later` }
}

/** @param {string} detail @returns {DoctorCheck} */
const configFails = (detail) => ({ subject: 'config', status: 'fail', detail })

/** @param {DoctorCheck[]} checks @param {DoctorReport['assignments']} assignments @returns {DoctorReport} */
const report = (checks, assignments) => ({ ok: checks.every((check) => check.status !== 'fail'), checks, assignments })
