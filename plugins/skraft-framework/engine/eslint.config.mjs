// Function-size and complexity limits of the engine. Run from the repository root:
//   npm run lint:engine
const LIMITS = Object.freeze({
  'max-lines-per-function': ['error', { max: 12, skipBlankLines: true, skipComments: true }],
  'max-statements': ['error', 12],
  complexity: ['error', 8],
  'max-depth': ['error', 3],
})

// Lot 1 code outside lot 2's scope, refactored in its own change. A file leaves this list once
// it passes; no file joins it.
const NOT_REFACTORED_YET = [
  'application/active-run.mjs',
  'application/run-journal.mjs',
  'drivers/copilot-workflow/skraft-decide-tool.mjs',
]

const warnings = Object.fromEntries(Object.entries(LIMITS).map(([rule, [, ...options]]) => [rule, ['warn', ...options]]))

// Paths below are relative to this folder, wherever ESLint is started from.
const basePath = import.meta.dirname

export default [
  { basePath, ignores: ['node_modules/**', 'reports/**', '.stryker-tmp/**'] },
  {
    basePath,
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    linterOptions: { noInlineConfig: true },
    rules: LIMITS,
  },
  { basePath, files: NOT_REFACTORED_YET, rules: warnings },
]
