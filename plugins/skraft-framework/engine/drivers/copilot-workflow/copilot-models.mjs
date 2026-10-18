/**
 * The Copilot model each family of the workflow runs on, the preferred first: the only place a
 * versioned Copilot model name is written. A family Copilot has no model for runs on the
 * session's model. The workflow args can map a family to other names (`models`).
 */
export const COPILOT_MODELS = Object.freeze({
  haiku: Object.freeze(['claude-haiku-5.5']),
  sonnet: Object.freeze(['claude-sonnet-5.5']),
  opus: Object.freeze(['claude-opus-5.5']),
  'gpt-luna': Object.freeze(['gpt-5.6-luna']),
})
