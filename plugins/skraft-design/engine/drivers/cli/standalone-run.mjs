import { basename, dirname } from 'node:path'
import { appendFile, mkdir } from 'node:fs/promises'
import { createNodeAdapters } from '../../infrastructure/node-adapters.mjs'
import { createArchitectureForge } from '../../infrastructure/architecture/forge.mjs'
import { createMergedRepository } from '../../infrastructure/architecture/merged-repository.mjs'
import { createDesignRun } from '../../application/architecture/design-run.mjs'
import { createAgentLoop } from './agent-loop.mjs'
import { createObserve } from '../../application/pipeline/observe-usecase.mjs'
import { createDraftPublication } from '../../application/publish/draft-publication-usecase.mjs'
import { createDecide } from '../../application/decisions/decide-usecase.mjs'
import { createPrecheck } from '../../application/pipeline/precheck-usecase.mjs'
import { createConfigureComponents } from '../../application/config/configure-components-usecase.mjs'
import { loadConfig } from '../../application/config/bases.mjs'
import { chosenForge, forgeAdapters } from '../../application/config/forge.mjs'
import { CONFIG_FILE, withPublishSetting } from '../../domain/config/skraft-config.mjs'
import { CONSENT_TEXT, PUBLISH_CONSENT_TEXT } from '../../domain/decisions/questions.mjs'
import { unsettledConsents } from '../../domain/decisions/consents.mjs'
import { draftInCi } from '../../application/architecture/ci-mode.mjs'

export const runStandalone = async ([operation, encoded], services, console) => {
  try {
    return await callStandalone(operation, encoded, services, console)
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    return unexpected(services, console, error)
  }
}

const callStandalone = async (operation, encoded, services, console) => {
  const args = JSON.parse(encoded)
  const deps = await adaptersFor(services)
  if (!deps.ok) return output(console, deps)
  const outcome = await execute(operation, args, deps.adapters, services, console.err)
  return output(console, outcome)
}

const unexpected = async (services, console, error) => {
  try {
    const adapters = createNodeAdapters({ cwd: services.cwd, pluginRoot: services.pluginFolder() })
    const slug = await adapters.activePipeline.current()
    if (slug === null) return output(console, { status: 'refused', code: 'unexpected-error', reason: 'Unexpected failure before an active run could be opened; no step was approved.' })
    const path = await privateDiagnostic(adapters, slug, error)
    return output(console, { status: 'blocked', slug, code: 'unexpected-error', reason: `Unexpected failure; private diagnostic: ${path}` })
  } catch {
    return output(console, { status: 'refused', code: 'unexpected-log-unwritable', reason: 'Unexpected failure and the private diagnostic log could not be written; no step was approved.' })
  }
}
const privateDiagnostic = async (adapters, slug, error) => {
  const path = adapters.files.location(slug, 'logs/unexpected.log')
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, `${error instanceof Error ? error.stack : String(error)}\n`)
  return path
}
const output = (console, outcome) => {
  console.out(JSON.stringify(outcome))
  return outcome.ok === false || ['blocked', 'refused'].includes(outcome.status) ? 1 : 0
}

const adaptersFor = async (services) => {
  const adapters = createNodeAdapters({ cwd: services.cwd, pluginRoot: services.pluginFolder(), agentHost: services.host })
  const config = await loadConfig(adapters)
  if (!config.ok) return config
  const { forge } = await chosenForge(adapters, config.config.forge)
  const { codeHost } = await forgeAdapters(adapters, config.config.forge)
  return { ok: true, adapters: { ...adapters, agentHost: services.host, codeHost, architectureForge: createArchitectureForge({ ...adapters, codeHost, forge }),
    architectureRepository: createMergedRepository({ ...adapters, base: config.config.baseBranch ?? 'main' }) } }
}

const execute = (operation, args, deps, services, log) =>
  dispatchSimple(operation, args, deps, services) ?? executePipeline(operation, args, deps, services, log)

const dispatchSimple = (operation, args, deps, services) => {
  if (operation === 'setup') return setup(deps, services, args)
  if (operation === 'answer') return createDecide(deps).decide(args)
  if (operation === 'precheck') return createPrecheck(deps).precheck()
  if (operation === 'status') return createObserve(deps).view()
  if (operation === 'draft') return createDraftPublication(deps).publish()
  if (operation === 'report') return createObserve(deps).report()
  return null
}

// A CI run that comes to wait on a person publishes its draft before it hands back (#662).
const executePipeline = async (operation, args, deps, services, log) => {
  const run = createDesignRun(deps)
  const prepared = operation === 'start' ? await run.start(args) : await run.prepare()
  if (prepared.status !== 'ready') return draftInCi(deps, prepared)
  return draftInCi(deps, await advance(operation, deps, services, log, prepared))
}

const advance = async (operation, deps, services, log, prepared) => {
  const loop = createAgentLoop({ adapters: deps, then: services.then, log })
  const result = await (operation === 'record' ? loop.record() : loop.next())
  return prepared.notice ? { ...result, notice: prepared.notice } : result
}

const setup = async (deps, services, args) => {
  const configured = await createConfigureComponents(deps).configure({ workingCopyName: basename(services.cwd) })
  if (!configured.ok) return configured
  let text = await deps.workspace.read(CONFIG_FILE)
  if (args.pullRequest !== undefined) text = withPublishSetting(JSON.parse(text), 'pullRequest', args.pullRequest)
  if (args.visuals !== undefined) text = withPublishSetting(JSON.parse(text), 'visuals', args.visuals)
  const config = JSON.parse(text)
  if (args.bdd !== undefined) config.components = config.components.map((component) => ({ ...component, bdd: component.bdd ?? args.bdd }))
  await deps.workspace.write(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`)
  return configuredResult(deps, configured)
}

const configuredResult = async (deps, configured) => {
  const effective = await loadConfig(deps)
  if (!effective.ok) return effective
  return { ...configured, questions: unsettledConsents(effective.config.publish, ['pullRequest']).map(({ key }) => ({
    key, text: key === 'pullRequest' ? PUBLISH_CONSENT_TEXT : CONSENT_TEXT, options: ['YES', 'NO'],
  })) }
}
