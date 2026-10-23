import { CONFIG_FILE, NO_COMPONENT, NO_GATE } from '../../domain/config/skraft-config.mjs'
import { commandText, lookedFor, parseCommand, programChoices } from '../../domain/gates/command-line.mjs'
import { DOCKER_HINT, DOCKER_PROBE, failureOf, gatesOf } from '../../domain/gates/gate-plan.mjs'
import { baseOf, loadConfig, resolveBases } from '../config/bases.mjs'
import { readWorkflows } from '../workflow/load-workflow.mjs'
import { modelChecks } from './model-checks.mjs'

/**
 * @typedef {import('../../domain/config/skraft-config.mjs').Component} Component
 * @typedef {import('../../domain/config/skraft-config.mjs').SkraftConfig} SkraftConfig
 * @typedef {{ subject: string, status: 'ok' | 'warn' | 'fail', detail: string }} DoctorCheck
 *   subject: `node`, `config`, `docker`, `models`, `models/<host>`, `<component>` or
 *   `<component>/<command>`; warn: worth knowing, never a failure.
 * @typedef {{ ok: boolean, checks: DoctorCheck[], assignments: import('./model-checks.mjs').AssignmentTable | null }} DoctorReport
 *   assignments: what each agent the workflow dispatches runs on, by host; null when the
 *   configuration or the workflow cannot be read.
 * @typedef {{
 *   workspace: Pick<import('../ports/workspace.mjs').Workspace, 'read' | 'list'>,
 *   userSettings: import('../ports/user-settings.mjs').UserSettings,
 *   workflowSource: import('../ports/workflow-source.mjs').WorkflowSource,
 *   executables: import('../ports/executables.mjs').Executables,
 *   commandRunner: import('../ports/command-runner.mjs').CommandRunner,
 *   sourceControl: import('../ports/source-control.mjs').SourceControl,
 *   runtime: import('../ports/runtime.mjs').Runtime,
 * } & import('./model-checks.mjs').ModelCheckDeps} DoctorDeps
 */

const NODE_MAJOR = 22

/**
 * Doctor — checks that every command of every component can run on this machine: Node, the
 * configuration, each component's root, each command's program, Docker for Microcks, then what
 * each agent the workflow dispatches runs on, per host. With `run`, starts each command once
 * from its component's root.
 * @param {DoctorDeps} deps
 */
export const createDoctor = (deps) => Object.freeze({
  /** @param {{ run?: boolean, base?: string | null }} [request] @returns {Promise<DoctorReport>} */
  check: (request) => check(deps, request),
})

/**
 * Node, then the configuration; the rest only once the configuration names components.
 * @param {DoctorDeps} deps @param {{ run?: boolean, base?: string | null }} [request]
 * @returns {Promise<DoctorReport>}
 */
const check = async (deps, { run = false, base = null } = {}) => {
  const checks = [nodeCheck(deps.runtime.nodeVersion())]
  const configured = configCheck(await loadConfig(deps))
  checks.push(configured.check)
  if (!configured.ok) return report(checks, null)
  const commands = await configuredChecks(deps, configured.config, { run, base })
  const models = await modelsOf(deps, configured.config)
  return report([...checks, ...commands, ...models.checks], models.assignments)
}

/**
 * The base with `run`, each component, then Docker.
 * @param {DoctorDeps} deps @param {SkraftConfig} config
 * @param {{ run: boolean, base: string | null }} request
 * @returns {Promise<DoctorCheck[]>}
 */
const configuredChecks = async (deps, config, { run, base }) => {
  const resolved = run ? await resolveBases(deps, { config, flag: base }) : null
  /** @type {DoctorCheck[]} */
  const checks = resolved?.ok === false ? [{ subject: 'base', status: 'fail', detail: resolved.reason }] : []
  for (const component of config.components) {
    checks.push(...await componentChecks(deps, component, { run, baseSha: baseShaOf(resolved, component.name) }))
  }
  checks.push(...await dockerChecks(deps, config.components))
  return checks
}

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
 * The base a component's commands get: HEAD without `run`, none when the bases did not resolve.
 * @param {Awaited<ReturnType<typeof resolveBases>> | null} resolved @param {string} component
 */
const baseShaOf = (resolved, component) => {
  if (resolved === null) return 'HEAD'
  return resolved.ok ? baseOf(resolved.bases, component)?.sha ?? null : null
}

/**
 * The root, the gates, then each command; a root that is not a folder is the only check.
 * @param {DoctorDeps} deps @param {Component} component
 * @param {{ run: boolean, baseSha: string | null }} request
 * @returns {Promise<DoctorCheck[]>}
 */
