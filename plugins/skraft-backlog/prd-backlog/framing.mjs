// FRAME: the questions answered before the first slice, so that it cuts right from the start.
// The code asks what it can read in the PRD (several channels in one epic, release slices, dense
// epics, NFRs to place); the slicer adds what only a reader of the PRD sees (MVP scope, tracer,
// ordering). Each question has options and a recommendation; an unanswered question takes its
// recommendation, and says so to the slicer.
import { isDraft } from './prd-inventory.mjs'
import { INTEGRATIONS } from './story.mjs'

export const MAX_SLICER_QUESTIONS = 5
const DENSE_EPIC = 12
const SLICES = /^#{1,4}\s.*\b(lot|phase|release|incr[ée]ment|jalon|milestone|mvp|v\d+(?:\.\d+)?)\b.*$/gim
/** Section titles a PRD template always writes: they name no release slice. */
const TEMPLATE_SECTIONS = /^(?:\d+(?:\.\d+)*\.?\s+)?(mvp and release framing|mvp scope|release framing|phase architecture|process models|phase-gated workflow)\s*$/i

/**
 * @typedef {{ id: string, source: 'prd' | 'slicer', question: string, why?: string, options: string[], recommended: number, epic?: string }} FramingQuestion
 * @typedef {{ version: 1, questions: FramingQuestion[], answers: Record<string, { text: string, at: string }> }} Framing
 */

const t = (language, fr, en) => (language === 'fr' ? fr : en)
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * The questions the PRD itself raises.
 * @param {import('./prd-inventory.mjs').Inventory} inventory @param {string} prdText
 * @returns {FramingQuestion[]}
 */
export const prdQuestions = (inventory, prdText) => {
  const language = inventory.language
  return [statusQuestion(inventory, language), unreadQuestion(inventory, language), epicsQuestion(inventory, language),
    ...channelQuestions(inventory, language), releaseQuestion(prdText, language, inventory), ...denseQuestions(inventory, language), nfrQuestion(inventory, language)]
    .filter((q) => q !== null)
}

/** The epics the questions about channels and density look at: the PRD's own, or the whole PRD. @param {import('./prd-inventory.mjs').Inventory} inventory */
const epicsAsked = (inventory) => (inventory.epics.length ? inventory.epics.map((e) => ({ id: e.id, frs: inventory.requirements.filter((r) => r.epic === e.id) }))
  : [{ id: 'PRD', frs: inventory.requirements.filter((r) => r.kind === 'FR') }])

/** A PRD still in draft: the human decides, knowing the risks. @param {import('./prd-inventory.mjs').Inventory} inventory @param {'fr' | 'en'} language */
const statusQuestion = (inventory, language) => {
  if (!isDraft(inventory)) return null
  return {
    id: 'prd-status', source: /** @type {const} */ ('prd'),
    question: t(language, `Le PRD est encore au statut « ${inventory.status} » : découper maintenant ?`, `The PRD is still "${inventory.status}": slice it now?`),
    why: t(language, 'Risques : des exigences peuvent encore changer ou être renumérotées, et la découpe serait à refaire.', 'Risks: requirements may still change or be renumbered, and the slicing would have to be redone.'),
    options: [
      t(language, 'Découper maintenant, chaque story signale que le PRD n’est pas validé', 'Slice now, every story notes that the PRD is not approved'),
      t(language, 'Attendre que le PRD soit validé', 'Wait until the PRD is approved'),
      t(language, 'Découper maintenant sans réserve', 'Slice now without reservation'),
    ],
    recommended: 0,
  }
}

/** Requirement ids the PRD names but never defines: reported, the PRD is not rewritten. @param {import('./prd-inventory.mjs').Inventory} inventory @param {'fr' | 'en'} language */
const unreadQuestion = (inventory, language) => {
  const prefixes = new Set(inventory.requirements.filter((r) => r.kind === 'FR').map((r) => r.id.slice(0, r.id.lastIndexOf('-'))))
  const unread = (inventory.cited ?? []).filter((c) => prefixes.has(c.id.slice(0, c.id.lastIndexOf('-')))).map((c) => `${c.id} (${t(language, 'ligne', 'line')} ${c.lines[0]})`)
  if (!unread.length) return null
  return {
    id: 'unread', source: /** @type {const} */ ('prd'),
    question: t(language, `Le PRD cite ${unread.slice(0, 5).join(', ')} sans jamais le définir : que faire ?`, `The PRD names ${unread.slice(0, 5).join(', ')} but never defines it: what should be done?`),
    why: t(language, 'skraft ne modifie jamais le PRD : un id qu’il ne définit pas n’entre dans aucune story.', 'skraft never rewrites the PRD: an id it does not define goes into no story.'),
    options: [
      t(language, 'L’ignorer, c’est une référence ou une coquille', 'Ignore it, it is a reference or a typo'),
      t(language, 'Arrêter : le PRD doit être complété à la source', 'Stop: the PRD must be completed at its source'),
    ],
    recommended: 0,
  }
}

