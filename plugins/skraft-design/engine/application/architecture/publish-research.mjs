import { RESEARCH_MARKER } from '../../domain/architecture/research.mjs'
import { forgeAdapters } from '../config/forge.mjs'

export const publishResearch = async ({ deps, slug, journal, config }) => {
  if (config.publish.pullRequest !== true) return { ok: true }
  const scope = journal.events.find((event) => event.type === 'architecture.scope')
  const research = journal.events.findLast((event) => event.type === 'step.started' && event.step === 'research')
  if (!scope || !research) return { ok: false, reason: 'The run has no architecture research to publish.' }
  const body = await deps.files.read(slug, research.outputs[0])
  if (body === null) return { ok: false, reason: 'The architecture research output is missing.' }
  const { codeHost } = await forgeAdapters(deps, config.forge)
  return keepResearch({ ...deps, codeHost }, { slug, journal, number: scope.root.number, body })
}

const keepResearch = async (deps, { slug, journal, number, body }) => {
  const markdown = `${RESEARCH_MARKER}\n${body}`
  const hash = await deps.hasher.sha256(markdown)
  const previous = journal.events.findLast((event) => event.type === 'architecture.research-published')
  if (previous?.hash === hash) return { ok: true, url: previous.url }
  await deps.files.write(slug, 'publish/research.md', markdown)
  await deps.files.write(slug, 'publish/research.json', JSON.stringify({ text: markdown }))
  const result = await deps.codeHost.keepIssueComment({ number, marker: RESEARCH_MARKER, url: previous?.url ?? null,
    body: markdown, bodyFile: deps.files.location(slug, 'publish/research.md'), requestFile: deps.files.location(slug, 'publish/research.json') })
  if (result.ok) await journal.append('architecture.research-published', { url: result.url, hash })
  return result
}
