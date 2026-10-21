// Assisted corrections. For each finding that blocks a story (an INVEST letter, a DoR item, an
// antipattern, a lens finding, a dependency the map lacks, an open question), a deterministic
// catalogue drawn from the skills offers 2 to 4 options, each with what it changes, its
// consequences for and against, and its source. A human accepts or refuses; nothing changes a
// story without an accepted decision. The correction session of the workflow applies the
// accepted ones (`args.corrections`) and reviews only the stories they touched.
//
// Size is judged on two axes (issue-refinement, Small): time — one day at most for one developer
// assisted by AI (3 points) — and scope — one journey, one external integration, 3 to 5
// criteria. A split is never allowed to make a story too small: each part keeps a value a user
// can check (a vertical slice of at least half a day), else the option groups into fewer parts.
import { placesOf } from './canvas/assess.mjs'
import { EFFORT_SCALE, MAX_SMALL_POINTS, pointsFor, storiesOf } from './story-map.mjs'
import { INTEGRATIONS, MAX_CRITERIA, MIN_CRITERIA, checkStory, integrationsOf, openQuestionsOf } from './story.mjs'

/** A vertical slice — one journey through every layer, tested end to end — takes half a day at least. */
export const SLICE_FLOOR_HOURS = 4

/**
 * @typedef {'fr' | 'en'} Language
 * @typedef {{ fr: string, en: string }} Words
 * @typedef {{ kind: string, structural: boolean, source: string, title: Words, description: Words, plus: Words[], minus: Words[] }} Pattern
 * @typedef {{ title: string, points: number }} Part
 * @typedef {{ creates: number, modifies: string[], removes: string[], parts: Part[], points: number, floor: boolean, ceiling: boolean, note?: string }} Impact
 * @typedef {{ id: string, kind: string, structural: boolean, title: string, description: string, plus: string[], minus: string[],
 *   impact: Impact, source: string, axis?: string, values?: string[], target?: string, add?: string[], instruction: string }} Option
 * @typedef {{ id: string, source: 'check' | 'lens' | 'map' | 'slice' | 'question', rule?: string, lens?: string, gate?: string,
 *   severity?: string, letters: string[], dor: string[], message: string, options: Option[] }} CorrectionFinding
 * @typedef {{ status: 'accepted' | 'refused' | 'applied' | 'failed', story: string, finding: string, option: Option, at: string,
 *   comment?: string, appliedAt?: string, error?: string }} Decision
 * @typedef {{ status: 'running' | 'done' | 'failed', startedAt: string, endedAt?: string, applied: string[], failed: Record<string, string>,
 *   touched: string[], verdicts: Record<string, string> }} Session
 * @typedef {{ version: 1, decisions: Record<string, Decision>, session: Session | null }} Corrections
 */

const w = (fr, en) => Object.freeze({ fr, en })

