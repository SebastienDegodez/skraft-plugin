/**
 * The one place the architecture names things: the context map's `## Glossary` table, each term
 * shared by the documents once, with its context and meaning. Most review findings on a design were
 * the same thing named two ways in two documents (#662), each costing a whole pass.
 */
export const CONTEXT_MAP = 'docs/architecture/context-map.md'
const GLOSSARY = /^##\s+Glossary\s*$(?:\r?\n)+\|[^\n]*\|\s*\r?\n\|\s*-/im

/** Why a context map the pass changed is refused; none when it holds its glossary. @param {string} path @param {string} text */
export const glossaryProblems = (path, text) => (path !== CONTEXT_MAP || GLOSSARY.test(text)
  ? []
  : [`${CONTEXT_MAP}: name every term the documents share once, in a ## Glossary table (term, context, meaning), and use it verbatim everywhere.`])