const componentChecks = async (deps, component, { run, baseSha }) => {
  if ((await deps.workspace.list(component.root)) === null) {
    return [{ subject: component.name, status: 'fail', detail: `root ${component.root} is not a folder` }]
  }
  /** @type {DoctorCheck[]} */
  const checks = gatesOf(component).length === 0 ? [{ subject: component.name, status: 'fail', detail: NO_GATE }] : []
  for (const name of commandNames(component)) checks.push(await commandCheck(deps, { component, name, run, baseSha }))
  return checks
}

/** Gates first, in their order, then the other commands as written. @param {Component} component */
const commandNames = (component) => {
  const gates = gatesOf(component)
  return [...gates, ...Object.keys(component.commands).filter((name) => !gates.includes(name))]
}

/**
 * @param {DoctorDeps} deps
 * @param {{ component: Component, name: string, run: boolean, baseSha: string | null }} request
 * @returns {Promise<DoctorCheck>}
 */
const commandCheck = async (deps, { component, name, run, baseSha }) => {
  const subject = `${component.name}/${name}`
  const line = component.commands[name]
  const parsed = parseCommand(line, { baseSha })
  if (!parsed.ok) return { subject, status: 'fail', detail: `${JSON.stringify(line)} ${parsed.reason}` }
  const [program] = parsed.argv
  const choices = programChoices(parsed.argv)
  const found = await locateFirst(deps, choices, component.root)
  if (found === null) return { subject, status: 'fail', detail: notFound({ component, name, program, choices }) }
  if (!run) return { subject, status: 'ok', detail: `${program} → ${found.located}` }
  return runCheck(deps, subject, { argv: found.argv, cwd: component.root })
}

/**
 * @param {{ component: Component, name: string, program: string, choices: string[][] }} missing
 */
const notFound = ({ component, name, program, choices }) =>
  `command not found: ${program} (from ${component.root}${lookedFor(choices)}); install it or change commands.${name} in ${CONFIG_FILE}`

/**
 * Starts the located command once; it passes only on exit 0.
 * @param {DoctorDeps} deps @param {string} subject @param {{ argv: string[], cwd: string }} command
 * @returns {Promise<DoctorCheck>}
 */
const runCheck = async (deps, subject, { argv, cwd }) => {
  const result = await deps.commandRunner.run({ argv, cwd })
  if (!result.started) return { subject, status: 'fail', detail: /** @type {string} */ (result.error) }
  const ran = commandText(argv)
  return result.exitCode === 0
    ? { subject, status: 'ok', detail: `${ran} passed` }
    : { subject, status: 'fail', detail: `${ran} exited ${result.exitCode}` }
}

/**
 * The first program choice found on this machine, and where.
 * @param {DoctorDeps} deps @param {string[][]} choices @param {string} cwd
 * @returns {Promise<{ argv: string[], located: string } | null>}
 */
const locateFirst = async (deps, choices, cwd) => {
  for (const argv of choices) {
    const located = await deps.executables.locate(argv[0], cwd)
    if (located !== null) return { argv, located }
  }
  return null
}

/**
 * Docker, only when a component mocks with Microcks.
 * @param {DoctorDeps} deps @param {Component[]} components @returns {Promise<DoctorCheck[]>}
 */
const dockerChecks = async (deps, components) => {
  const microcks = components.filter((component) => component.mocking.strategy === 'microcks').map(({ name }) => name)
  return microcks.length > 0 ? [await dockerCheck(deps, microcks)] : []
}

/** @param {DoctorDeps} deps @param {string[]} components */
const dockerCheck = async (deps, components) => {
  const answers = failureOf(await deps.commandRunner.run({ argv: [...DOCKER_PROBE], cwd: '.' })) === null
  return answers
    ? { subject: 'docker', status: /** @type {const} */ ('ok'), detail: `Docker answers (Microcks: ${components.join(', ')})` }
    : { subject: 'docker', status: /** @type {const} */ ('fail'), detail: `Docker does not answer, and Microcks, the mocking of ${components.join(', ')}, needs it; ${DOCKER_HINT}` }
}

/**
 * What the agents of the workflow run on, and the checks of it; nothing when the workflow cannot
 * be read, which `skraft workflow check` reports.
 * @param {DoctorDeps} deps @param {SkraftConfig} config
 */
const modelsOf = async (deps, config) => {
  const { read } = await readWorkflows(deps, config)
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