/** The catalogue. Each pattern cites the skill (and reference) it comes from, or says it is outside them. */
export const CATALOGUE = Object.freeze({
  'split-interface': {
    kind: 'split-interface', structural: true, source: 'issue-refinement › splitting-patterns, Pattern 4: By Interface',
    title: w('Découper par interface (une story par canal)', 'Split by interface (one story per channel)'),
    description: w('Chaque canal ou intégration externe devient une story complète, de bout en bout.', 'Each channel or external integration becomes a complete, end-to-end story.'),
    plus: [w('Chaque story intègre un seul système : livrable en une journée, testable seule.', 'Each story integrates one system: deliverable in a day, testable alone.'),
      w('Le premier canal sert de tracer bullet ; les suivants réutilisent son socle.', 'The first channel is the tracer bullet; the next ones reuse its base.')],
    minus: [w('Le socle commun est construit dans la première story : les suivantes l’attendent.', 'The shared base is built in the first story: the next ones wait on it.'),
      w('Plus d’issues à suivre.', 'More issues to track.')],
  },
  'split-workflow': {
    kind: 'split-workflow', structural: true, source: 'issue-refinement › splitting-patterns, Pattern 1: By Workflow Step',
    title: w('Découper par étape du parcours', 'Split by workflow step'),
    description: w('Chaque étape du parcours (une exigence du PRD) devient une story qui livre cette étape.', 'Each step of the journey (one PRD requirement) becomes a story that delivers that step.'),
    plus: [w('Une story = une exigence : traçabilité directe vers le PRD.', 'One story = one requirement: direct traceability to the PRD.'),
      w('Les étapes se livrent et se démontrent dans l’ordre.', 'Steps ship and demo in order.')],
    minus: [w('Les étapes s’enchaînent : l’ordre de livraison est contraint.', 'Steps chain: the delivery order is constrained.'),
      w('Une étape seule peut ne pas suffire à l’utilisateur.', 'One step alone may not be enough for the user.')],
  },
  'split-happy-path': {
    kind: 'split-happy-path', structural: true, source: 'issue-refinement › Story Splitting Patterns, 6. By Happy/Sad Path',
    title: w('Séparer le chemin nominal des cas d’erreur', 'Separate the happy path from the error cases'),
    description: w('Le parcours qui réussit d’abord, puis une story pour les refus et erreurs.', 'The journey that succeeds first, then one story for refusals and errors.'),
    plus: [w('La valeur principale est livrée vite.', 'The main value ships fast.')],
    minus: [w('Les erreurs qui touchent le parcours doivent suivre dans le même jalon.', 'Errors that affect the journey must follow in the same milestone.')],
  },
  'split-business-rule': {
    kind: 'split-business-rule', structural: true, source: 'issue-refinement › splitting-patterns, Pattern 2: By Business Rule',
    title: w('Découper par règle métier', 'Split by business rule'),
    description: w('Les critères sont regroupés par règle métier, une story par groupe.', 'Criteria are grouped by business rule, one story per group.'),
    plus: [w('Chaque règle se valide avec le métier séparément.', 'Each rule is validated with the business on its own.')],
    minus: [w('Risque de stories trop petites : les règles sont regroupées pour garder une demi-journée par story.', 'Risk of stories too small: rules are grouped to keep half a day per story.')],
  },
  'defer-nfr': {
    kind: 'defer-nfr', structural: true, source: 'hors skill (découpe classique : différer la qualité non fonctionnelle)',
    title: w('Livrer le fonctionnel, puis la qualité non fonctionnelle', 'Ship the behaviour, then the non-functional quality'),
    description: w('Le comportement d’abord ; les seuils de performance, de sécurité ou de disponibilité dans une story suivante.', 'Behaviour first; performance, security or availability thresholds in a following story.'),
    plus: [w('Le comportement est démontrable plus tôt.', 'The behaviour can be demonstrated earlier.')],
    minus: [w('La première story n’est pas encore prête pour la production.', 'The first story is not production-ready yet.')],
  },
  spike: {
    kind: 'spike', structural: true, source: 'issue-refinement › Estimable (« add a spike story first »)',
    title: w('Explorer d’abord (spike limité dans le temps)', 'Explore first (time-boxed spike)'),
    description: w('Une story d’exploration lève les inconnues avant la story.', 'An exploration story removes the unknowns before the story.'),
    plus: [w('L’estimation devient fiable.', 'The estimate becomes reliable.')],
    minus: [w('Une story de plus, sans valeur directe pour l’utilisateur.', 'One more story, with no direct value for the user.')],
  },
  merge: {
    kind: 'merge', structural: true, source: 'issue-refinement › splitting-patterns, Pattern 7: Merge stories too small (Cohn: combine)',
    title: w('Fusionner avec une story voisine', 'Merge with a neighbouring story'),
    description: w('La story rejoint sa voisine, qui garde son id et couvre les deux.', 'The story joins its neighbour, which keeps its id and covers both.'),
    plus: [w('Une tranche qui porte enfin une valeur vérifiable seule.', 'One slice that carries a value checkable on its own.'),
      w('Une dépendance et une issue de moins.', 'One dependency and one issue fewer.')],
    minus: [w('La story fusionnée grossit : elle peut dépasser une journée.', 'The merged story grows: it may exceed one day.')],
  },
  'declare-dependency': {
    kind: 'declare-dependency', structural: true, source: 'backlog-slicing › Dependencies (after) ; invest-checklist › I',
    title: w('Déclarer la dépendance dans la carte', 'Declare the dependency in the map'),
    description: w('La story attend explicitement celle dont elle consomme le résultat.', 'The story explicitly waits on the one whose output it consumes.'),
    plus: [w('L’ordre est explicite : Indépendante (I) est satisfaite.', 'The order is explicit: Independent (I) passes.')],
    minus: [w('La story ne peut plus démarrer avant l’autre.', 'The story can no longer start before the other.')],
  },
  'remove-dependency': {
    kind: 'remove-dependency', structural: false, source: 'issue-refinement › Independent (« split to make the story self-contained »)',
    title: w('Rendre la story autonome', 'Make the story self-contained'),
    description: w('La story est réécrite pour ne plus consommer ce que l’autre produit.', 'The story is rewritten so it no longer consumes what the other produces.'),
    plus: [w('Livrable dans n’importe quel ordre.', 'Deliverable in any order.')],
    minus: [w('Peut dupliquer une partie du travail de l’autre story.', 'May duplicate part of the other story’s work.')],
  },
  'reframe-value': {
    kind: 'reframe-value', structural: false, source: 'issue-refinement › Valuable, Negotiable ; antipatterns Implement-X, Vague Persona',
    title: w('Reformuler la valeur pour l’utilisateur', 'Reframe the value for the user'),
    description: w('L’énoncé dit le besoin observable d’une persona précise, pas la solution.', 'The statement says the observable need of a precise persona, not the solution.'),
    plus: [w('La revue et le métier jugent la même chose.', 'The review and the business judge the same thing.')],
    minus: [w('La portée réelle ne change pas : si elle est trop grosse, il faudra découper.', 'The real scope does not change: if too big, it still needs a split.')],
  },
  'clarify-ac': {
    kind: 'clarify-ac', structural: false, source: 'issue-refinement › Testable ; planning-review-criteria › AC quality',
    title: w('Clarifier les critères d’acceptation', 'Clarify the acceptance criteria'),
    description: w('Chaque critère dit un résultat observable, dérivé d’un exemple, sans détail technique.', 'Each criterion states an observable outcome, derived from an example, with no technical detail.'),
    plus: [w('Le métier peut vérifier la story seul.', 'The business can check the story alone.')],
    minus: [w('Réécriture ciblée : le reste de la fiche ne change pas.', 'Targeted rewrite: the rest of the file does not change.')],
  },
  'regroup-criteria': {
    kind: 'regroup-criteria', structural: false, source: 'issue-refinement › 5. By Acceptance Criteria (« don’t split ACs that together define a single coherent behaviour »)',
    title: w('Regrouper les critères (3 à 5)', 'Regroup the criteria (3 to 5)'),
    description: w('La story est petite mais ses critères sont trop fins : ils sont regroupés sans rien perdre de ce qu’ils couvrent.', 'The story is small but its criteria are too fine-grained: they are regrouped without losing anything they cover.'),
    plus: [w('Pas de story trop petite créée.', 'No story too small is created.')],
    minus: [w('Des critères plus larges, un peu moins précis à tester.', 'Wider criteria, a little less precise to test.')],
  },
  'add-examples': {
    kind: 'add-examples', structural: false, source: 'issue-refinement › antipatterns No Examples, Generic Data',
    title: w('Ajouter des exemples avec des données réelles', 'Add examples with real data'),
    description: w('Au moins trois exemples aux valeurs concrètes, dont un refus ; les critères en dérivent.', 'At least three examples with concrete values, one a refusal; the criteria derive from them.'),
    plus: [w('Les critères deviennent vérifiables.', 'The criteria become checkable.')],
    minus: [w('Demande les valeurs du PRD ; sinon une question ouverte.', 'Needs the PRD’s values; otherwise an open question.')],
  },
  'answer-questions': {
    kind: 'answer-questions', structural: false, source: 'story-elaboration › openQuestions',
    title: w('Répondre aux questions ouvertes', 'Answer the open questions'),
    description: w('Vos réponses sont données au rédacteur, qui les intègre à la story.', 'Your answers go to the writer, who folds them into the story.'),
    plus: [w('Rien n’est deviné : la story devient estimable.', 'Nothing is guessed: the story becomes estimable.')],
    minus: [w('Demande une décision produit maintenant.', 'Needs a product decision now.')],
  },
  rewrite: {
    kind: 'rewrite', structural: false, source: 'planning-review-criteria (suggestion de la lentille)',
    title: w('Corriger selon le constat de la revue', 'Fix as the review finding suggests'),
    description: w('Le rédacteur corrige exactement ce que la lentille signale.', 'The writer fixes exactly what the lens reports.'),
    plus: [w('Correction minimale, ciblée.', 'Minimal, targeted fix.')],
    minus: [w('Suit la suggestion de la lentille, sans autre arbitrage.', 'Follows the lens suggestion, with no other trade-off.')],
  },
  custom: {
    kind: 'custom', structural: false, source: 'hors skill',
    title: w('Ma propre correction', 'My own correction'),
    description: w('Décrivez la correction dans le commentaire : elle est donnée telle quelle au rédacteur.', 'Describe the correction in the comment: it is given as is to the writer.'),
    plus: [w('Vous décidez exactement ce qui change.', 'You decide exactly what changes.')],
    minus: [w('Aucun garde-fou du catalogue : la revue jugera le résultat.', 'No guard of the catalogue: the review judges the result.')],
  },
})

