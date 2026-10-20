// A model family is an open-ended kebab-case word (haiku, sonnet, kimi, gemini…) that an agent
// file declares. Every segment starts with a letter, so a versioned model id is no family. The
// family → model name mapping lives in the developer's skraft-config.json, never in the
// repository tooling.
const FAMILY_WORD = /^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/

export const isModelFamily = (value) => typeof value === 'string' && value !== 'inherit' && FAMILY_WORD.test(value)
