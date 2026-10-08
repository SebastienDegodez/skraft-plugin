---
name: mocking-microcks-typescript
description: Use when the mocking-strategy-roster resolved (microcks, TypeScript) — the default mocking strategy that serves a downstream HTTP API from its OpenAPI contract in a Microcks container (@microcks/microcks-testcontainers) for a Vitest gateway integration test. Emits mock wiring only; the business TDD cycle stays with the software-engineer lead.
---

# Mocking — Microcks x TypeScript adapter (default)

Serves the downstream API from its contract in a Microcks container and points the gateway
under test at the mock endpoint. Loaded ONLY when `mocking-strategy-roster` resolved
`(microcks, TypeScript)`.

**Boundary:** mock wiring + integration-test scaffold only. No business TDD, no provider
contract verification.

## Prerequisites

- devDependency `@microcks/microcks-testcontainers` (0.3.x, which brings `testcontainers`);
  Docker reachable from the test run.
- The downstream contract (OpenAPI, plus `.apiexamples` when the examples live apart) under
  `contracts/` or the location the `contract-testing` skill chose.

## Recipe — gateway against the Microcks mock

```ts
// tests/integration/{feature}/infrastructure/Http{Feature}Gateway.test.ts
// @vitest-environment node
import path from 'node:path'

import { MicrocksContainer, type StartedMicrocksContainer } from '@microcks/microcks-testcontainers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { HttpRatesGateway } from '../../../../src/expenses/infrastructure/HttpRatesGateway'

let microcks: StartedMicrocksContainer

beforeAll(async () => {
  microcks = await new MicrocksContainer()
    .withMainArtifacts([path.resolve('contracts/rates-openapi.yaml')])
    .start()
}, 120_000)

afterAll(async () => {
  await microcks?.stop()
})

describe('HttpRatesGateway', () => {
  it('should read the rate the contract example returns', async () => {
    const gateway = new HttpRatesGateway(microcks.getRestMockEndpoint('Rates API', '1.0.0'))

    expect(await gateway.rate('USD')).toBe(1.08)
  })
})
```

`getRestMockEndpoint(<info.title>, <info.version>)` takes the title and version of the
OpenAPI document. Each example in the contract is one answer the mock gives: add a contract
example for every case the gateway must handle (a 422, a 409), never a handler in the test.

## Structured result back to the lead

Return, do not commit:

```yaml
strategy: microcks
stack: typescript
files:
  - tests/integration/{feature}/infrastructure/Http{Feature}Gateway.test.ts
testCommand: <resolved via resolving-stack-commands>
notes: Microcks mock of {downstream} from contracts/{file}
```

## Rules

- Mock the DOWNSTREAM API from its contract; never the feature's own use cases or components.
- One container per test file, started in `beforeAll` with a generous timeout and stopped in
  `afterAll`.
- Microcks stays out of `tests/unit` (G7).
- Use `resolving-stack-commands` for the test command — never hardcode `vitest`.