const SIZE = new Set(['effort-split', 'criteria-too-many', 'integrations-many'])
const SMALL = /too small|trop petite|merge|fusion/i
const MAX_OPTIONS = 4

/**
 * @typedef {{
 *   map: import('./story-map.mjs').StoryMap, files: Map<string, any>, language: Language, known: Set<string>,
 *   reviews: Map<string, { review: any }>, answers?: Record<string, Record<string, { text: string, at: string }>>,
 *   contents?: Map<string, string>,
 * }} CorrectionInput
 */

/**
 * The findings of every story that a human can correct, each with its options.
 * @param {CorrectionInput} input
 * @returns {Array<{ id: string, epic: string, findings: CorrectionFinding[] }>}
 */
export const proposeCorrections = (input) => input.map.epics.flatMap((epic) => epic.stories.map((planned) => {
  const context = contextOf(input, epic, planned)
  const findings = findingsOf(context).map((finding) => ({ ...finding, options: optionsFor(context, finding) })).filter((f) => f.options.length)
  return { id: planned.id, epic: epic.id, findings }
})).filter((story) => story.findings.length)

/**
 * @typedef {{ input: CorrectionInput, epic: import('./story-map.mjs').MapEpic, planned: import('./story-map.mjs').MapStory & { epic: string },
 *   file: any, language: Language }} Context
 */

/** @param {CorrectionInput} input @param {import('./story-map.mjs').MapEpic} epic @param {import('./story-map.mjs').MapStory} planned @returns {Context} */
const contextOf = (input, epic, planned) => ({ input, epic, planned: { ...planned, epic: epic.id }, file: input.files.get(planned.id) ?? null, language: input.language })

/**
 * The findings of one story. Every "too big" signal — the checks, and the lenses that judge Small
 * or the size — is one finding: one decision splits the story, whoever saw it.
 * @param {Context} context @returns {Omit<CorrectionFinding, 'options'>[]}
 */
const findingsOf = (context) => {
  const all = [...checkFindings(context), ...mapFindings(context), ...lensFindings(context), ...sliceFindings(context), ...questionFindings(context)]
  const size = all.filter(isSize)
  const rest = all.filter((f) => !isSize(f))
  return size.length ? [sizeFinding(size), ...rest] : rest
}

