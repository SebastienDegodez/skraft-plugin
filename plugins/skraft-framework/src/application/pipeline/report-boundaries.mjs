import { renderReport } from '../render-report.mjs'
import { createReportPublication } from '../report-publication-service.mjs'
import { validateReportData, parseQualityEvidence, qualityProofs } from '../../domain/reporting-presentation.mjs'
import { CONSENT_KEY, CONSENT_OPTIONS, consentQuestion, interpretConsent, remoteScopeOf } from '../../domain/reporting-consent-policy.mjs'
import {
  boundReportData, chatSummary, handoffNotesPath, isRepositoryRef, latestHandoffNotes, latestReportData,
  PENDING_PATH, reportingAddendum, reportMarkdownPath, reportRefs,
} from '../../domain/report-boundary-policy.mjs'

// Step of RunPipeline: the report boundaries of skraft-orchestrator.md "Report feedback".
//   ensureConsent   once per pipeline, the destinations the human confirms (never blocks:
//                   unanswered, the reports stay local)
//   addendum        what the DISTILL and DELIVER specialists are told about their data
//   keepHandoff     the acceptance designer's answer, relayed verbatim to the engineer
//   report          after DISTILL APPROVED (forecast), after DELIVER APPROVED or blocked
//                   (outcome): bind the review, render once, publish (ReportPublication)
//   resumePending   at DONE, a publication left pending is tried again from its Markdown
// A report never changes a verdict and never fails the run: every problem is logged.
export const createReportBoundaries = (deps) => {
  const { stateService, trackingStore, repositoryReader, templateReader, sourceControl, hasher, tryAsk, progress, time } = deps
  const publication = createReportPublication(deps)
  const today = () => time.isoString().slice(0, 10)
  const preferencesOf = async (slug) => (await stateService.get(slug)).value?.userPreferences?.reporting ?? null

  const ensureConsent = async (slug, story) => {
    if (await preferencesOf(slug)) return
    const scope = remoteScopeOf(await sourceControl.remoteUrl())
    const branch = await sourceControl.currentBranch()
    const answer = await tryAsk(slug, {
      key: CONSENT_KEY,
      question: consentQuestion({ scope, branch, issueNumber: story?.issue ?? null }),
      options: [...CONSENT_OPTIONS],
    })
    if (answer === null) {
      progress.log(`reporting: no destination confirmed — reports stay local (answer ${CONSENT_KEY} to choose)`)
      return
    }
    const consent = interpretConsent(answer, { scope, branch, issueNumber: story?.issue ?? null })
    if (!consent.ok) {
      progress.log(`reporting: "${answer}" refused — ${consent.reason}; answer ${CONSENT_KEY} again`)
      return
    }
    const configured = await stateService.configureReporting(slug, consent.preferences)
    progress.log(configured.ok ? `reporting: ${answer}` : `reporting: not saved — ${configured.error.reason}`)
  }

  const addendum = async (slug, phase) => {
    if (phase !== 'DISTILL' && phase !== 'DELIVER') return null
    const files = await trackingStore.list(slug)
    return reportingAddendum({
      phase,
      trackingPrefix: trackingStore.prefix(slug),
      date: today(),
      story: slug,
      maxMedia: (await preferencesOf(slug))?.maxMedia ?? 0,
      forecastData: latestReportData('forecast', files),
      handoffNotes: latestHandoffNotes(files),
    })
  }

  const keepHandoff = async (slug, text) => {
    if (typeof text === 'string' && text.trim() !== '') await trackingStore.write(slug, handoffNotesPath(today()), text)
  }

  // Everything renderReport reads, read first: the renderer is synchronous.
  const readReferences = async (data) => {
    const texts = new Map()
    const read = async (ref) => {
      if (!isRepositoryRef(ref) || texts.has(ref)) return
      texts.set(ref, (await repositoryReader.read(ref)) ?? undefined)
    }
    for (const ref of reportRefs(data)) await read(ref)
    if (data.kind === 'outcome') {
      const { quality } = parseQualityEvidence(texts.get(data.qualityEvidenceRef), data)
      for (const ref of qualityProofs(quality, data.qualityEvidenceRef)) await read(ref)
    }
    return texts
  }

  const publishAndTell = async (slug, preferences, { kind, story, markdown, markdownPath }) => {
    const results = preferences ? await publication.publish({ slug, preferences, story, kind, body: markdown }) : []
    if (preferences?.destinations?.chat || results.length > 0) {
      progress.log(chatSummary({ kind, story, markdownPath: `${trackingStore.prefix(slug)}${markdownPath}`, results }))
    }
    return results
  }

  const report = async (slug, kind, reviewPath) => {
    try {
      const files = await trackingStore.list(slug)
      const dataPath = latestReportData(kind, files)
      if (!dataPath) {
        progress.log(`${kind} report: no ${kind} data was written; nothing rendered`)
        return null
      }
      const preferences = await preferencesOf(slug)
      const data = boundReportData(JSON.parse(await trackingStore.read(slug, dataPath)), {
        reviewRef: reviewPath ? `${trackingStore.prefix(slug)}${reviewPath}` : undefined,
        maxMedia: preferences?.maxMedia,
      })
      validateReportData(data)
      const texts = await readReferences(data)
      const template = await templateReader.read(`skills/qa-reporting/assets/templates/${data.kind}.md`)
      const markdown = renderReport(data, {
        readText: (ref) => texts.get(ref),
        hashText: (text) => hasher.sha256Sync(text),
        readTemplate: () => template,
      })
      const markdownPath = reportMarkdownPath(kind, today())
      await trackingStore.write(slug, markdownPath, markdown)
      const results = await publishAndTell(slug, preferences, { kind, story: data.story, markdown, markdownPath })
      return { markdownPath, results }
    } catch (error) {
      progress.log(`${kind} report not rendered: ${error?.message ?? error}`)
      return null
    }
  }

  const resumePending = async (slug) => {
    try {
      let pending
      try { pending = JSON.parse(await trackingStore.read(slug, PENDING_PATH)) } catch { return }
      const packet = pending?.packet
      if (!packet || packet.status !== 'ready') return
      const files = await trackingStore.list(slug)
      const markdownPath = files.filter((file) => new RegExp(`^reporting/\\d{4}-\\d{2}-\\d{2}/${packet.kind}\\.md$`).test(file)).sort().at(-1)
      if (!markdownPath) return
      progress.log(`${packet.kind} report: publication pending — trying again`)
      await publishAndTell(slug, await preferencesOf(slug), {
        kind: packet.kind, story: packet.story, markdown: await trackingStore.read(slug, markdownPath), markdownPath,
      })
    } catch (error) {
      progress.log(`publication resume failed: ${error?.message ?? error}`)
    }
  }

  return Object.freeze({ ensureConsent, addendum, keepHandoff, report, resumePending })
}
