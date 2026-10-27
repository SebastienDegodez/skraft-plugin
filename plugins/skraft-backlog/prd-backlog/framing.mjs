// FRAME: the questions answered before the first slice, so that it cuts right from the start.
// The code asks what it can read in the PRD (several channels in one epic, release slices, dense
// epics, NFRs to place); the slicer adds what only a reader of the PRD sees (MVP scope, tracer,
// ordering). Each question has options and a recommendation; an unanswered question takes its
// recommendation, and says so to the slicer.
import { INTEGRATIONS } from './story.mjs'

export const MAX_SLICER_QUESTIONS = 5
const DENSE_EPIC = 12
const SLICES = /^#{1,4}\s.*\b(lot|phase|release|incr[ée]ment|jalon|milestone|mvp|v\d+(?:\.\d+)?)\b.*$/gim

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
  return [...channelQuestions(inventory, language), releaseQuestion(prdText, language), ...denseQuestions(inventory, language), nfrQuestion(inventory, language)]
    .filter((q) => q !== null)
}

/** @param {import('./prd-inventory.mjs').Inventory} inventory @param {'fr' | 'en'} language */
const channelQuestions = (inventory, language) => inventory.epics.map((epic) => {
  const text = inventory.requirements.filter((r) => r.epic === epic.id).map((r) => r.statement).join(' ')
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

/** @param {string} prdText @param {'fr' | 'en'} language */
const releaseQuestion = (prdText, language) => {
  const found = [...new Set([...prdText.matchAll(SLICES)].map((m) => m[0].replace(/^#+\s*/, '').trim()))].slice(0, 6)
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
const denseQuestions = (inventory, language) => inventory.epics.map((epic) => {
  const count = inventory.requirements.filter((r) => r.epic === epic.id && r.kind === 'FR').length
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
