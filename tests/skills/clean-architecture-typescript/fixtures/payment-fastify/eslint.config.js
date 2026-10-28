import tseslint from 'typescript-eslint'
import cleanArchitecture from './eslint/clean-architecture.js'

export default [
  { ignores: ['node_modules/', 'reports/', 'coverage/'] },
  ...tseslint.configs.recommended,
  ...cleanArchitecture({ root: 'src' }),
]
