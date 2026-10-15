import { CONFIG_FILE } from '../domain/config/skraft-config.mjs'
import { parseCommand } from '../domain/gates/command-line.mjs'
import { GATE_ORDER } from '../domain/gates/gate-plan.mjs'
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
    if (!loaded.ok) return report([...checks, { subject: 'config', status: 'fail', detail: loaded.reason }])
    const { components } = loaded.config
    if (!loaded.present) return report([...checks, { subject: 'config', status: 'fail', detail: `no ${CONFIG_FILE}; run skraft init to detect the components` }])
    if (components.length === 0) return report([...checks, { subject: 'config', status: 'fail', detail: `${CONFIG_FILE} lists no component; run skraft init to detect them` }])
    checks.push({ subject: 'config', status: 'ok', detail: `${components.length} components: ${components.map(({ name }) => name).join(', ')}` })

    /** @type {import('./bases.mjs').Base[]} */
    let bases = []
    if (run) {
      const resolved = await resolveBases(deps, { config: loaded.config, flag: base })
      if (resolved.ok) bases = resolved.bases
      else checks.push({ subject: 'base', status: 'fail', detail: resolved.reason })
    }
    for (const component of components) {
      if ((await deps.workspace.list(component.root)) === null) {
        checks.push({ subject: component.name, status: 'fail', detail: `root ${component.root} is not a folder` })
        continue
      }
      if (!GATE_ORDER.some((name) => name in component.commands)) {
        checks.push({ subject: component.name, status: 'fail', detail: `no gate command; give it at least one of ${GATE_ORDER.join(', ')} in ${CONFIG_FILE}` })
      }
      for (const name of commandNames(component)) {
        const baseSha = run ? baseOf(bases, component.name)?.sha ?? null : 'HEAD'
        checks.push(await commandCheck(deps, { component, name, run, baseSha }))
      }
    }
    const microcks = components.filter((component) => component.mocking.strategy === 'microcks').map(({ name }) => name)
    if (microcks.length > 0) checks.push(await dockerCheck(deps, microcks))
    return report(checks)
  },
})

/** Gates first, in their order, then the other commands as written. @param {Component} component */
const commandNames = (component) => [
  ...GATE_ORDER.filter((name) => name in component.commands),
  ...Object.keys(component.commands).filter((name) => !GATE_ORDER.includes(name)),
]

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
  const located = await deps.executables.locate(program, component.root)
  if (located === null) return { subject, status: 'fail', detail: `command not found: ${program} (from ${component.root}); install it or change commands.${name} in ${CONFIG_FILE}` }
  if (!run) return { subject, status: 'ok', detail: `${program} → ${located}` }
  const result = await deps.commandRunner.run({ argv: parsed.argv, cwd: component.root })
  if (!result.started) return { subject, status: 'fail', detail: /** @type {string} */ (result.error) }
  return result.exitCode === 0
    ? { subject, status: 'ok', detail: `${line} passed` }
    : { subject, status: 'fail', detail: `${line} exited ${result.exitCode}` }
}

/** @param {DoctorDeps} deps @param {string[]} components */
const dockerCheck = async (deps, components) => {
  const answer = await deps.commandRunner.run({ argv: ['docker', 'info'], cwd: '.' })
  return answer.started && answer.exitCode === 0
    ? { subject: 'docker', status: /** @type {const} */ ('ok'), detail: `Docker answers (Microcks: ${components.join(', ')})` }
    : {
      subject: 'docker',
      status: /** @type {const} */ ('fail'),
      detail: `Docker does not answer, and Microcks, the mocking of ${components.join(', ')}, needs it; start Docker, or set "mocking": { "strategy": "inprocess" } on the component`,
    }
}

/** @param {string} version @returns {DoctorCheck} */
const nodeCheck = (version) => {
  const major = Number(/^v?(\d+)\./.exec(version)?.[1] ?? 0)
  return major >= NODE_MAJOR
    ? { subject: 'node', status: 'ok', detail: `Node ${version}` }
    : { subject: 'node', status: 'fail', detail: `Node ${version}; skraft needs Node ${NODE_MAJOR} or later` }
}

/** @param {DoctorCheck[]} checks @returns {DoctorReport} */
const report = (checks) => ({ ok: checks.every((check) => check.status === 'ok'), checks })
