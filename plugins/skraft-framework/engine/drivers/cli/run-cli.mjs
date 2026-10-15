import { createInit } from '../../application/init.mjs'
import { createObserve } from '../../application/observe.mjs'
import { createConfigureComponents } from '../../application/configure-components.mjs'
import { createRunGate } from '../../application/run-gate.mjs'
import { createDoctor } from '../../application/doctor.mjs'

/**
 * @typedef {{ out: (line: string) => void, err: (line: string) => void }} Console
 * @typedef {Parameters<typeof createInit>[0] & Parameters<typeof createRunGate>[0] & Parameters<typeof createDoctor>[0] & Parameters<typeof createConfigureComponents>[0]} CliAdapters
 * @typedef {{ pluginVersion: () => string, workingCopyName: () => string, adapters: () => CliAdapters }} CliServices
 */

export const USAGE = [
  'usage: skraft --version',
  '       skraft init [--add <folder>]...                                   detect the components into skraft-config.json',
  '       skraft init <slug> [--issue <number>] [--title <text>] [--base <ref>]   start or resume a pipeline',
  '       skraft status [--json]',
  '       skraft gate [--all] [--json]                                      run the gates of the changed components (all with --all)',
  '       skraft doctor [--run] [--base <ref>] [--json]                     check every command can run (--run: run each once)',
].join('\n')

/**
 * @param {string[]} args command-line arguments after the script path
 * @param {CliServices} services
 * @param {Console} console
 * @returns {Promise<number>} exit code
 */
export const runCli = async ([command, ...rest], services, console) => {
  if (command === '--version') {
    console.out(services.pluginVersion())
    return 0
  }
  if (command === 'init') return rest.length === 0 || rest[0].startsWith('--') ? configure(rest, services, console) : init(rest, services, console)
  if (command === 'status' && rest.length <= 1 && (rest[0] ?? '--json') === '--json') return status(rest[0] === '--json', services, console)
  if (command === 'gate') return gate(rest, services, console)
  if (command === 'doctor') return doctor(rest, services, console)
  console.err(USAGE)
  return 2
}

/**
 * Options as `--name value` pairs and `--flag`s; undefined when one is unknown or repeated
 * without being listed as repeatable.
 * @param {string[]} args
 * @param {{ values?: string[], flags?: string[], repeated?: string[] }} spec
 * @returns {Record<string, string | string[] | true> | undefined}
 */
const optionsOf = (args, { values = [], flags = [], repeated = [] }) => {
  /** @type {Record<string, string | string[] | true>} */
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]
    if (flags.includes(name) && !(name in options)) {
      options[name] = true
    } else if ((values.includes(name) || repeated.includes(name)) && args[index + 1] !== undefined && !args[index + 1].startsWith('--')) {
      const value = args[(index += 1)]
      if (repeated.includes(name)) options[name] = [.../** @type {string[]} */ (options[name] ?? []), value]
      else if (name in options) return undefined
      else options[name] = value
    } else {
      return undefined
    }
  }
  return options
}

/** @param {string[]} args @param {CliServices} services @param {Console} console */
const configure = async (args, services, console) => {
  const options = optionsOf(args, { repeated: ['--add'] })
  if (options === undefined) return usage(console)
  const folders = /** @type {string[]} */ (options['--add'] ?? [])
  const outcome = await createConfigureComponents(services.adapters()).configure({ workingCopyName: services.workingCopyName(), folders })
  if (!outcome.ok) {
    console.err(outcome.reason)
    return 1
  }
  console.out(outcome.reason)
  return 0
}

/** @param {string[]} args @param {CliServices} services @param {Console} console */
const init = async (args, services, console) => {
  const [slug, ...rest] = args
  const options = optionsOf(rest, { values: ['--issue', '--title', '--base'] })
  if (options === undefined) return usage(console)
  const issue = options['--issue']
  if (issue !== undefined && !/^[1-9]\d*$/.test(String(issue))) return usage(console)
  const title = /** @type {string | undefined} */ (options['--title'])
  const story = issue === undefined && title === undefined ? null : { issue: issue === undefined ? null : Number(issue), title: title ?? null }
  const outcome = await createInit(services.adapters()).init({ slug: slug ?? null, story, base: options['--base'] ?? null })
  if (!outcome.ok) {
    console.err(outcome.reason)
    return 1
  }
  console.out(outcome.reason)
  return 0
}

/** @param {boolean} json @param {CliServices} services @param {Console} console */
const status = async (json, services, console) => {
  const view = await createObserve(services.adapters()).view()
  if (json) {
    console.out(JSON.stringify(view, null, 2))
  } else {
    console.out(`skraft${view.slug ? ` ${view.slug}` : ''}: ${view.status}`)
    for (const { phase, state } of view.phases) console.out(`${phase}  ${state}`)
    if (view.current) console.out(`agent: ${view.current.agent} (${view.current.step}, attempt ${view.current.attempt})`)
    if (view.costUsd !== null) console.out(`cost: ${view.costUsd.toFixed(2)} USD`)
    if (view.reason) console.out(view.reason)
  }
  return view.status === 'tampered' ? 1 : 0
}

/** @param {string[]} args @param {CliServices} services @param {Console} console */
const gate = async (args, services, console) => {
  const options = optionsOf(args, { flags: ['--all', '--json'] })
  if (options === undefined) return usage(console)
  const outcome = await createRunGate(services.adapters()).run({ scope: options['--all'] ? 'all' : 'touched' })
  if (options['--json']) {
    console.out(JSON.stringify(outcome, null, 2))
  } else {
    for (const result of outcome.gates) {
      console.out(`${result.status === 'pass' ? 'pass' : `fail (${result.failure})`}  ${result.component}/${result.gate}${result.status === 'pass' ? '' : `: ${result.reason}`}`)
    }
    console.out(`skraft${outcome.slug ? ` ${outcome.slug}` : ''}: gates ${outcome.status}${outcome.code ? ` (${outcome.code})` : ''} — ${outcome.reason}`)
  }
  return outcome.status === 'passed' ? 0 : 1
}

/** @param {string[]} args @param {CliServices} services @param {Console} console */
const doctor = async (args, services, console) => {
  const options = optionsOf(args, { flags: ['--run', '--json'], values: ['--base'] })
  if (options === undefined) return usage(console)
  const report = await createDoctor(services.adapters()).check({ run: options['--run'] === true, base: /** @type {string | undefined} */ (options['--base']) ?? null })
  if (options['--json']) {
    console.out(JSON.stringify(report, null, 2))
  } else {
    for (const { subject, status: state, detail } of report.checks) console.out(`${state === 'ok' ? 'ok  ' : 'FAIL'}  ${subject}: ${detail}`)
    console.out(report.ok ? 'skraft doctor: every check passed' : `skraft doctor: ${report.checks.filter((check) => check.status === 'fail').length} checks failed`)
  }
  return report.ok ? 0 : 1
}

/** @param {Console} console */
const usage = (console) => {
  console.err(USAGE)
  return 2
}
