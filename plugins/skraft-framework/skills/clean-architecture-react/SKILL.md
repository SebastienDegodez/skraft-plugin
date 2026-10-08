---
name: clean-architecture-react
description: Use when laying out or extending a React / TypeScript front end — which folder a screen, component, hook, use case or API call belongs in, which folder may import which, and how a component reaches the API. Not for build, dependency, environment-variable or tooling configuration.
---

# Clean Architecture — React

Business rules live in the backend: the front end has no domain layer. It sends the request, shows the answer, and shows the refusal.

## One folder per feature, split into layers

| Folder | Holds | May import |
|---|---|---|
| `src/<feature>/application/` | use cases (one class per action), `*ViewModel` types, the `*Gateway` interfaces they call | its own `application/` |
| `src/<feature>/infrastructure/` | the gateways: `fetch`, storage | its own `application/`, `src/shared/` |
| `src/<feature>/ui/` | components and hooks | its own `application/` and `ui/`, `src/shared/` |
| `src/shared/` | UI primitives and helpers several features use | `src/shared/` |
| `src/app/` | providers, routes, the only code that builds the gateways and hands the use cases to each feature | everything |

- A feature never imports another feature; what two features need moves to `src/shared/`.
- `application/` uses no React, no `fetch`, no browser API.
- A component reaches its use cases through a hook of its feature that reads a context; `src/app/` provides the value.
- The API owns the data, so the interface is a `*Gateway`. Call it a `*Repository` only when the browser owns the data (an offline store).
- A use case never re-checks a rule the API enforces. The gateway turns the API's refusal (409, 422) into a typed result or error that the component shows.

## Components

- One component per file, in a folder of its own name: `ui/ExpenseForm/ExpenseForm.tsx`, beside its CSS module and its sub-components. Pages, hooks and `App` too: `ui/useExpenses/useExpenses.ts`, `app/App/App.tsx`. No `index.ts` barrel.
- Declare `type <Name>Props` above the component and export it by name at the declaration: `export const ExpenseForm = ({ … }: ExpenseFormProps) => …`. No default export, no `FC`, no component declared inside another.

## Guard

Copy [eslint/clean-architecture.js](eslint/clean-architecture.js) into the project, spread it at the end of `eslint.config.js`, and add the dev dependencies it needs to `package.json`:

```js
import cleanArchitecture from './eslint/clean-architecture.js'

export default [...yourConfig, ...cleanArchitecture({ root: 'src' })]
```

```sh
npm i -D eslint-plugin-boundaries eslint-import-resolver-typescript eslint-plugin-react eslint-plugin-jsx-a11y
```

The lint then fails on a feature importing another, a layer pointing outward, a file outside the layout, two components in one file, a component outside its folder, a default export, and the accessibility rules of `jsx-a11y`. Tests follow `clean-architecture-testing` (`references/examples-react.md`).
