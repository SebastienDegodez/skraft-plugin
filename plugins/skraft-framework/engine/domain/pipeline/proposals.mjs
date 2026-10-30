/**
 * The proposal an agent marked proposal=true writes for one file of surviving mutants: the
 * engine creates it with a section per mutant, each holding an outcome placeholder the agent
 * replaces with one of the three ways a survivor ends (a test that kills it, the code deleted,
 * the mutant marked equivalent). A placeholder left means the proposal is not written yet.
 *
 * @typedef {import('../gates/mutation-report.mjs').SurvivorGroup} SurvivorGroup
 */

/** Where the proposals of the run are kept, relative to the tracking folder. */
const PROPOSALS = 'proposals'

/**
 * The proposal of one file of survivors, relative to the tracking folder; a node reached without
 * survivors by file writes one proposal for its visit.
 * @param {{ node: string, visit: number, group: number | null }} step
 */
export const proposalPath = ({ node, visit, group }) => `${PROPOSALS}/${node}-${visit}${group === null ? '' : `-g${group}`}.md`

const OUTCOME = '{{outcome}}'

const HOW = [
  'For each surviving mutant, replace its outcome line with one of:',
  '- `test: <the test that kills it: its file, its input, what it asserts>`',
  '- `delete: <the code no behaviour asks for: its file and lines>`',
  '- `equivalent: <why no test can tell the mutant from the code>`',
]

/**
 * The proposal as the engine creates it.
 * @param {{ group: number | null, groups: SurvivorGroup[] }} step
 */
export const proposalTemplate = ({ group, groups }) => {
  const survivors = group === null ? null : groups[group - 1]
  const title = survivors === null ? '# Mutation proposal' : `# Mutation proposal: ${survivors.file} (group ${group} of ${groups.length})`
  const mutants = survivors === null ? ['The surviving mutants your brief names'] : survivors.mutants
  return [title, '', ...HOW, ...mutants.flatMap((mutant) => ['', `## ${mutant}`, '', OUTCOME]), ''].join('\n')
}