const SIZE_WORDS = /\b(?:small|petite?|too big|trop gros|giant|géante|points?|effort|estimat|split|découp)/i

/** @param {any} finding */
const isSize = (finding) => SIZE.has(finding.rule) || (finding.source === 'lens' && !SMALL.test(finding.message)
  && (finding.letters.includes('S') || finding.dor.includes('6') || (!finding.letters.length && !finding.dor.length && SIZE_WORDS.test(finding.message))))

/** @param {any[]} findings */
const sizeFinding = (findings) => ({
  id: 'size', source: /** @type {const} */ (findings.some((f) => f.source === 'check') ? 'check' : 'lens'), rule: 'too-big', letters: ['S'], dor: ['6'],
  message: findings.map((f) => f.message).join(' · '), sources: findings.map((f) => f.id),
})

/** @param {Context} context */
const checkFindings = ({ input, planned, file }) => {
  if (!file) return []
  const details = checkStory(file, planned, input.known).details
  return details.filter((d) => SIZE.has(d.rule) || d.rule === 'too-small').map((d) => ({
    id: `check:${d.rule}`, source: /** @type {const} */ ('check'), rule: d.rule, letters: d.rule === 'too-small' ? ['V', 'S'] : ['S'], dor: ['6'], message: d.message,
  }))
}

/** @param {Context} context */
const mapFindings = ({ epic, planned }) => {
  const wider = epic.stories.find((o) => o.id !== planned.id && o.covers.length > planned.covers.length && planned.covers.every((id) => o.covers.includes(id)))
  return wider ? [{ id: 'map:covered-by', source: /** @type {const} */ ('map'), rule: 'covered-by', letters: ['V', 'S'], dor: [],
    message: `${planned.id} covers nothing ${wider.id} does not cover`, neighbour: wider.id }] : []
}

/** @param {Context} context */
const lensFindings = ({ input, epic, planned }) => {
  const review = input.reviews.get(epic.id)?.review
  const judged = review?.judged?.[planned.id]
  const current = input.contents?.get(planned.id)
  if (typeof judged === 'string' && typeof current === 'string' && judged !== current) return []
  return Object.entries(review?.lenses ?? {}).flatMap(([lens, result]) => (Array.isArray(result?.findings) ? result.findings : [])
    .filter((f) => String(f.story ?? '') === planned.id && ['medium', 'high', 'blocker'].includes(String(f.severity).toLowerCase()))
    .map((f) => {
      const places = placesOf(f)
      return { id: `lens:${lens}:${f.gate}:${shortHash(String(f.description ?? ''))}`, source: /** @type {const} */ ('lens'), lens, gate: f.gate,
        severity: String(f.severity).toLowerCase(), letters: places.invest, dor: places.dor, message: String(f.description ?? ''), suggestion: f.suggestion }
    }))
}

/** @param {Context} context */
const sliceFindings = ({ input, epic, planned }) => (input.reviews.get(epic.id)?.review?.slice ?? [])
  .filter((p) => p.story === planned.id)
  .map((p) => ({ id: `slice:${p.add.join('+')}`, source: /** @type {const} */ ('slice'), letters: ['I'], dor: ['8'], message: p.description, add: p.add }))

/** @param {Context} context */
const questionFindings = ({ input, planned, file }) => {
  const open = openQuestionsOf(file?.openQuestions, input.answers?.[planned.id] ?? {}).filter((q) => !q.answer)
  return open.length ? [{ id: 'question:open', source: /** @type {const} */ ('question'), letters: ['E'], dor: ['7'], message: open.map((q) => `${q.id}: ${q.question}`).join(' · ') }] : []
}

/** A short stable hash, so a finding keeps its id from one computation to the next. @param {string} text */
const shortHash = (text) => {
  let hash = 2166136261
  for (const char of text) hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0
  return hash.toString(36)
}

/**
 * 2 to 4 options for a finding: the patterns that fit it, in order, then the human's own.
 * @param {Context} context @param {any} finding @returns {Option[]}
 */
const optionsFor = (context, finding) => {
  const candidates = candidatesFor(context, finding).filter((o) => o !== null)
  const fitting = candidates.filter((o) => o.impact.ceiling)
  const picked = (fitting.length ? fitting : candidates).slice(0, MAX_OPTIONS - 1)
  return picked.length ? [...picked, build(context, finding, 'custom', {})] : []
}

/** @param {Context} context @param {any} finding @returns {Array<Option | null>} */
const candidatesFor = (context, finding) => {
  const letters = new Set(finding.letters)
  if (finding.source === 'slice') return [build(context, finding, 'declare-dependency', { add: finding.add }), build(context, finding, 'remove-dependency', {})]
  if (finding.source === 'question') return [build(context, finding, 'answer-questions', {}), spikeOption(context, finding)]
  if (finding.rule === 'too-small' || finding.rule === 'covered-by' || (letters.has('V') && SMALL.test(finding.message))) {
    return [...mergeOptions(context, finding), build(context, finding, 'reframe-value', {})]
  }
  if (finding.rule === 'too-big' || letters.has('S')) {
    const splits = splitOptions(context, finding)
    return splits.length ? splits : [build(context, finding, 'regroup-criteria', {}), build(context, finding, 'rewrite', {})]
  }
  if (letters.has('I') || finding.dor.includes('8')) return [build(context, finding, 'remove-dependency', {}), build(context, finding, 'rewrite', {})]
  if (letters.has('T') || finding.dor.some((d) => ['4', '5'].includes(d))) return [build(context, finding, 'clarify-ac', {}), build(context, finding, 'add-examples', {})]
  if (finding.dor.includes('3')) return [build(context, finding, 'add-examples', {}), build(context, finding, 'rewrite', {})]
  if (letters.has('V') || letters.has('N') || finding.dor.some((d) => ['1', '2'].includes(d))) return [build(context, finding, 'reframe-value', {}), ...mergeOptions(context, finding).slice(0, 1)]
  if (letters.has('E') || finding.dor.includes('7')) return [build(context, finding, 'rewrite', {}), spikeOption(context, finding)]
  return [build(context, finding, 'rewrite', {})]
}

