import tseslint from 'typescript-eslint'
import cleanArchitecture from './eslint/clean-architecture.js'

export default [
  { ignores: ['node_modules/', 'dist/', 'reports/', '.stryker-tmp/', 'test-results/', 'playwright-report/', 'skraft-visuals/', 'eslint/'] },
  ...tseslint.configs.recommended,
  ...cleanArchitecture({ root: 'src' }),
]
