import boundaries from 'eslint-plugin-boundaries'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['node_modules/', 'reports/', '.stryker-tmp/'] },
  ...tseslint.configs.recommended,
  {
    name: 'clean-architecture/layers',
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { alwaysTryTypes: true } },
      'boundaries/include': ['src/**/*'],
      // The composition root builds every layer; it belongs to none.
      'boundaries/ignore': ['src/main.ts'],
      'boundaries/elements': [
        { type: 'domain', pattern: 'src/domain' },
        { type: 'application', pattern: 'src/application' },
        { type: 'infrastructure', pattern: 'src/infrastructure' },
        { type: 'api', pattern: 'src/api' },
      ],
    },
    rules: {
      'boundaries/no-unknown-files': 'error',
      'boundaries/dependencies': ['error', {
        default: 'disallow',
        policies: [
          { from: { element: { type: 'domain' } }, allow: { to: { element: { type: 'domain' } } } },
          { from: { element: { type: 'application' } }, allow: { to: { element: { type: ['domain', 'application'] } } } },
          { from: { element: { type: 'infrastructure' } }, allow: { to: { element: { type: ['domain', 'application', 'infrastructure'] } } } },
          { from: { element: { type: 'api' } }, allow: { to: { element: { type: ['domain', 'application', 'api'] } } } },
        ],
      }],
    },
  },
]