// ── Splits, checked against the ceiling and the floor ──────────────────────────────────────────

/** The hours a story weighs: its effort on the assisted scale. @param {Context} context */
const hoursOf = ({ file, planned }) => EFFORT_SCALE[file?.effort?.points ?? planned.effort]?.hours ?? EFFORT_SCALE[8].hours

/**
 * Every split the story allows, each sized. A split by interface adds the integration work of
 * each channel: each part is a complete journey of half a day at least. The other axes share the
 * story's work between their parts, grouped until none falls under half a day — fewer, fuller
 * stories rather than one per rule.
 * @param {Context} context @param {any} finding @returns {Array<Option | null>}
 */
const splitOptions = (context, finding) => {
  const { file, planned } = context
  const integrations = file ? integrationsOf(file) : []
  const frs = planned.covers.filter((id) => /^FR-/.test(id))
  const nfrs = planned.covers.filter((id) => /^(NFR|CON)-/.test(id))
  const criteria = Array.isArray(file?.acceptanceCriteria) ? file.acceptanceCriteria.length : 0
  return [
    integrations.length > 1 ? splitOption(context, finding, 'split-interface', integrations, true) : null,
    frs.length > 1 ? splitOption(context, finding, 'split-workflow', frs, false) : null,
    criteria > MIN_CRITERIA ? splitOption(context, finding, 'split-happy-path', [], false, 2) : null,
    frs.length === 1 && criteria > MAX_CRITERIA ? splitOption(context, finding, 'split-business-rule', [], false, Math.ceil(criteria / MIN_CRITERIA)) : null,
    nfrs.length && planned.covers.length > nfrs.length ? splitOption(context, finding, 'defer-nfr', [], false, 2) : null,
  ].filter((o) => o !== null && o.impact.floor)
}

/**
 * @param {Context} context @param {any} finding @param {string} kind @param {string[]} values the parts by name, when the axis names them
 * @param {boolean} vertical @param {number} [count] the number of parts when the axis names none
 * @returns {Option}
 */
const splitOption = (context, finding, kind, values, vertical, count = values.length) => {
  const hours = hoursOf(context)
  const parts = vertical ? count : groupedCount(hours, count)
  const each = vertical ? Math.max(hours / parts, SLICE_FLOOR_HOURS) : hours / parts
  const points = pointsFor(each)
  const names = partNames(context, kind, values, parts)
  const impact = {
    creates: parts - 1, modifies: [context.planned.id], removes: [], parts: names.map((title) => ({ title, points })), points: points * parts,
    floor: each >= SLICE_FLOOR_HOURS, ceiling: points <= MAX_SMALL_POINTS,
    ...(parts < count ? { note: say(context.language, `${count} → ${parts} stories : regroupées pour qu’aucune ne descende sous ½ jour`, `${count} → ${parts} stories: grouped so none falls under ½ day`) } : {}),
  }
  return build(context, finding, kind, { impact, axis: kind, values: names })
}

/** Fewer parts until each holds half a day; never fewer than 2. @param {number} hours @param {number} count */
const groupedCount = (hours, count) => {
  let parts = count
  while (parts > 2 && hours / parts < SLICE_FLOOR_HOURS) parts -= 1
  return parts
}

/** @param {Context} context @param {string} kind @param {string[]} values @param {number} parts */
const partNames = ({ language, planned }, kind, values, parts) => {
  if (values.length) return chunk(values, parts).map((group) => `${planned.title} — ${group.join(' + ')}`)
  const labels = {
    'split-happy-path': [say(language, 'chemin nominal', 'happy path'), say(language, 'refus et erreurs', 'refusals and errors')],
    'defer-nfr': [say(language, 'comportement', 'behaviour'), say(language, 'qualité non fonctionnelle', 'non-functional quality')],
  }[kind] ?? Array.from({ length: parts }, (_, index) => say(language, `règles, groupe ${index + 1}`, `rules, group ${index + 1}`))
  return labels.map((label) => `${planned.title} — ${label}`)
}

/** `values` in `parts` groups of near-equal size, in order. @param {string[]} values @param {number} parts */
const chunk = (values, parts) => Array.from({ length: parts }, (_, index) => values.slice(Math.round((index * values.length) / parts), Math.round(((index + 1) * values.length) / parts)))