/**
 * A PRD that proposes no epic: the slicer cuts by capability delivered and deployed together, and
 * the product owner is told why, with what it brings and what it costs.
 * @param {import('./prd-inventory.mjs').Inventory} inventory @param {'fr' | 'en'} language
 */
const epicsQuestion = (inventory, language) => {
  if ((inventory.epicSource ?? (inventory.epics.length ? 'ep' : 'none')) !== 'none') return null
  const frs = inventory.requirements.filter((r) => r.kind === 'FR').length
  const small = frs <= DENSE_EPIC
  return {
    id: 'epics', source: /** @type {const} */ ('prd'),
    question: t(language, `Le PRD ne propose pas d’épics (${frs} exigences) : comment les découper ?`, `The PRD proposes no epics (${frs} requirements): how should they be cut?`),
    why: t(language,
      'Une épic = une capacité livrée et déployée ensemble ; un module ou un bounded context n’est une épic que s’il se déploie seul. + chaque épic se démontre et se déploie seule, peu de dépendances entre épics. − une épic peut toucher plusieurs bounded contexts (risque de conflits de code, d’où des stories ordonnées sur le même code) ; une grande épic peut dépasser 12 stories.',
      'An epic = one capability delivered and deployed together; a module or a bounded context is an epic only when it deploys on its own. + each epic is demonstrated and deployed alone, few dependencies between epics. − an epic may touch several bounded contexts (code conflicts, hence ordered stories on the same code); a large epic may pass 12 stories.'),
    options: [
      t(language, 'Une seule épic tant qu’aucun résultat distinct ne justifie de couper', 'A single epic until a distinct outcome justifies a cut'),
      t(language, 'Une épic par capacité livrée et déployée ensemble, proposée par le slicer', 'One epic per capability delivered and deployed together, proposed by the slicer'),
      t(language, 'Une épic par bounded context, même s’il ne se déploie pas seul', 'One epic per bounded context, even when it does not deploy alone'),
    ],
    recommended: small ? 0 : 1,
  }
}

/** @param {import('./prd-inventory.mjs').Inventory} inventory @param {'fr' | 'en'} language */
const channelQuestions = (inventory, language) => epicsAsked(inventory).map((epic) => {
  const text = epic.frs.map((r) => r.statement).join(' ')
  const named = INTEGRATIONS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)
  if (named.length < 2) return null
  return {
    id: `channels-${epic.id}`, source: /** @type {const} */ ('prd'), epic: epic.id,
    question: t(language, `${epic.id} nomme ${named.join(', ')} : comment découper ces canaux ?`, `${epic.id} names ${named.join(', ')}: how should these channels be sliced?`),
    why: t(language, 'Une story qui intègre plusieurs systèmes dépasse vite une journée.', 'A story integrating several systems soon exceeds one day.'),
    options: [
      t(language, 'Une story par canal, le premier sert de tracer', 'One story per channel, the first is the tracer'),
      t(language, 'Un canal dans le MVP, les autres dans un jalon suivant', 'One channel in the MVP, the others in a later milestone'),
      t(language, 'Tous les canaux dans une seule story', 'All channels in one story'),
    ],
    recommended: 0,
  }
}).filter((q) => q !== null)

/** @param {import('./prd-inventory.mjs').Mvp} mvp @param {'fr' | 'en'} language */
const mvpQuestion = (mvp, language) => {
  const list = (ids) => (ids.length > 6 ? `${ids.slice(0, 6).join(', ')}…` : ids.join(', '))
  const later = mvp.deferred.length ? t(language, ` ; différées : ${list(mvp.deferred)}`, `; deferred: ${list(mvp.deferred)}`) : ''
  return {
    id: 'milestones', source: /** @type {const} */ ('prd'),
    question: t(language, 'Comment découper en jalons ?', 'How should the backlog be cut into milestones?'),
    why: t(language, `La section « ${mvp.section} » met dans la première version ${list(mvp.inScope)}${later}.`, `The section "${mvp.section}" puts ${list(mvp.inScope)} in the first release${later}.`),
    options: [
      t(language, 'Un jalon MVP avec les exigences de la première version, le reste dans un jalon suivant', 'One MVP milestone with the first-release requirements, the rest in a later milestone'),
      t(language, 'Un seul jalon MVP, le reste plus tard', 'A single MVP milestone, the rest later'),
      t(language, 'Un jalon par parcours utilisateur démontrable', 'One milestone per demonstrable user journey'),
    ],
    recommended: 0,
  }
}

