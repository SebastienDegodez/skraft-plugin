/**
 * Clean architecture for a Node / TypeScript back end: one folder per layer under src/.
 *
 *   src/domain/          aggregates, value objects, domain events; no package, no Node API
 *   src/application/     use cases and the interfaces they call, one folder per feature; no feature imports another
 *   src/infrastructure/  implementations of those interfaces (database, HTTP clients, files)
 *   src/api/             HTTP routes: receive the use cases, never build infrastructure
 *   src/main.ts          composition root: builds every class, hands the use cases to api/, listens; in no layer
 *
 * Spread it after your own flat config, which parses TypeScript (typescript-eslint):
 *
 *   import cleanArchitecture from './eslint/clean-architecture.js'
 *   export default [...yourConfig, ...cleanArchitecture({ root: 'src' })]
 *
 * Requires: eslint-plugin-boundaries@7, eslint-import-resolver-typescript. Without the resolver, imports stay
 * unresolved and every layer rule passes silently. Pass `resolver: null` if your config already sets
 * `settings['import/resolver']`.
 */
import boundaries from 'eslint-plugin-boundaries'

const DEFAULT_RESOLVER = { typescript: { alwaysTryTypes: true } }

/** The composition root sits at the root of `src` and belongs to no layer. */
const DEFAULT_ENTRYPOINTS = ['main.ts']

const layer = (...types) => ({ element: { type: types } })

const sameFeature = { element: { type: 'application', captured: { feature: '{{ from.element.captured.feature }}' } } }
const sharedFeature = { element: { type: 'application', captured: { feature: 'shared' } } }

/** Every import that is neither relative nor a path alias (`@/`, `~/`, `#`) names a package or a Node module. */
const PACKAGE_OR_NODE_MODULE = '^(?![.]|@/|~/|#)'

export default function cleanArchitecture({ root = 'src', resolver = DEFAULT_RESOLVER, entrypoints = DEFAULT_ENTRYPOINTS } = {}) {
  const sources = `${root}/**/*.{ts,mts,cts,js,mjs}`
  const core = [`${root}/domain/**/*`, `${root}/application/**/*`]

  return [
    {
      name: 'clean-architecture/layers',
      files: [sources],
      plugins: { boundaries },
      settings: {
        ...(resolver ? { 'import/resolver': resolver } : {}),
        'boundaries/include': [`${root}/**/*`],
        'boundaries/ignore': entrypoints.map((file) => `${root}/${file}`),
        'boundaries/elements': [
          { type: 'domain', pattern: `${root}/domain` },
          { type: 'application', pattern: `${root}/application/*`, capture: ['feature'] },
          { type: 'application', pattern: `${root}/application` },
          { type: 'infrastructure', pattern: `${root}/infrastructure` },
          { type: 'api', pattern: `${root}/api` },
        ],
      },
      rules: {
        'boundaries/dependencies': [
          'error',
          {
            default: 'disallow',
            message:
              'Dependencies point inward: api → application → domain, infrastructure → application. Only main.ts builds infrastructure and hands the use cases to api/. An application feature imports no other feature; what two features use goes in application/shared/.',
            policies: [
              { from: layer('domain'), allow: { to: layer('domain') } },
              { from: layer('application'), allow: { to: [layer('domain'), sameFeature, sharedFeature] } },
              { from: layer('infrastructure'), allow: { to: layer('domain', 'application', 'infrastructure') } },
              { from: layer('api'), allow: { to: layer('domain', 'application', 'api') } },
            ],
          },
        ],
        // Without this, code that ignores the layout (everything flat in src/) passes every dependency rule.
        'boundaries/no-unknown-files': 'error',
      },
    },
    {
      name: 'clean-architecture/core-knows-no-framework',
      files: core,
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                regex: PACKAGE_OR_NODE_MODULE,
                message: 'domain/ and application/ import no package and no Node API. Receive the value (id, clock, file content) from the caller, or call an interface declared in application/ and implemented under infrastructure/.',
              },
            ],
          },
        ],
        'no-restricted-globals': [
          'error',
          ...['process', 'fetch', 'require', 'Buffer'].map((name) => ({
            name,
            message: `domain/ and application/ do not touch ${name}. Receive what you need from the caller, or call an interface implemented under infrastructure/.`,
          })),
        ],
      },
    },
  ]
}