/** @param {Context} context @param {any} finding */
const spikeOption = (context, finding) => {
  const { language, planned } = context
  const impact = { creates: 1, modifies: [planned.id], removes: [], parts: [{ title: say(language, `Spike : ${planned.title}`, `Spike: ${planned.title}`), points: 1 }, { title: planned.title, points: pointsFor(hoursOf(context)) }],
    points: 1 + pointsFor(hoursOf(context)), floor: true, ceiling: pointsFor(hoursOf(context)) <= MAX_SMALL_POINTS }
  return build(context, finding, 'spike', { impact, axis: 'spike', values: impact.parts.map((p) => p.title) })
}

/**
 * Merging into a neighbour: the story it waits on, the stories that wait on it, then the ones
 * next to it. A merge that makes a story above one day says so.
 * @param {Context} context @param {any} finding @returns {Option[]}
 */
const mergeOptions = (context, finding) => {
  const { epic, planned, input } = context
  const index = epic.stories.findIndex((s) => s.id === planned.id)
  const ids = [finding.neighbour, ...planned.after, ...epic.stories.filter((s) => s.after.includes(planned.id)).map((s) => s.id),
    epic.stories[index - 1]?.id, epic.stories[index + 1]?.id]
  const neighbours = [...new Set(ids.filter((id) => typeof id === 'string' && epic.stories.some((s) => s.id === id) && id !== planned.id))]
  return neighbours.slice(0, 2).map((target) => {
    const other = /** @type {import('./story-map.mjs').MapStory} */ (epic.stories.find((s) => s.id === target))
    const otherHours = EFFORT_SCALE[input.files.get(target)?.effort?.points ?? other.effort]?.hours ?? 0
    const points = pointsFor(hoursOf(context) + otherHours)
    const impact = { creates: 0, modifies: [target], removes: [planned.id], parts: [{ title: other.title, points }], points, floor: true, ceiling: points <= MAX_SMALL_POINTS,
      ...(points > MAX_SMALL_POINTS ? { note: say(context.language, `la fusion dépasse une journée (${points} points)`, `the merge exceeds one day (${points} points)`) } : {}) }
    return build(context, finding, 'merge', { impact, target })
  })
}

/**
 * One option of the catalogue, instantiated on the story.
 * @param {Context} context @param {any} finding @param {string} kind @param {Partial<Option>} extra
 * @returns {Option}
 */
const build = (context, finding, kind, extra) => {
  const pattern = CATALOGUE[kind]
  const { language, planned } = context
  const suffix = extra.target ?? (extra.add ? extra.add.join('+') : extra.axis && extra.axis !== kind ? extra.axis : '')
  return {
    id: `${planned.id}|${finding.id}|${kind}${suffix ? `:${suffix}` : ''}`,
    kind, structural: pattern.structural, source: pattern.source,
    title: pattern.title[language] + (extra.target ? ` (${extra.target})` : '') + (extra.add ? ` (${extra.add.join(', ')})` : ''),
    description: pattern.description[language],
    plus: pattern.plus.map((p) => p[language]), minus: pattern.minus.map((m) => m[language]),
    impact: { creates: 0, modifies: [planned.id], removes: [], parts: [], points: pointsFor(hoursOf(context)), floor: true, ceiling: true },
    instruction: instructionOf(kind, finding, extra),
    ...extra,
  }
}

/** What the writer is told when this option is applied. @param {string} kind @param {any} finding @param {Partial<Option>} extra */
const instructionOf = (kind, finding, extra) => {
  const base = `${finding.gate ? `${finding.gate}: ` : ''}${finding.message}${finding.suggestion ? ` — ${finding.suggestion}` : ''}`
  const how = {
    'reframe-value': 'Reframe story, title and description around the observable need of the precise persona; keep the scope.',
    'clarify-ac': 'Rewrite the acceptance criteria named by the finding: one observable outcome each, derived from an example, no technical detail.',
    'regroup-criteria': 'Regroup the acceptance criteria into 3 to 5, each still derived from an example; every requirement and example they covered stays covered.',
    'add-examples': 'Write at least 3 examples with concrete values from the PRD, one a refusal; derive the criteria from them.',
    'remove-dependency': 'Rewrite the story so it no longer consumes what the other story produces.',
    'answer-questions': 'Fold the answers of the product owner into the story; drop nothing else.',
    rewrite: 'Fix exactly what the finding reports.',
    'declare-dependency': `Write the reason this story waits on ${(extra.add ?? []).join(', ')}.`,
    custom: 'Apply the correction described by the product owner.',
  }[kind]
  return how ? `${how} Finding: ${base}` : `Finding: ${base}`
}

/** @param {Language} language @param {string} fr @param {string} en */
const say = (language, fr, en) => (language === 'fr' ? fr : en)

// ── Decisions ───────────────────────────────────────────────────────────────────────────────────

/** @returns {Corrections} */
export const emptyCorrections = () => ({ version: 1, decisions: {}, session: null })

/** @param {unknown} value @returns {Corrections} */
export const correctionsOf = (value) => {
  const record = /** @type {any} */ (value)
  if (!record || typeof record !== 'object' || typeof record.decisions !== 'object' || record.decisions === null) return emptyCorrections()
  return { version: 1, decisions: { ...record.decisions }, session: record.session ?? null }
}

/**
 * Records a human decision on one option. Accepting an option withdraws any other accepted option
 * of the same finding; a story takes one structural correction (split, merge, dependency) at a
 * time. `proposed` withdraws the decision.
 * @param {Corrections} corrections
 * @param {{ story: string, finding: CorrectionFinding, option: Option }} target
 * @param {{ status: 'accepted' | 'refused' | 'proposed', comment?: string, at: string }} decision
 * @returns {Corrections}
 */
