import { createInit } from '../../application/init.mjs'
import { createObserve } from '../../application/observe.mjs'

/**
 * @typedef {{ out: (line: string) => void, err: (line: string) => void }} Console
 * @typedef {Parameters<typeof createInit>[0]} CliAdapters
 * @typedef {{ pluginVersion: () => string, adapters: () => CliAdapters }} CliServices
 */

export const USAGE = 'usage: skraft --version | init <slug> [--issue <number>] [--title <text>] | status [--json]'

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
  if (command === 'init') return init(rest, services, console)
  if (command === 'status' && rest.length <= 1 && (rest[0] ?? '--json') === '--json') return status(rest[0] === '--json', services, console)
  console.err(USAGE)
  return 2
}

/** @param {string[]} args @param {CliServices} services @param {Console} console */
const init = async (args, services, console) => {
  const [slug, ...options] = args
  const story = storyOf(options)
  if (story === undefined) {
    console.err(USAGE)
    return 2
  }
  const outcome = await createInit(services.adapters()).init({ slug: slug ?? null, story })
  if (!outcome.ok) {
    console.err(outcome.reason)
    return 1
  }
  console.out(outcome.reason)
  return 0
}

/**
 * `--issue <number>` and `--title <text>`, each at most once; undefined when malformed.
 * @param {string[]} options
 * @returns {import('../../application/init.mjs').Story | undefined}
 */
const storyOf = (options) => {
  /** @type {{ issue?: number, title?: string }} */
  const story = {}
  for (let index = 0; index < options.length; index += 2) {
    const [name, value] = [options[index], options[index + 1]]
    if (value === undefined) return undefined
    if (name === '--issue' && story.issue === undefined && /^[1-9]\d*$/.test(value)) story.issue = Number(value)
    else if (name === '--title' && story.title === undefined) story.title = value
    else return undefined
  }
  return story.issue === undefined && story.title === undefined ? null : { issue: story.issue ?? null, title: story.title ?? null }
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
