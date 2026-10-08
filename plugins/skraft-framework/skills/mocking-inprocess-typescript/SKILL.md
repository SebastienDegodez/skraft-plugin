---
name: mocking-inprocess-typescript
description: Use when the mocking-strategy-roster resolved (inprocess, TypeScript) — the override mocking strategy that replaces a downstream HTTP API with an in-process double (MSW answering at the network layer, or a hand-written gateway handed to the feature) in a Vitest integration test, instead of a Microcks container. Emits mock wiring only; the business TDD cycle stays with the software-engineer lead.
---

# Mocking — In-process x TypeScript adapter (override)

Replaces a downstream HTTP API the code under test calls with an in-process double in a Vitest
integration test. Selected when the operator overrides the Microcks default.

Loaded ONLY when `mocking-strategy-roster` resolved `(inprocess, TypeScript)`. When no library
is named, the table below is ordered by priority: take the first row that fits and whose
package is already a devDependency; otherwise the first row that fits.

**Boundary:** mock wiring + integration-test scaffold only. No business TDD, no provider
contract verification.

## Libraries (table order = priority, top = highest)

| Priority | Library | Fits | Double |
|---|---|---|---|
| 1 | msw | the gateway calls through `fetch` (or a client built on it) | `setupServer(http.get(...))` answering at the network layer |
| 2 | fake | any gateway behind an application interface | a hand-written class implementing the gateway interface |

## Recipe — MSW (gateway test)

```ts
// tests/integration/{feature}/infrastructure/Http{Feature}Gateway.test.ts
// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { HttpRatesGateway } from '../../../../src/expenses/infrastructure/HttpRatesGateway'

const api = 'http://rates.test'
const server = setupServer(http.get(`${api}/rates/USD`, () => HttpResponse.json({ rate: 1.08 })))

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('HttpRatesGateway', () => {
  it('should read the rate the API returns', async () => {
    expect(await new HttpRatesGateway(api).rate('USD')).toBe(1.08)
  })

  it('should turn a 422 into the validation errors the form shows', async () => {
    server.use(http.post(`${api}/claims`, () => HttpResponse.json({ errors: { amount: 'Too high' } }, { status: 422 })))

    await expect(new HttpRatesGateway(api).submit({ amount: 9000 })).rejects.toMatchObject({ errors: { amount: 'Too high' } })
  })
})
```

A `fake` replaces the gateway object itself and is handed to the feature's provider:
`<ExpensesProvider useCases={{ submitClaim: new SubmitClaim(new FixedRates(1.08)) }}>`.

## Structured result back to the lead

Return, do not commit:

```yaml
strategy: inprocess
stack: typescript
library: msw | fake
files:
  - tests/integration/{feature}/infrastructure/Http{Feature}Gateway.test.ts
testCommand: <resolved via resolving-stack-commands>
notes: in-process double for the {downstream} API at the gateway boundary
```

## Rules

- Double the DOWNSTREAM API, never the feature's own use cases or components.
- MSW lives in `tests/integration`; `tests/unit` uses hand-written in-memory gateways and no
  `vi.mock` / `vi.fn` (G7).
- `onUnhandledRequest: 'error'`, so a call the test did not expect fails it.
- Use `resolving-stack-commands` for the test command — never hardcode `vitest`.