export const decide = (corrections, { story, finding, option }, { status, comment, at }) => {
  const decisions = { ...corrections.decisions }
  const current = decisions[option.id]
  if (current?.status === 'applied') throw new Error(`${option.id} is already applied`)
  if (option.kind === 'custom' && status === 'accepted' && !(typeof comment === 'string' && comment.trim())) throw new Error('a custom correction needs a comment that describes it')
  if (status === 'proposed') {
    delete decisions[option.id]
    return { ...corrections, decisions }
  }
  if (status === 'accepted') {
    for (const [id, other] of Object.entries(decisions)) {
      if (other.status !== 'accepted' || id === option.id) continue
      if (other.finding === finding.id && other.story === story) delete decisions[id]
      else if (other.story === story && other.option.structural && option.structural) {
        throw new Error(`${story} already has an accepted structural correction (${other.option.title}): refuse it first`)
      }
    }
  }
  decisions[option.id] = { status, story, finding: finding.id, option, at, ...(comment ? { comment } : {}) }
  return { ...corrections, decisions }
}

/**
 * The proposals of every story with the decision taken on each option.
 * @param {ReturnType<typeof proposeCorrections>} proposals @param {Corrections} corrections
 */
export const withDecisions = (proposals, corrections) => proposals.map((story) => ({
  ...story,
  findings: story.findings.map((finding) => ({
    ...finding,
    options: finding.options.map((option) => {
      const decision = corrections.decisions[option.id]
      return { ...option, status: decision?.status ?? 'proposed', ...(decision ? { decidedAt: decision.at, comment: decision.comment ?? null } : {}) }
    }),
  })),
}))

/** @param {Corrections} corrections @returns {Decision[]} */
export const acceptedOf = (corrections) => Object.values(corrections.decisions).filter((d) => d.status === 'accepted')

/**
 * New story ids after the last one of the epic, numbered in the style of `sample` (`-S1` or `-S01`).
 * @param {import('./story-map.mjs').StoryMap} map @param {string} epicId @param {string} sample @param {number} count
 */
export const nextIds = (map, epicId, sample, count) => {
  const match = /^(.*-S)(\d+)$/.exec(sample)
  const prefix = match?.[1] ?? `${epicId}-S`
  const width = match?.[2].length ?? 2
  const used = storiesOf(map).filter((s) => s.id.startsWith(prefix)).map((s) => Number(s.id.slice(prefix.length)))
  const start = Math.max(0, ...used.filter((n) => Number.isFinite(n))) + 1
  return Array.from({ length: count }, (_, index) => `${prefix}${String(start + index).padStart(width, '0')}`)
}

// ── What an accepted correction does to the story map ──────────────────────────────────────────

/** @param {import('./story-map.mjs').StoryMap} map @param {string} id */
const locate = (map, id) => {
  const epic = map.epics.find((e) => e.stories.some((s) => s.id === id))
  if (!epic) throw new Error(`${id} is no story of the map`)
  return { epic, index: epic.stories.findIndex((s) => s.id === id) }
}

/**
 * @typedef {{ title: string, persona: string, description: string, covers: string[], effort: number }} SplitPart
 */

/**
 * What a split proposal must hold before the map changes: the number of parts the human accepted,
 * every part a story of its own (texts, covers, one day at most), the covers shared without loss.
 * @param {import('./story-map.mjs').MapStory} original @param {unknown} proposal @param {number} count
 * @param {string[]} [waiting] the stories that wait on the original: the only keys `dependents` may name
 * @returns {string[]}
 */
export const splitProblems = (original, proposal, count, waiting = []) => {
  const parts = /** @type {any} */ (proposal)?.stories
  if (!Array.isArray(parts)) return ['the split file must hold { "stories": [ … ] }']
  const wiring = /** @type {any} */ (proposal)?.dependents ?? {}
  const wiringProblems = Object.entries(wiring).flatMap(([story, indexes]) => [
    ...(waiting.includes(story) ? [] : [`dependents.${story}: it does not wait on ${original.id}`]),
    ...(Array.isArray(indexes) && indexes.length && indexes.every((n) => Number.isInteger(n) && n >= 0 && n < parts.length) ? []
      : [`dependents.${story} must list part indexes from 0 to ${parts.length - 1}`]),
  ])
  const problems = parts.length === count ? [] : [`the accepted split makes ${count} stories, the file holds ${parts.length}`]
  parts.forEach((part, index) => {
    for (const field of ['title', 'persona', 'description']) if (!(typeof part?.[field] === 'string' && part[field].trim())) problems.push(`stories[${index}].${field} must be a non-empty string`)
    if (!Array.isArray(part?.covers) || !part.covers.length) problems.push(`stories[${index}].covers must name at least one requirement`)
    else for (const id of part.covers) if (!original.covers.includes(id)) problems.push(`stories[${index}] covers ${id}, which ${original.id} does not cover`)
    if (![1, 2, 3].includes(part?.effort)) problems.push(`stories[${index}].effort must be 1, 2 or 3 (one day at most)`)
  })
  const covered = new Set(parts.flatMap((p) => (Array.isArray(p?.covers) ? p.covers : [])))
  for (const id of original.covers) if (!covered.has(id)) problems.push(`no part covers ${id}, which ${original.id} covers`)
  return [...problems, ...wiringProblems]
}