/** @param {string} prdText @param {'fr' | 'en'} language @param {import('./prd-inventory.mjs').Inventory} [inventory] */
const releaseQuestion = (prdText, language, inventory) => {
  const found = [...new Set([...prdText.matchAll(SLICES)].map((m) => m[0].replace(/^#+\s*/, '').trim()))].filter((title) => !TEMPLATE_SECTIONS.test(title)).slice(0, 6)
  const mvp = inventory?.mvp
  if (!found.length && mvp?.inScope.length) return mvpQuestion(mvp, language)
  return {
    id: 'milestones', source: /** @type {const} */ ('prd'),
    question: t(language, 'Comment découper en jalons ?', 'How should the backlog be cut into milestones?'),
    why: found.length ? t(language, `Le PRD cite : ${found.join(' · ')}.`, `The PRD names: ${found.join(' · ')}.`)
      : t(language, 'Le PRD ne nomme ni lot ni phase.', 'The PRD names no lot or phase.'),
    options: [
      ...(found.length ? [t(language, 'Un jalon par lot ou phase du PRD', 'One milestone per lot or phase of the PRD')] : []),
      t(language, 'Un seul jalon MVP, le reste plus tard', 'A single MVP milestone, the rest later'),
      t(language, 'Un jalon par parcours utilisateur démontrable', 'One milestone per demonstrable user journey'),
    ],
    recommended: 0,
  }
}

/** @param {import('./prd-inventory.mjs').Inventory} inventory @param {'fr' | 'en'} language */
const denseQuestions = (inventory, language) => (inventory.epics.length ? epicsAsked(inventory) : []).map((epic) => {
  const count = epic.frs.filter((r) => r.kind === 'FR').length
  if (count <= DENSE_EPIC) return null
  return {
    id: `dense-${epic.id}`, source: /** @type {const} */ ('prd'), epic: epic.id,
    question: t(language, `${epic.id} porte ${count} exigences : la garder entière ?`, `${epic.id} carries ${count} requirements: keep it whole?`),
    why: t(language, 'Au-delà de 12 stories, une épic se suit mal.', 'Past 12 stories an epic is hard to follow.'),
    options: [
      t(language, 'Une épic, les stories les plus petites qui gardent une valeur', 'One epic, the smallest stories that keep a value'),
      t(language, 'La découper en deux épics par parcours', 'Split it into two epics by journey'),
    ],
    recommended: 0,
  }
}).filter((q) => q !== null)

/** @param {import('./prd-inventory.mjs').Inventory} inventory @param {'fr' | 'en'} language */
const nfrQuestion = (inventory, language) => {
  const count = inventory.requirements.filter((r) => r.kind === 'NFR').length
  if (!count) return null
  return {
    id: 'nfr', source: /** @type {const} */ ('prd'),
    question: t(language, `Où placer les ${count} exigences non fonctionnelles ?`, `Where should the ${count} non-functional requirements go?`),
    why: t(language, 'Une NFR que porte aucune story n’est jamais vérifiée.', 'An NFR no story carries is never checked.'),
    options: [
      t(language, 'Dans les stories qu’elles contraignent', 'In the stories they constrain'),
      t(language, 'Une story dédiée en fin d’épic', 'A dedicated story at the end of the epic'),
      t(language, 'Différées après le MVP', 'Deferred after the MVP'),
    ],
    recommended: 0,
  }
}

/**
 * The slicer's own questions, kept when well formed: a question, 2 to 4 options, a recommendation.
 * @param {unknown} value @returns {FramingQuestion[]}
 */
export const slicerQuestions = (value) => {
  const list = Array.isArray(/** @type {any} */ (value)?.questions) ? /** @type {any} */ (value).questions : []
  return list.filter((q) => isText(q?.question) && Array.isArray(q?.options) && q.options.filter(isText).length >= 2)
    .slice(0, MAX_SLICER_QUESTIONS)
    .map((q, index) => {
      const options = q.options.filter(isText).slice(0, 4)
      const recommended = Number.isInteger(q.recommended) && q.recommended >= 0 && q.recommended < options.length ? q.recommended : 0
      return { id: `slicer-${index + 1}`, source: /** @type {const} */ ('slicer'), question: q.question.trim(), ...(isText(q.why) ? { why: q.why.trim() } : {}), options, recommended }
    })
}

/** @param {unknown} value @returns {Framing | null} */
export const framingOf = (value) => {
  const record = /** @type {any} */ (value)
  if (!record || !Array.isArray(record.questions)) return null
  return { version: 1, questions: record.questions, answers: record.answers && typeof record.answers === 'object' ? record.answers : {} }
}

/** @param {Framing} framing */
export const unanswered = (framing) => framing.questions.filter((q) => !isText(framing.answers[q.id]?.text))

/**
 * What the slicer is told: each question with the answer, or with its recommendation when the
 * product owner left it.
 * @param {Framing} framing @returns {string[]}
 */
export const framingLines = (framing) => framing.questions.map((q) => {
  const answer = framing.answers[q.id]?.text
  return isText(answer) ? `${q.question} → ${answer}` : `${q.question} → ${q.options[q.recommended]} (recommended, not answered)`
})
