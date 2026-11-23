/**
 * Clean architecture for a React front end: one folder per feature, each split into layers.
 *
 *   src/app/                      entry wiring: providers, routes, the only place that builds infrastructure
 *   src/shared/                   code every feature may use (UI primitives, helpers); imports no feature
 *   src/<feature>/application/    use cases, view models, the gateway interfaces they call; no React, no HTTP
 *   src/<feature>/infrastructure/ implementations of those gateways (fetch, storage)
 *   src/<feature>/ui/             components and hooks; call use cases, never infrastructure
 *
 * Spread it after your own flat config. It adds the layer and component rules and nothing else:
 *
 *   import cleanArchitecture from './eslint/clean-architecture.js'
 *   export default [...yourConfig, ...cleanArchitecture({ root: 'src' })]
 *
 * Requires: eslint-plugin-boundaries@7, eslint-import-resolver-typescript, eslint-plugin-react,
 * eslint-plugin-jsx-a11y. Without the resolver, imports stay unresolved and every layer rule passes silently.
 * Pass `resolver: null` if your config already sets `settings['import/resolver']`.
 */
import path from 'node:path'

import boundaries from 'eslint-plugin-boundaries'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import react from 'eslint-plugin-react'

const DEFAULT_RESOLVER = { typescript: { alwaysTryTypes: true } }

/** Framework entry points sit at the root of `src` and belong to no layer. */
const DEFAULT_ENTRYPOINTS = ['main.tsx', 'main.ts', 'vite-env.d.ts']

const sameFeature = (...types) =>
  types.map((type) => ({ element: { type, captured: { feature: '{{ from.element.captured.feature }}' } } }))

const shared = { element: { type: 'shared' } }

/** A component or hook lives in a folder of its own name; a folder is imported by its file, never by a barrel. */
const componentFolder = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      folder: '{{ name }} must live in {{ name }}/{{ file }}: one folder per component or hook, holding its styles and sub-parts.',
      barrel: 'No index barrel: import the file itself ({{ dir }}/{{ dir }}).',
    },
  },
  create(context) {
    return {
      Program(node) {
        const file = context.filename.split(path.sep).join('/')
        const base = path.posix.basename(file)
        const name = base.replace(/\.(tsx|ts|jsx|js)$/, '')
        const dir = path.posix.basename(path.posix.dirname(file))
        if (name === 'index') {
          context.report({ node, messageId: 'barrel', data: { dir } })
          return
        }
        const isComponent = /\.(tsx|jsx)$/.test(base)
        const isHook = /^use[A-Z]/.test(name)
        if ((isComponent || isHook) && dir !== name) context.report({ node, messageId: 'folder', data: { name, file: base } })
      },
    }
  },
}

export default function cleanArchitecture({
  root = 'src',
  resolver = DEFAULT_RESOLVER,
  entrypoints = DEFAULT_ENTRYPOINTS,
} = {}) {
  const sources = `${root}/**/*.{ts,tsx,js,jsx}`
  const ignored = entrypoints.map((file) => `${root}/${file}`)
  const inner = [`${root}/*/application/**/*.{ts,tsx,js,jsx}`]

  return [
    {
      name: 'clean-architecture/layers',
      files: [sources],
      plugins: { boundaries },
      settings: {
        ...(resolver ? { 'import/resolver': resolver } : {}),
        'boundaries/include': [`${root}/**/*`],
        'boundaries/ignore': ignored,
        'boundaries/elements': [
          { type: 'app', pattern: `${root}/app`, partialMatch: false },
          { type: 'shared', pattern: `${root}/shared`, partialMatch: false },
          { type: 'application', pattern: `${root}/*/application`, capture: ['feature'], partialMatch: false },
          { type: 'infrastructure', pattern: `${root}/*/infrastructure`, capture: ['feature'], partialMatch: false },
          { type: 'ui', pattern: `${root}/*/ui`, capture: ['feature'], partialMatch: false },
        ],
      },
      rules: {
        'boundaries/dependencies': [
          'error',
          {
            default: 'disallow',
            message:
              'A feature never imports another feature, and inside a feature dependencies point inward: ui → application, infrastructure → application. Only app/ builds infrastructure and wires it in; what several features need goes in shared/.',
            policies: [
              { from: { element: { type: 'app' } }, allow: { to: { element: { type: ['app', 'shared', 'application', 'infrastructure', 'ui'] } } } },
              { from: { element: { type: 'shared' } }, allow: { to: shared } },
              { from: { element: { type: 'application' } }, allow: { to: sameFeature('application') } },
              { from: { element: { type: 'infrastructure' } }, allow: { to: [...sameFeature('application', 'infrastructure'), shared] } },
              { from: { element: { type: 'ui' } }, allow: { to: [...sameFeature('application', 'ui'), shared] } },
            ],
          },
        ],
        // Without this, code that ignores the layout (everything flat in src/) passes every dependency rule.
        'boundaries/no-unknown-files': 'error',
      },
    },
    {
      name: 'clean-architecture/application-knows-no-framework',
      files: inner,
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
                message: 'application/ runs without React. Return the state from the use case and keep it in a hook under ui/.',
              },
              {
                group: ['axios', 'ky', 'superagent', 'swr', '@tanstack/*', 'msw', 'msw/*'],
                message: 'HTTP and server-cache libraries belong to infrastructure/. Declare a gateway interface in application/ and implement it there.',
              },
            ],
          },
        ],
        'no-restricted-globals': [
          'error',
          ...['fetch', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB', 'window', 'document'].map((name) => ({
            name,
            message: `A use case does not touch ${name}. Call a gateway declared in application/ and implement it under infrastructure/.`,
          })),
        ],
      },
    },
    {
      name: 'clean-architecture/components',
      files: [sources],
      ignores: ignored,
      plugins: { react, 'jsx-a11y': jsxA11y, 'clean-architecture': { rules: { 'component-folder': componentFolder } } },
      settings: { react: { version: 'detect' } },
      rules: {
        ...jsxA11y.flatConfigs.recommended.rules,
        'clean-architecture/component-folder': 'error',
        'react/function-component-definition': ['error', { namedComponents: 'arrow-function', unnamedComponents: 'arrow-function' }],
        'react/no-multi-comp': ['error', { ignoreStateless: false }],
        'react/no-unstable-nested-components': 'error',
        'react/jsx-no-leaked-render': ['error', { validStrategies: ['ternary', 'coerce'] }],
        'react/no-array-index-key': 'error',
        'react/jsx-key': 'error',
        'react/jsx-no-useless-fragment': 'error',
        'no-nested-ternary': 'error',
        'no-restricted-syntax': [
          'error',
          { selector: 'ExportDefaultDeclaration', message: 'Export by name at the declaration: export const Name = …' },
        ],
      },
    },
  ]
}