/**
 * The one channel or interface a title names, or null when it names none or several.
 * @param {string} title
 */
export const channelOf = (title) => {
  const named = INTEGRATIONS.filter(([, pattern]) => pattern.test(title)).map(([name]) => name)
  return named.length === 1 ? named[0] : null
}

/**
 * Replaces a story by its parts. The first part keeps the id — it is the base the others build
 * on; the others take the next ids of the epic, come right after it and wait on it (one ordered
 * lane, backlog-slicing). Each part is marked `splitOf` its original.
 *
 * A story that waited on the original now waits on one part only: the part the slicer names in
 * `dependents` (part indexes), else the part of the same channel, else the first part.
 * Then every story touched is aligned on channels: a story of one channel that waits on a split
 * story waits on the part of that channel (the Slack part of one split waits on the Slack part
 * of another).
 * @param {import('./story-map.mjs').StoryMap} source @param {string} id @param {SplitPart[]} parts
 * @param {{ dependents?: Record<string, number[]> }} [wiring]
 * @returns {{ map: import('./story-map.mjs').StoryMap, ids: string[] }}
 */
export const applySplit = (source, id, parts, { dependents = {} } = {}) => {
  const map = structuredClone(source)
  const { epic, index } = locate(map, id)
  const original = epic.stories[index]
  const ids = [id, ...nextIds(map, epic.id, id, parts.length - 1)]
  const stories = parts.map((part, n) => ({
    ...(n === 0 ? original : { milestone: original.milestone, moscow: original.moscow }),
    id: ids[n], title: part.title, persona: part.persona, description: part.description, covers: [...part.covers], effort: part.effort,
    after: n === 0 ? [...original.after] : [...new Set([...original.after, id])], splitOf: id,
  }))
  epic.stories.splice(index, 1, ...stories)
  const rewired = storiesOf(map).filter((story) => !ids.includes(story.id) && story.after.includes(id))
  for (const story of rewired) {
    const chosen = dependents[story.id]?.map((n) => ids[n]) ?? [partFor(stories, story.title) ?? id]
    story.after = [...new Set(story.after.flatMap((dep) => (dep === id ? chosen : [dep])))]
  }
  for (const story of [...stories, ...rewired]) alignChannels(map, story)
  return { map, ids }
}

/** The part of a split whose title names the same single channel as `title`. @param {any[]} parts @param {string} title */
const partFor = (parts, title) => {
  const channel = channelOf(title)
  return channel ? parts.find((part) => channelOf(part.title) === channel)?.id ?? null : null
}

/**
 * A story of one channel waits on the part of that channel of every split story it waits on.
 * @param {import('./story-map.mjs').StoryMap} map @param {any} story
 */
const alignChannels = (map, story) => {
  if (!channelOf(story.title)) return
  const all = storiesOf(map)
  story.after = [...new Set(story.after.map((dep) => {
    const target = all.find((s) => s.id === dep)
    const group = target?.splitOf ? all.filter((s) => s.splitOf === target.splitOf && s.id !== story.id) : []
    return partFor(group, story.title) ?? dep
  }))].filter((dep) => dep !== story.id)
}

/**
 * Merges a story into its neighbour, which keeps its id, covers both, waits on what both waited
 * on, and takes the earlier milestone; the stories that waited on the merged one wait on it.
 * @param {import('./story-map.mjs').StoryMap} source @param {string} id @param {string} target
 * @returns {import('./story-map.mjs').StoryMap}
 */
export const applyMerge = (source, id, target) => {
  const map = structuredClone(source)
  const { epic, index } = locate(map, id)
  const into = epic.stories.find((s) => s.id === target)
  if (!into) throw new Error(`${target} is not in the epic of ${id}`)
  const merged = epic.stories[index]
  const order = map.milestones.map((m) => m.id)
  into.covers = [...new Set([...into.covers, ...merged.covers])]
  into.after = [...new Set([...into.after, ...merged.after])].filter((s) => s !== id && s !== target)
  into.effort = pointsFor((EFFORT_SCALE[into.effort]?.hours ?? 0) + (EFFORT_SCALE[merged.effort]?.hours ?? 0))
  if (order.indexOf(merged.milestone) < order.indexOf(into.milestone)) into.milestone = merged.milestone
  epic.stories.splice(index, 1)
  for (const story of storiesOf(map)) {
    if (story.after.includes(id)) story.after = [...new Set(story.after.map((s) => (s === id ? target : s)))].filter((s) => s !== story.id)
  }
  return map
}

/**
 * @param {import('./story-map.mjs').StoryMap} source @param {string} id @param {string[]} add
 * @returns {import('./story-map.mjs').StoryMap}
 */
export const applyDependency = (source, id, add) => {
  const map = structuredClone(source)
  const { epic, index } = locate(map, id)
  epic.stories[index].after = [...new Set([...epic.stories[index].after, ...add])]
  return map
}

/** The split kinds: an agent names the parts, the code changes the map. */
export const SPLIT_KINDS = Object.freeze(new Set(['split-interface', 'split-workflow', 'split-happy-path', 'split-business-rule', 'defer-nfr', 'spike']))
