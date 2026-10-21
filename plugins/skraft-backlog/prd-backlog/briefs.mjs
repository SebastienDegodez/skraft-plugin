// The prompts the workflow gives its agents. Each names the files the agent reads and the one file
// it writes, the attempt, and what the previous attempt got wrong; nothing else.

const languageOf = (language) => (language === 'fr' ? 'French' : 'English')

/** The rule every brief carries: what a human reads is written in the PRD's language. @param {'fr' | 'en'} language */
export const languageRule = (language) => `Write every text a human reads in ${languageOf(language)}, the language of the PRD, even though the skills are in English; `
  + 'never translate ids, YAML or JSON keys, gate names, severities or verdicts.'

const lines = (items) => items.filter((item) => item !== null && item !== undefined && item !== false).join('\n')
const bullets = (items) => items.map((item) => `- ${item}`).join('\n')

/**
 * @param {{ prd: string, inventory: string, output: string, language: 'fr' | 'en', attempt: number, problems: string[] }} brief
 */
export const sliceBrief = ({ prd, inventory, output, language, attempt, problems }) => lines([
  `Slice the PRD into epics and stories (attempt ${attempt}).`,
  'Load the skill `backlog-slicing` and follow it; it loads `sprint-planning` and `issue-refinement`.',
  '',
  'Read:',
  bullets([`PRD: ${prd}`, `Requirement inventory (every id you must place): ${inventory}`]),
  '',
  `Write only: ${output} — a story map following the schema of the skill.`,
  `Write every title, outcome, description, reason and decision in ${languageOf(language)}, the language of the PRD.`,
  languageRule(language),
  problems.length ? '' : null,
  problems.length ? `The previous story map at ${output} was refused. Fix exactly these problems, keep everything else and every id:` : null,
  problems.length ? bullets(problems) : null,
  '',
  'Answer with one line: the number of epics and stories written.',
])

/**
 * @param {{ prd: string, map: string, story: string, epic: string, output: string, language: 'fr' | 'en',
 *   attempt: number, problems: string[], findings: string[], answers?: string[] }} brief
 * answers: the product owner's answers to open questions of the story, as "Q1: question → answer"
 */
export const storyBrief = ({ prd, map, story, epic, output, language, attempt, problems, findings, answers = [] }) => lines([
  `Write story ${story} of epic ${epic} (attempt ${attempt}).`,
  'Load the skill `story-elaboration` and follow it; it loads `issue-refinement` for the story rules.',
  '',
  'Read:',
  bullets([`PRD: ${prd}`, `Approved story map (the entry of ${story} fixes its scope, covers and after): ${map}`]),
  '',
  `Write only: ${output} — a story file following the schema of the skill. Its directory exists; write no other file, no test or probe file.`,
  'The workflow writes `id`, `epic`, `milestone`, `moscow`, `covers` and `after` from the map; you write the content.',
  `Each entry of \`dependencies\` reads exactly ${DEPENDENCY_EXAMPLE}, one per story of the map's \`after\`.`,
  `Write the story in ${languageOf(language)}, the language of the PRD; keep every id as written.`,
  languageRule(language),
  problems.length ? '' : null,
  problems.length ? `The checks refused ${output}. Fix exactly these problems:` : null,
  problems.length ? bullets(problems) : null,
  findings.length ? '' : null,
  findings.length ? 'Apply each of these corrections and review findings to this story:' : null,
  findings.length ? bullets(findings) : null,
  answers.length ? '' : null,
  answers.length ? 'The product owner answered these open questions. Fold each answer into the story; keep the question with its id:' : null,
  answers.length ? bullets(answers) : null,
  '',
  `Answer with one line: ${story} written, its effort in points.`,
])

/** The exact shape of a dependency entry: the field is `story`, never `id`. */
export const DEPENDENCY_EXAMPLE = '{ "story": "EP-001-S01", "reason": "what this story needs from it" }'

/** Which inputs each planning lens may see (planning-review-criteria, discuss phase). */
export const LENSES = Object.freeze([
  { agent: 'planning-invest-lens', name: 'planning-invest', inputs: (stories, drafts) => [`Stories file: ${stories}`] },
  { agent: 'planning-ac-quality-lens', name: 'planning-ac-quality', inputs: (stories, drafts) => drafts.map((d) => `Acceptance-criteria draft: ${d}`) },
  { agent: 'planning-coherence-lens', name: 'planning-coherence', inputs: (stories, drafts) => [`Sprint plan: the section with the \`depends_on\` table of ${stories}`, ...drafts.map((d) => `Acceptance-criteria draft (sizing only): ${d}`)] },
  { agent: 'planning-dor-lens', name: 'planning-dor', inputs: (stories, drafts) => [`Stories file: ${stories}`, ...drafts.map((d) => `Acceptance-criteria draft: ${d}`)] },
])

/**
 * @param {{ lens: typeof LENSES[number], epic: string, stories: string, drafts: string[], attempt: number, judge?: string[],
 *   language?: 'fr' | 'en' }} brief judge: the stories still under review when the others of the epic already passed
 */
export const lensBrief = ({ lens, epic, stories, drafts, attempt, judge = [], language = 'en' }) => lines([
  `Review the stories of epic ${epic} in a discuss review (attempt ${attempt}).`,
  judge.length ? `Judge only ${judge.join(', ')}; the other stories of the file passed and are context.` : null,
  '',
  'Your inputs, and no other file:',
  bullets(lens.inputs(stories, drafts)),
  '',
  'Name each story by its id in `story`; a defect about a dependency names the story it relies on by its id.',
  `Write \`description\`, \`location\` and \`suggestion\` in ${languageOf(language)}, the language of the PRD and of the stories.`,
  languageRule(language),
  'Return only the YAML document of your Output section.',
])

/**
 * The brief of a split the human accepted: the slicer names the parts, the workflow changes the map.
 * @param {{ prd: string, map: string, story: string, output: string, language: 'fr' | 'en', attempt: number, problems: string[],
 *   option: { title: string, impact: { parts: { title: string, points: number }[] } }, comment?: string }} brief
 */
export const splitBrief = ({ prd, map, story, output, language, attempt, problems, option, comment }) => lines([
  `Split story ${story} as the product owner accepted (attempt ${attempt}): ${option.title}.`,
  'Load the skill `backlog-slicing` and follow its story rules; load `issue-refinement` for the splitting pattern.',
  '',
  'Read:',
  bullets([`PRD: ${prd}`, `Approved story map (the entry of ${story}): ${map}`]),
  '',
  `Write only: ${output} — { "stories": [ { "title", "persona", "description", "covers": [ids], "effort": 1 | 2 | 3 } ] }, exactly ${option.impact.parts.length} stories in build order:`,
  bullets(option.impact.parts.map((p) => `${p.title} (≈ ${p.points} points)`)),
  `Share the covers of ${story} between them: each covers at least one of its ids, together all of them, none other.`,
  'Each part is the smallest slice that still delivers a value a user can check end to end: never a task, never a single criterion of another part.',
  comment ? `The product owner adds: ${comment}` : null,
  languageRule(language),
  problems.length ? '' : null,
  problems.length ? `The previous file at ${output} was refused. Fix exactly these problems:` : null,
  problems.length ? bullets(problems) : null,
  '',
  'Answer with one line: the number of stories written.',
])
