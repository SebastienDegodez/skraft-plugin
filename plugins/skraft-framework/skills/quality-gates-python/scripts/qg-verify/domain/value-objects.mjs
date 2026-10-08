// These sets keep phase/verdict names on short leash.
const PHASES = new Set(['DISCOVER', 'DISCUSS', 'DESIGN', 'DISTILL', 'DELIVER', 'DONE'])
const VERDICTS = new Set(['APPROVED', 'REJECTED', 'NEEDS_REWORK'])

// Each constructor freezes output so these tiny domain values stay immutable.
export const Phase = (name) => {
  if (!PHASES.has(name)) throw new Error(`Invalid phase: ${name}`)
  return Object.freeze({ type: 'Phase', value: name })
}

export const AgentName = (name) => {
  if (typeof name !== 'string' || name.trim() === '') throw new Error('AgentName must be non-empty string')
  return Object.freeze({ type: 'AgentName', value: name.trim() })
}

export const ProjectSlug = (slug) => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error(`Invalid project slug: ${slug}`)
  return Object.freeze({ type: 'ProjectSlug', value: slug })
}

export const Verdict = (v) => {
  if (!VERDICTS.has(v)) throw new Error(`Invalid verdict: ${v}`)
  return Object.freeze({ type: 'Verdict', value: v })
}

export const SkillRef = (path) => {
  if (typeof path !== 'string' || path.trim() === '') throw new Error('SkillRef must be non-empty string')
  return Object.freeze({ type: 'SkillRef', value: path.trim() })
}

const PROJECT_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

// True for a kebab-case slug safe to join into a tracking path (no separator, no dot).
export const isValidProjectSlug = (slug) => typeof slug === 'string' && PROJECT_SLUG_RE.test(slug)

// The first valid slug among candidates in precedence order, or null.
export const firstValidProjectSlug = (...candidates) => candidates.find(isValidProjectSlug) ?? null
