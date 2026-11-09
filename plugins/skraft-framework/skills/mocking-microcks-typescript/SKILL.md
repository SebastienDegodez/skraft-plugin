---
name: mocking-microcks-typescript
description: 'Use when a TypeScript, JavaScript or React component''s brief line says `mocking: microcks` (the default for TypeScript and JavaScript), or a React front end''s Playwright e2e run needs its back end, and a test must mock a downstream HTTP API. Serves the API from its OpenAPI contract in one Microcks uber native container per test session (@microcks/microcks-testcontainers), started in Vitest''s or Playwright''s global setup, on Docker or Podman.'
---

# Mocking — Microcks x TypeScript (default, React excepted)

Serves the downstream API from its contract in a Microcks container and points the code under
test at the mock endpoint. Applies to a TypeScript, JavaScript or React component whose brief
line says `mocking: microcks`, in every test the infrastructure policy runs the external gateway
on Microcks, and to a React front end's Playwright e2e run, whose back end Microcks serves. Write
mock wiring and the test scaffold only; provider contract verification belongs to
`contract-testing`.

## Prerequisites

- devDependency `@microcks/microcks-testcontainers` (0.3.x, which brings `testcontainers`).
- The downstream contract (OpenAPI, plus `.apiexamples` when the examples live apart) under
  `contracts/` or the location the `contract-testing` skill chose.

## Recipe — Vitest, one container per test session

```ts
// tests/global-setup.ts
import path from 'node:path'

import { MicrocksContainer } from '@microcks/microcks-testcontainers'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext { ratesApi: string }
}

export default async function setup(project: TestProject) {
  const microcks = await new MicrocksContainer('quay.io/microcks/microcks-uber:1.14.0-native')
    .withMainArtifacts([path.resolve('contracts/rates-openapi.yaml')])
    .start()
  project.provide('ratesApi', microcks.getRestMockEndpoint('Rates API', '1.0.0'))
  return async () => { await microcks.stop() }
}
```

`vitest.config.ts`: `test: { globalSetup: ['tests/global-setup.ts'] }`.
A test reads the endpoint with `inject`:

```ts
// tests/unit/{feature}/... or tests/integration/{feature}/infrastructure/Http{Feature}Gateway.test.ts
import { expect, inject, it } from 'vitest'

import { HttpRatesGateway } from '../../../../src/expenses/infrastructure/HttpRatesGateway'

it('should read the rate the contract example returns', async () => {
  expect(await new HttpRatesGateway(inject('ratesApi')).rate('USD')).toBe(1.08)
})
```

`getRestMockEndpoint(<info.title>, <info.version>)` takes the title and version of the
OpenAPI document. Each example in the contract is one answer the mock gives: add a contract
example for every case the gateway must handle (a 422, a 409), never a handler in the test.

## Recipe — Playwright e2e of a React front end

Playwright starts its `webServer` before its `globalSetup`: start the front end from the global
setup, once Microcks answers, with the mock endpoint in its environment.

```ts
// tests/e2e/global-setup.ts
import { spawn } from 'node:child_process'
import path from 'node:path'

import { MicrocksContainer } from '@microcks/microcks-testcontainers'

const FRONT = 'http://localhost:5173'

export default async function globalSetup() {
  const microcks = await new MicrocksContainer('quay.io/microcks/microcks-uber:1.14.0-native')
    .withMainArtifacts([path.resolve('contracts/claims-openapi.yaml')])
    .start()
  const front = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), '--port', '5173', '--strictPort'], {
    env: { ...process.env, VITE_API_URL: microcks.getRestMockEndpoint('Claims API', '1.0.0') },
    stdio: 'inherit',
  })
  await until(FRONT)
  return async () => { front.kill(); await microcks.stop() }
}

const until = async (url: string) => {
  for (let tries = 0; tries < 120; tries += 1) {
    if (await fetch(url).then(() => true, () => false)) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`${url} did not answer`)
}
```

`playwright.config.ts`: `globalSetup: './tests/e2e/global-setup.ts'`, `use: { baseURL: 'http://localhost:5173' }`, no `webServer`.

## Docker or Podman

Testcontainers finds Docker by itself. Podman is reached once the developer sets, outside the
tests:

| OS | Podman |
|---|---|
| macOS | `podman machine start`; `DOCKER_HOST` = `unix://` + the path `podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}'` prints; `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock` |
| Linux | `systemctl --user enable --now podman.socket`; `DOCKER_HOST` = `unix://` + the path `podman info --format '{{.Host.RemoteSocket.Path}}'` prints |
| Windows | `podman machine start`; `DOCKER_HOST=npipe:////./pipe/podman-machine-default` |

Rootless Podman: `TESTCONTAINERS_RYUK_DISABLED=true`; rootful: `TESTCONTAINERS_RYUK_PRIVILEGED=true`.

## Rules

- Mock the DOWNSTREAM API from its contract; never the feature's own use cases or components.
- One Microcks container per test session, started in the global setup and stopped by the
  function it returns; never one per test file.
- No Docker or Podman answers: never skip the test, never put MSW or a fake in its place; let the
  container start fail and stop, blocked, naming the component (the scenario is INDETERMINATE).
