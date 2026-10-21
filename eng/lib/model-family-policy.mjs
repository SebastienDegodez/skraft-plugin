// A model family is an open-ended kebab-case word (haiku, sonnet, kimi, gemini…) that an agent
// file declares. Every segment starts with a letter, so a versioned model id is no family. The
// family → model name mapping lives in the developer's skraft-config.json, never in the
// repository tooling.
const FAMILY_WORD = /^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/

export const isModelFamily = (value) => typeof value === 'string' && value !== 'inherit' && FAMILY_WORD.test(value)

// Claude Code's model aliases. A Claude Code agent file names one of them, or `inherit`: it is
// the agent's model when skraft passes none (no configuration, or `inherit`). The family an
// agent runs on lives in the skraft configuration (`assign`, `models`), never in an agent file.
export const CLAUDE_ALIASES = Object.freeze(['haiku', 'sonnet', 'opus', 'fable'])

export const isClaudeAgentModel = (value) => value === 'inherit' || CLAUDE_ALIASES.includes(value)
