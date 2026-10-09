// Pure: the prompt a review lens receives when the review is code. It names the files the
// lens reads — and only those — and the one document it must answer with. The words are
// the dispatch instruction of software-engineer-reviewer.md "Phase 2", sent the same way
// by every host.

const INPUT_LABELS = Object.freeze({
  qgVerify: 'qg-verify result ({ verdict, findings }) of the evidence log',
  commits: 'Full messages of the covered commits',
  evidenceLog: 'Quality-gates evidence log',
  patch: 'Patch since the DELIVER base (read it; open a whole file only when the patch lacks the context a finding needs)',
  files: 'Changed-file list (git diff --name-status)',
  changeLog: 'Execution journal (change log)',
  testPlan: 'Test plan',
  feature: 'Feature file',
  contracts: 'Contracts',
  adrIndex: 'ADR index',
  outcomeData: 'Outcome data (load the qa-reporting skill before checking it)',
  forecastData: 'Approved forecast data (load the qa-reporting skill before checking it)',
})

const storyLine = (story) => {
  if (!story || (!story.issue && !story.title)) return 'none'
  return [story.issue ? `#${story.issue}` : null, story.title ?? null].filter(Boolean).join(' — ')
}

// inputs — [{ kind, path }] repository-relative, in the lens's order; a kind with no file
// on record is listed as absent so the lens reports it instead of searching for it.
// retry — the reason the previous answer was refused, on the one retry.
// A blind lens (cold-reader) gets no story, scope or phase: nothing of the producer's intent.
export const composeLensBrief = ({ lens, phase, slug, story, inputs, retry = null }) => {
  const lines = [
    lens.blind ? `## Skraft review lens — ${lens.name}` : `## Skraft review lens — ${lens.name} (${phase})`,
    ...(lens.blind ? [] : [`- Story: ${storyLine(story)}`, `- Feature scope: ${slug}`]),
    '- Read only these inputs; do not explore the repository for others:',
    ...inputs.map(({ kind, path }) => `  - ${INPUT_LABELS[kind] ?? kind}: ${path ? `\`${path}\`` : 'absent — none was recorded'}`),
    '- Write no file. Dispatch no agent.',
    '',
    '## Answer',
    'Return your analysis as a YAML document with keys: lens, verdict, defects. Quote every free-text value.',
    `Answer with that document alone, in one \`\`\`yaml fenced block; \`lens\` is exactly \`${lens.name}\`.`,
  ]
  if (retry) lines.push('', '## Previous answer refused', `${retry}. Answer again with the document only.`)
  return lines.join('\n')
}
