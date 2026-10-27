---
name: clean-architecture-typescript
description: Use when laying out or extending a Node / TypeScript back end (Fastify, Express or another HTTP framework), or adding a feature, route, use case, aggregate or repository to one — which folder a module belongs in, which folder may import which, and how a route reaches a use case. A React front end belongs to clean-architecture-react. Not for configuration, dependency or tooling changes.
---

# Clean Architecture — TypeScript back end

The layer rules are those of `architecture-patterns`. This skill maps them onto the folders of one Node package.

## One folder per layer

| Folder | Holds | May import |
|---|---|---|
| `src/domain/` | aggregates, value objects, domain events | `src/domain/` |
| `src/application/` | use cases and the interfaces they call | `src/domain/`, `src/application/` |
| `src/infrastructure/` | implementations of those interfaces (database, HTTP clients, files) | `src/domain/`, `src/application/`, `src/infrastructure/` |
| `src/api/` | HTTP routes and the function that builds the server from the use cases it receives | `src/domain/`, `src/application/`, `src/api/` |
| `src/main.ts` | the composition root: builds every class, hands the use cases to `src/api/`, starts listening | everything |

- One `package.json`, one `src/`. A new feature goes into the existing layer folders, never into a new top-level folder.
- Fastify, Express, database drivers, ORMs, HTTP clients, `process` and `node:` modules are imported only in `src/infrastructure/`, `src/api/` and `src/main.ts`. Domain and application import no npm package.
- `src/api/` never imports `src/infrastructure/`: only `src/main.ts` builds an implementation.
- Tests live in the two test folders `clean-architecture-testing` defines, never inside `src/`.

## Use cases

- A use case is a class named after the action (`BorrowBook`) with one public method. The route calls it directly: no interface in front of it, no `*Service` implementation.
- `src/api/` exports a function that takes the use cases and returns the server (`buildServer({ borrowBook })`), typed with the use case classes; a test hands it the use cases built on in-memory implementations.
- A command method returns `void` (or `Promise<void>`); the caller creates the new id and passes it in. A query returns a `*ViewModel` type defined in application, never a domain object.
- Application declares an interface only where it calls out (repository, gateway). A repository interface sits in domain when it persists an aggregate, in application otherwise.
- Who may *read* a resource is checked in the use case. Who may *change* it is an aggregate rule: the mutation method takes the caller's id and throws.
- The route validates the request body and maps a domain error to its HTTP status; the business rule stays in domain or the use case.
- Wire every class by hand in `src/main.ts`, reading `process.env` there. No DI container, no decorator.
- Inside domain, application and infrastructure, one folder per feature (`src/application/loans/borrow-book.ts`, `src/infrastructure/loans/postgres-loan-repository.ts`), never a technical folder (`repositories`, `services`, `models`, `controllers`). An application feature imports no other feature; what two features use moves to `src/application/shared/`.
- No `ports` or `adapters` folder, and no "port" in file, class or comment.

## Domain

- An aggregate is created through a static factory over a `private` constructor, and identified by a typed id (`OrderId`, a branded type or a class), never a raw `string` or `number`.

## Guard

Copy [eslint/clean-architecture.js](eslint/clean-architecture.js) into the project, spread it at the end of `eslint.config.js`, and add the dev dependencies it needs to `package.json`:

```js
import cleanArchitecture from './eslint/clean-architecture.js'

export default [...yourConfig, ...cleanArchitecture({ root: 'src' })]
```

```sh
npm i -D eslint-plugin-boundaries eslint-import-resolver-typescript
```

The lint then fails on a layer importing outward, `src/api/` importing infrastructure, an application feature importing another, a file outside the four layers and `src/main.ts`, and a framework, driver, HTTP client, Node API or `process` in domain or application.
