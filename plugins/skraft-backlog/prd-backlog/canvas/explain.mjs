// The explanation the agent reads: for one story, every INVEST letter and DoR item that does not
// hold, with what was found, why it fails and how to fix it, in the language of the PRD.
import { DOR, INVEST } from './assess.mjs'
import { dictionary, explanation, lineLabel, response } from './ui/i18n.mjs'

/**
 * @param {ReturnType<typeof import('./assess.mjs').assessBacklog>['stories'][number]} story
 * @param {'fr' | 'en'} language
 */
export const explainStory = (story, language) => {
  const words = dictionary(language)
  const lineOf = (key, value) => {
    const { name, challenge } = lineLabel(language, key)
    return {
      line: /\d/.test(key) ? `DoR ${key}` : key, name, challenge, status: value.status, found: response(language, key, value),
      evidence: value.evidence.map((e) => ({ source: words.sources[e.source], ...(e.gate ? { gate: e.gate, lens: e.lens, severity: e.severity } : {}), ...explanation(language, e) })),
    }
  }
  const failing = (keys, lines) => keys.map((key) => lineOf(key, lines[key])).filter((line) => line.status === 'fail' || line.status === 'warn')
  return {
    id: story.id, title: story.title, state: words.states[story.state], review: words.reviews[story.review], verdict: story.verdict,
    invest: failing(INVEST, story.invest),
    dor: failing(DOR, story.dor),
    antipatterns: story.antipatterns,
    otherFindings: story.unplaced.map((f) => ({ gate: f.gate, lens: f.lens, severity: f.severity, why: f.description, fix: f.suggestion ?? '' })),
    reasons: story.reasons,
  }
}
