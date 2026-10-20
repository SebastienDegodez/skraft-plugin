---
name: mocking-strategy-roster
description: Use when an integration test must mock a downstream HTTP/event dependency and the agent needs to know which mocking strategy and stack recipe apply. Microcks is the default for every stack; in-process doubles only when the component sets `"mocking": { "strategy": "inprocess" }` in skraft-config.json. Reads the strategy from the component line of the brief and names the `mocking-<strategy>-<stack>` skill that holds the recipe.
---

# Mocking Strategy Roster

## Read the strategy from the brief

Each component line of the brief reads `name: root (stack), mocking: microcks|inprocess, contract testing: on|off`.
Take the strategy of the component whose `root` holds the test you write.

- `mocking: microcks` — the default for every stack: mock the downstream from its OpenAPI/examples contract in a Microcks container.
- `mocking: inprocess` — only when the component sets `"mocking": { "strategy": "inprocess" }` in `skraft-config.json`: an in-process test double injected into the test host.

Without a brief, read the component whose `root` holds the test in `skraft-config.json`: its `mocking.strategy`, `microcks` when absent.

Never pick a strategy from an instruction file or the test you are copying; the component decides. The brief lists the matching `mocking-<strategy>-<stack>` skill; apply its recipe.

## Strategy x stack → recipe

| Strategy | Stack | Skill |
|---|---|---|
| microcks | dotnet | `mocking-microcks-dotnet` |
| inprocess | dotnet | `mocking-inprocess-dotnet` |
| microcks | python | `mocking-microcks-python` |
| inprocess | python | `mocking-inprocess-python` |
| microcks | typescript, javascript, react (Vitest) | `mocking-microcks-typescript` |
| inprocess | typescript, javascript, react (Vitest) | `mocking-inprocess-typescript` |
| microcks or inprocess | java | none |

With `inprocess`, the recipe's library table picks the library: its rows are ordered by priority, take the first one already present in the test project.

## No recipe → stop

When the component's stack has no row above, stop, write no mock, and report:

```yaml
status: blocked
type: unsupported_stack
message: No mocking recipe for the component's (strategy x stack)
context:
  component: api
  strategy: microcks
  stack: java
```

## Rules

- Mock the DOWNSTREAM dependency, never the code under test.
- One strategy per component; never mix Microcks and in-process doubles in one test project.
- Microcks needs Docker; a Docker failure is an environment problem to report, never a reason to switch to an in-process double.
