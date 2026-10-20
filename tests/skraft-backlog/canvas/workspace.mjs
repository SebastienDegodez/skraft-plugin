// A workspace as the skraft-prd-backlog workflow leaves it at its handoff pause, for the canvas
// tests: the eligibility PRD's inventory, story map, story files, the latest lens review of each
// epic and plan.json. One story of each kind the reviewer meets:
//   EP-001-S01  ready
//   EP-001-S02  refused by the checks (vague persona, 2 examples, a technical criterion)
//   EP-001-S03  ready, with a low lens finding (Generic Data)
//   EP-002-S01  held back by the planning review (DoR 7, not Testable)
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { planOperations } from '../../../plugins/skraft-backlog/prd-backlog/handoff.mjs'
import { inventoryOf } from '../../../plugins/skraft-backlog/prd-backlog/prd-inventory.mjs'
import { storyFile, storyMap } from '../prd-backlog/fixtures/backlog-data.mjs'

export const SLUG = 'eligibilite-prd'
export const REPO = 'acme/permis'
const PRD = fileURLToPath(new URL('../prd-backlog/fixtures/eligibilite-prd.md', import.meta.url))

/** @param {string} path @param {unknown} value */
export const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

/** The review file review-verdict.mjs writes, reduced to what the canvas reads. */
const review = (verdict, findings) => ({
  verdict,
  phase: 'discuss',
  lenses: Object.fromEntries(['planning-invest', 'planning-ac-quality', 'planning-coherence', 'planning-dor'].map((lens) => {
    const own = findings.filter((f) => f.lens === lens).map(({ lens: _, ...f }) => f)
    return [lens, { status: own.length ? 'fail' : 'pass', findings: own }]
  })),
})

/**
 * @param {string} cwd the workspace root
 * @param {{ plan?: boolean }} [options] plan: false stops before the handoff
 */
export const makeWorkspace = async (cwd, { plan = true } = {}) => {
  const dir = join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'backlog')
  const inventory = inventoryOf(await readFile(PRD, 'utf8'))
  const map = storyMap()
  await writeJson(join(dir, 'inventory.json'), inventory)
  await writeJson(join(dir, 'story-map.json'), map)
  const files = new Map(map.epics.flatMap((epic) => epic.stories.map((story) => [story.id, storyFile({ ...story, epic: epic.id })])))
  const refused = files.get('EP-001-S02')
  refused.persona = 'utilisateur'
  refused.examples = refused.examples.slice(0, 2)
  refused.acceptanceCriteria[2].example = 'EX-2'
  refused.acceptanceCriteria[1].then = ['le service renvoie HTTP 403 au portail']
  for (const [id, file] of files) await writeJson(join(dir, 'stories', `${id}.json`), file)
  await writeJson(join(dir, 'reviews', 'EP-001', 'discuss-review-1.json'), review('NEEDS_REWORK', [
    { lens: 'planning-dor', gate: 'G7', severity: 'high', story: 'EP-001-S02', description: 'DoR item 2: the persona "utilisateur" names no role', suggestion: 'Name the driver under 18.' },
  ]))
  await writeJson(join(dir, 'reviews', 'EP-001', 'discuss-review-2.json'), review('APPROVED', [
    { lens: 'planning-dor', gate: 'G8', severity: 'low', story: 'EP-001-S03', description: 'Generic Data: EX-2 gives an age but no date of birth', suggestion: 'Give the date of birth of Karim Benali.' },
  ]))
  await writeJson(join(dir, 'reviews', 'EP-002', 'discuss-review-1.json'), review('REJECTED', [
    { lens: 'planning-dor', gate: 'G7', severity: 'blocker', story: 'EP-002-S01', description: 'DoR item 7: technical notes do not name the licence registry the check calls', suggestion: 'Name the registry and its answer time.' },
    { lens: 'planning-invest', gate: 'G1', severity: 'medium', story: 'EP-002-S01', description: 'Not Testable: "le permis déposé est vérifié" has no observable outcome', suggestion: 'Say what the driver sees when the licence is refused.' },
    { lens: 'planning-invest', gate: 'G1', severity: 'low', story: 'EP-002-S01', description: 'The upload limit is unstated', suggestion: 'Quote the size limit of the PRD.' },
  ]))
  if (!plan) return { cwd, dir, slug: SLUG, map, files }
  const notReady = new Map([
    ['EP-001-S02', ['DoR 2: persona "utilisateur" names no role (Vague Persona)']],
    ['EP-002-S01', ['DoR item 7: technical notes do not name the licence registry the check calls']],
  ])
  const ready = new Set(['EP-001-S01', 'EP-001-S03'])
  const operations = planOperations({ slug: SLUG, prd: 'docs/eligibilite-prd.md', repo: REPO, language: 'fr', prdUrl: `https://github.com/${REPO}/blob/main/docs/eligibilite-prd.md`, map, files, ready, notReady })
  await writeJson(join(dir, 'plan.json'), { ...operations, repo: REPO, notReady: Object.fromEntries(notReady) })
  const handoff = join(cwd, '.copilot-tracking', 'github-issues', 'prds', SLUG, 'handoff.md')
  await mkdir(dirname(handoff), { recursive: true })
  await writeFile(handoff, `# Handoff - ${SLUG}\n\n* **Project**: ${REPO}\n\n> - [ ] Reviewed and validated by a qualified human reviewer\n`, 'utf8')
  return { cwd, dir, slug: SLUG, map, files }
}
