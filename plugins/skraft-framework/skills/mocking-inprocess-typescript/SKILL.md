---
name: mocking-inprocess-typescript
description: 'Use when a TypeScript, JavaScript or React component''s brief line says `mocking: inprocess` (the default for these stacks) and a Vitest integration test must replace a downstream HTTP API with an in-process double (MSW at the network layer, or a hand-written gateway handed to the feature).'
---

# Mocking — In-process x TypeScript (default)

Replaces a downstream HTTP API the code under test calls with an in-process double in a Vitest
integration test. Applies only to a TypeScript, JavaScript or React component whose brief line
says `mocking: inprocess`. Pick the library from the table below: the first row that fits and
is already a devDependency; otherwise the first row that fits. Write mock wiring and the
integration-test scaffold only.

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

beforeAll(() => server.listen({ onUnhandledFrame: 'error' })) // msw 2: onUnhandledRequest
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

Files: `tests/integration/{feature}/infrastructure/Http{Feature}Gateway.test.ts`.

## Rules

- Double the DOWNSTREAM API, never the feature's own use cases or components.
- MSW lives in `tests/integration`; `tests/unit` uses hand-written in-memory gateways and no
  `vi.mock` / `vi.fn` (G7).
- A call the test did not expect fails it: `onUnhandledFrame: 'error'` from msw 3,
  `onUnhandledRequest: 'error'` below 3. Read the `msw` major in `package.json` after installing it.
