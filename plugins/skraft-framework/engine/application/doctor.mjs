import { CONFIG_FILE, NO_COMPONENT, NO_GATE } from '../domain/config/skraft-config.mjs'
import { commandText, lookedFor, parseCommand, programChoices } from '../domain/gates/command-line.mjs'
import { DOCKER_HINT, DOCKER_PROBE, failureOf, gatesOf } from '../domain/gates/gate-plan.mjs'
import { baseOf, loadConfig, resolveBases } from './bases.mjs'

/**
 * @typedef {import('../domain/config/skraft-config.mjs').Component} Component
 * @typedef {{ subject: string, status: 'ok' | 'fail', detail: string }} DoctorCheck
 *   subject: `node`, `config`, `docker`, `<component>` or `<component>/<command>`.
 * @typedef {{ ok: boolean, checks: DoctorCheck[] }} DoctorReport
 * @typedef {{
 *   workspace: Pick<import('./ports/workspace.mjs').Workspace, 'read' | 'list'>,
 *   executables: import('./ports/executables.mjs').Executables,
 *   commandRunner: import('./ports/command-runner.mjs').CommandRunner,
 *   sourceControl: import('./ports/source-control.mjs').SourceControl,
 *   runtime: import('./ports/runtime.mjs').Runtime,
 * }} DoctorDeps
 */

const NODE_MAJOR = 22

/**
 * Doctor — checks that every command of every component can run on this machine: Node, the
 * configuration, each component's root, each command's program, Docker for Microcks. With
 * `run`, starts each command once from its component's root.
 * @param {DoctorDeps} deps
 */
export const createDoctor = (deps) => Object.freeze({
  /** @param {{ run?: boolean, base?: string | null }} [request] @returns {Promise<DoctorReport>} */
  check: async ({ run = false, base = null } = {}) => {
    /** @type {DoctorCheck[]} */
    const checks = [nodeCheck(deps.runtime.nodeVersion())]
    const loaded = await loadConfig(deps)
    if (!loaded.ok) return report([...checks, configFails(loaded.reason)])
    const { components } = loaded.config
    const empty = !loaded.present ? `no ${CONFIG_FILE}; run skraft init to detect the components` : components.length === 0 ? NO_COMPONENT : null
    if (empty !== null) return report([...checks, configFails(empty)])
    checks.push({ subject: 'config', status: 'ok', detail: `${components.length} components: ${components.map(({ name }) => name).join(', ')}` })

    const resolved = run ? await resolveBases(deps, { config: loaded.config, flag: base }) : null
    if (resolved?.ok === false) checks.push({ subject: 'base', status: 'fail', detail: resolved.reason })
    for (const component of components) {
      if ((await deps.workspace.list(component.root)) === null) {
        checks.push({ subject: component.name, status: 'fail', detail: `root ${component.root} is not a folder` })
        continue
      }
      if (gatesOf(component).length === 0) checks.push({ subject: component.name, status: 'fail', detail: NO_GATE })
      const baseSha = resolved === null ? 'HEAD' : resolved.ok ? baseOf(resolved.bases, component.name)?.sha ?? null : null
      for (const name of commandNames(component)) checks.push(await commandCheck(deps, { component, name, run, baseSha }))
    }
    const microcks = components.filter((component) => component.mocking.strategy === 'microcks').map(({ name }) => name)
    if (microcks.length > 0) checks.push(await dockerCheck(deps, microcks))
    return report(checks)
  },
})

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
  if (found === null) {
    return { subject, status: 'fail', detail: `command not found: ${program} (from ${component.root}${lookedFor(choices)}); install it or change commands.${name} in ${CONFIG_FILE}` }
  }
  if (!run) return { subject, status: 'ok', detail: `${program} → ${found.located}` }
  const result = await deps.commandRunner.run({ argv: found.argv, cwd: component.root })
  if (!result.started) return { subject, status: 'fail', detail: /** @type {string} */ (result.error) }
  const ran = commandText(found.argv)
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

/** @param {DoctorDeps} deps @param {string[]} components */
const dockerCheck = async (deps, components) => {
  const answers = failureOf(await deps.commandRunner.run({ argv: [...DOCKER_PROBE], cwd: '.' })) === null
  return answers
    ? { subject: 'docker', status: /** @type {const} */ ('ok'), detail: `Docker answers (Microcks: ${components.join(', ')})` }
    : { subject: 'docker', status: /** @type {const} */ ('fail'), detail: `Docker does not answer, and Microcks, the mocking of ${components.join(', ')}, needs it; ${DOCKER_HINT}` }
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

/** @param {DoctorCheck[]} checks @returns {DoctorReport} */
const report = (checks) => ({ ok: checks.every((check) => check.status === 'ok'), checks })
