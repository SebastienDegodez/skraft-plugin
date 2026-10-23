---
name: mocking-microcks-typescript
description: 'Use when a TypeScript, JavaScript or React component''s brief line says `mocking: microcks` (the component sets `"mocking": { "strategy": "microcks" }` in skraft-config.json) and a Vitest gateway integration test must mock a downstream HTTP API. Serves the API from its OpenAPI contract in a Microcks container (@microcks/microcks-testcontainers).'
---

# Mocking — Microcks x TypeScript

Serves the downstream API from its contract in a Microcks container and points the gateway
under test at the mock endpoint. Applies to a TypeScript, JavaScript or React component whose
brief line says `mocking: microcks`. Write mock wiring and the integration-test scaffold only;
provider contract verification belongs to `contract-testing`.

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

Files: `tests/integration/{feature}/infrastructure/Http{Feature}Gateway.test.ts`. The tests need Docker.

## Rules

- Mock the DOWNSTREAM API from its contract; never the feature's own use cases or components.
- One container per test file, started in `beforeAll` with a generous timeout and stopped in
  `afterAll`.
- Microcks stays out of `tests/unit` (G7).
