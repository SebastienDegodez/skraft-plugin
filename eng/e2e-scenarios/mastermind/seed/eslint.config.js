import boundaries from 'eslint-plugin-boundaries'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['node_modules/', 'reports/', '.copilot-tracking/', '.stryker-tmp/'] },
  ...tseslint.configs.recommended,
  {
    name: 'clean-architecture/layers',
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { alwaysTryTypes: true } },
      'boundaries/include': ['src/**/*'],
      'boundaries/elements': [
        { type: 'domain', pattern: 'src/domain' },
        { type: 'application', pattern: 'src/application' },
      ],
    },
    rules: {
      'boundaries/no-unknown-files': 'error',
      'boundaries/dependencies': ['error', {
        default: 'disallow',
        rules: [
          { from: { type: 'domain' }, allow: { to: { type: 'domain' } } },
          { from: { type: 'application' }, allow: { to: { type: ['domain', 'application'] } } },
        ],
      }],
    },
  },
]
