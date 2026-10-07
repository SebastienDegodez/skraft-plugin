// Pure: the lenses a phase review runs when the review is code (RunReview), and what
// each lens reads. This is the table software-engineer-reviewer.md "Phase 2: FAN-OUT"
// carried in prose, now declared where the pipeline runs it.
//
// A lens reads only the inputs listed here, by kind:
//   qgVerify     reviews/{date}/qg-verify-{story}.json — the in-process evidence check
//   commits      reviews/{date}/commits-{story}.txt    — full messages of the covered commits
//   patch        reviews/{date}/diff-{story}.patch     — git diff {base}..HEAD
//   files        reviews/{date}/files-{story}.txt      — git diff --name-status {base}..HEAD
//   evidenceLog  evidence/{date}/{story}/qg-{story}.json
//   changeLog    changes/{date}/change-log.md (the execution journal)
//   testPlan     details/{date}/test-plan-{story}.md
//   feature      features/*.feature (every one recorded)
//   contracts    details/{date}/contracts-{story}.md
//   adrIndex     docs/adr/decisions-index.md (repository file)
// cold-reader reads the patch and file list only: no producer context reaches it.

export const REVIEW_MODES = Object.freeze(['agent', 'code'])

// The review mode a host asks for; anything but "code" keeps the reviewer agent.
export const reviewModeOf = (value) => (String(value ?? '').trim().toLowerCase() === 'code' ? 'code' : 'agent')

const lens = (name, inputs, trigger = null) => Object.freeze({ name, agent: `${name}-lens`, inputs: Object.freeze(inputs), trigger })

// A conditional lens runs when its trigger matches the review: the changed paths, or a line
// the patch adds. Over-triggering costs one read-only lens; missing one misses its defects.
const MOCK_TRIGGER = Object.freeze({
  path: /(^|\/)[^/]*(mock|stub|fake)[^/]*$/i,
  added: /\b(WireMock\w*|MockServer|Microcks\w*|Mountebank|HttpMessageHandler|nock|msw)\b/i,
})
const CONTRACT_TRIGGER = Object.freeze({
  path: /(^|\/)[^/]*contract[^/]*$|\.apiexamples$|\.apimetadata$|(^|\/)openapi[^/]*\.(ya?ml|json)$/i,
  added: /\bVerifyAsync\b|\bPact\b|\bProviderVerifier\b|\bContractTest/,
})

const LENSES = Object.freeze({
  DELIVER: Object.freeze([
    lens('quality-gates', ['qgVerify', 'commits', 'evidenceLog', 'patch', 'files', 'changeLog', 'testPlan']),
    lens('architecture-boundaries', ['patch', 'files', 'contracts', 'adrIndex']),
    lens('test-integrity', ['patch', 'files', 'testPlan', 'feature', 'changeLog']),
    lens('cold-reader', ['patch', 'files']),
    lens('mock-fidelity', ['patch', 'files'], MOCK_TRIGGER),
    lens('contract-fidelity', ['patch', 'files'], CONTRACT_TRIGGER),
  ]),
})

// True when the phase has a review the code can run.
export const hasCodeReview = (phase) => Object.hasOwn(LENSES, phase)

// Paths out of `git diff --name-status` lines ("M\tsrc/a.cs", "R100\told\tnew").
export const changedPaths = (nameStatus) => String(nameStatus ?? '')
  .split('\n')
  .map((line) => line.split('\t').slice(1))
  .flat()
  .filter(Boolean)

const addedLines = (patch) => String(patch ?? '')
  .split('\n')
  .filter((line) => line.startsWith('+') && !line.startsWith('+++'))

const triggers = (trigger, paths, added) =>
  paths.some((path) => trigger.path.test(path)) || added.some((line) => trigger.added.test(line))

// The lenses this review runs, in table order: every core lens, and each conditional lens
// whose trigger fires on the changed paths or the added lines.
export const planLenses = ({ phase, nameStatus = '', patch = '' }) => {
  const paths = changedPaths(nameStatus)
  const added = addedLines(patch)
  return (LENSES[phase] ?? []).filter(({ trigger }) => !trigger || triggers(trigger, paths, added))
}

// Where RunReview writes what the lenses read, beside the review it renders.
export const reviewInputPaths = ({ date, story }) => Object.freeze({
  qgVerify: `reviews/${date}/qg-verify-${story}.json`,
  commits: `reviews/${date}/commits-${story}.txt`,
  patch: `reviews/${date}/diff-${story}.patch`,
  files: `reviews/${date}/files-${story}.txt`,
})

// The story key of the DELIVER evidence log (evidence/{date}/{story}/qg-{story}.json).
export const storyOfEvidenceLog = (path) => String(path ?? '').match(/(?:^|\/)qg-([^/]+)\.json$/)?.[1] ?? 'story'

const lastMatching = (paths, re) => paths.filter((path) => re.test(path)).sort().at(-1) ?? null

// The recorded artefacts a lens may read, from every phase's recorded paths
// (tracking-relative). The latest by path wins when several were recorded.
export const recordedLensInputs = (phaseArtifacts = {}) => {
  const paths = Object.values(phaseArtifacts ?? {}).flat().filter((path) => typeof path === 'string')
  return Object.freeze({
    evidenceLog: lastMatching(paths, /(^|\/)qg-[^/]+\.json$/),
    changeLog: lastMatching(paths, /(^|\/)change-log\.md$/),
    testPlan: lastMatching(paths, /(^|\/)test-plan-[^/]+\.md$/),
    contracts: lastMatching(paths, /(^|\/)contracts-[^/]+\.md$/),
    feature: [...new Set(paths.filter((path) => /\.feature$/.test(path)))].sort(),
  })
}
