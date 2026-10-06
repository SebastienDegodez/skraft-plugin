import { isRootReference } from './reporting-presentation.mjs'

// Pure: where the reports of a pipeline live, and what the DISTILL and DELIVER specialists
// are told about them — what skraft-orchestrator.md "Report feedback" and "DELIVER phase"
// asked the orchestrator to pass by hand. All paths are tracking-relative.
//
//   reporting/{date}/forecast-data.json   the acceptance designer's forecast data
//   reporting/{date}/outcome-data.json    the engineer's outcome data
//   reporting/{date}/distill-handoff.md   the designer's answer: acceptance tests, RED refs
//   reporting/{date}/{kind}.md            the report RunPipeline renders from the data
//   reporting/pending.json, reporting/{kind}/{story}.json, reporting/publication.json
//                                         publication attempt and receipts (report.mjs names)

export const REPORT_KINDS = Object.freeze(['forecast', 'outcome'])

const DATED = (name) => new RegExp(`^reporting/(\\d{4}-\\d{2}-\\d{2})/${name.replace('.', '\\.')}$`)

export const reportDataPath = (kind, date) => `reporting/${date}/${kind}-data.json`
export const reportMarkdownPath = (kind, date) => `reporting/${date}/${kind}.md`
export const handoffNotesPath = (date) => `reporting/${date}/distill-handoff.md`
export const PENDING_PATH = 'reporting/pending.json'
export const PUBLICATION_PATH = 'reporting/publication.json'
export const receiptPath = (kind, story) => `reporting/${kind}/${story}.json`

// The newest dated file of that name among tracking files, or null.
const newest = (files, name) => files.filter((file) => DATED(name).test(file)).sort().at(-1) ?? null
export const latestReportData = (kind, files) => newest(files, `${kind}-data.json`)
export const latestHandoffNotes = (files) => newest(files, 'distill-handoff.md')

// A reference a report may read: repository-relative, no traversal (reporting-presentation).
export const isRepositoryRef = isRootReference

// The data a producer wrote, bound to the persisted review and the confirmed media count.
export const boundReportData = (data, { reviewRef, maxMedia }) => ({
  ...data,
  ...(reviewRef ? { reviewRef } : {}),
  maxMedia: maxMedia ?? data?.maxMedia ?? 0,
})

// The references renderReport reads before it parses the quality evidence.
export const reportRefs = (data) => [
  data.testPlanRef, data.qualityEvidenceRef, data.reviewRef, data.changeLogRef,
  ...(Array.isArray(data.criteria) ? data.criteria.map((item) => item?.evidence) : []),
].filter(isRepositoryRef)

// Addendum of the DISTILL and DELIVER specialist dispatches, first pass and rework alike.
export const reportingAddendum = ({ phase, trackingPrefix, date, story, maxMedia, forecastData, handoffNotes }) => {
  if (phase === 'DISTILL') {
    return {
      title: 'Reporting (qa-reporting)',
      body: [
        '- Load the `qa-reporting` skill for the forecast handoff (Step 8).',
        `- Write the forecast data exactly at \`${trackingPrefix}${reportDataPath('forecast', date)}\`, with \`"story": "${story}"\`; leave \`reviewRef\` out.`,
        `- Media policy: at most ${maxMedia} embedded media.`,
        '- End your answer with the repository-root-relative paths of the outer acceptance test(s) and of their RED evidence: the engineer receives your answer verbatim.',
      ].join('\n'),
    }
  }
  if (phase === 'DELIVER') {
    return {
      title: 'Reporting (qa-reporting)',
      body: [
        '- Load the `qa-reporting` skill for the outcome handoff.',
        `- Write the outcome data exactly at \`${trackingPrefix}${reportDataPath('outcome', date)}\`, with \`"story": "${story}"\`; leave \`reviewRef\` out.`,
        `- Approved forecast data: ${forecastData ? `\`${trackingPrefix}${forecastData}\`` : 'none'}.`,
        `- Acceptance tests and RED evidence, as the acceptance designer returned them: ${handoffNotes ? `\`${trackingPrefix}${handoffNotes}\`` : 'none'}.`,
        `- Media policy: at most ${maxMedia} embedded media.`,
      ].join('\n'),
    }
  }
  return null
}

// The chat line of a report: local path and honest receipt statuses.
export const chatSummary = ({ kind, story, markdownPath, results }) => [
  `${kind} report for ${story}: ${markdownPath}`,
  ...results.map(({ destination, status, url, reason }) => `  ${destination}: ${status}${url ? ` ${url}` : ''}${reason ? ` — ${reason}` : ''}`),
].join('\n')
