import tseslint from 'typescript-eslint'

export default [
  { ignores: ['node_modules/', 'reports/', 'coverage/'] },
  ...tseslint.configs.recommended,
]
