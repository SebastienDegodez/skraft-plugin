---
name: mocking-inprocess-typescript
description: 'Use when a TypeScript, JavaScript or React component''s brief line says `mocking: inprocess` (the default for a React front end) and a Vitest integration test must replace a downstream HTTP API with an in-process double: MSW at the network layer for a React front end''s targeted tests of its calls to the back end, or a hand-written gateway handed to the feature.'
---

# Mocking — In-process x TypeScript (default for React)

Replaces a downstream HTTP API the code under test calls with an in-process double in a Vitest
integration test. Applies only to a TypeScript, JavaScript or React component whose brief line
says `mocking: inprocess`: a React front end by default, whose targeted tests answer its calls to
the back end with MSW; its Playwright e2e run reaches the back end through Microcks
(`mocking-microcks-typescript`). Pick the library from the table below: for a React front end's
calls to the back end, MSW; otherwise the first row that fits and is already a devDependency,
else the first row that fits. Write mock wiring and the integration-test scaffold only.

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
- MSW answers the back end in `tests/integration`, and in the acceptance tests of a React front
  end's scenarios wherever they live (the front → back policy of targeted scenarios); any other
  test of `tests/unit` uses hand-written in-memory gateways. Never `vi.mock` / `vi.fn` (G7).
- A call the test did not expect fails it: `onUnhandledFrame: 'error'` from msw 3,
  `onUnhandledRequest: 'error'` below 3. Read the `msw` major in `package.json` after installing it.
