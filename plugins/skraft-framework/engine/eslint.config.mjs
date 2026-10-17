// Function-size and complexity limits of the engine. Run from the repository root:
//   npm run lint:engine
const LIMITS = Object.freeze({
  'max-lines-per-function': ['error', { max: 12, skipBlankLines: true, skipComments: true }],
  'max-statements': ['error', 12],
  complexity: ['error', 8],
  'max-depth': ['error', 3],
})

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
]
