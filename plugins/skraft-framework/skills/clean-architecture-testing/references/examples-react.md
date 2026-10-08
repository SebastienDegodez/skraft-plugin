# Clean Architecture Testing — React (Vitest)

Runnable examples per layer. Roles and doubles follow the tables in `SKILL.md`; only the
libraries differ: Vitest, hand-written in-memory gateways, Testing Library, MSW, ESLint.
A React front end has no domain layer (`clean-architecture-react`), so `tests/unit/` holds
use-case and component tests.

```text
src/<feature>/{application,infrastructure,ui}/, src/app/, src/shared/
tests/unit/<feature>/          <- use cases and components, in-memory gateways, no network
tests/integration/<feature>/   <- gateways against MSW
```

Every test file imports `describe`, `it` and `expect` from `vitest`, groups its cases in one
`describe` (two levels at most) and names each case `it('should …')`. `vitest.config` (or the
`test` block of `vite.config.ts`) runs `tests/setup.ts`, which loads the jest-dom matchers and
calls `cleanup()` after each test.

## Application — acceptance test (default layer)

No mocking library in `tests/unit/`: no `vi.mock`, `vi.fn` or `vi.spyOn`. A gateway double is
a class holding an array, implementing the interface the use case calls; a callback prop gets a
plain function that records its calls.

```ts
// tests/unit/todos/InMemoryTodoGateway.ts
import type { TodoGateway, TodoRecord } from '../../../src/todos/application/TodoGateway'

export class InMemoryTodoGateway implements TodoGateway {
  private readonly records: TodoRecord[]

  constructor(records: TodoRecord[] = []) {
    this.records = [...records]
  }

  list(): Promise<TodoRecord[]> {
    return Promise.resolve([...this.records])
  }
}
```

```ts
// tests/unit/todos/application/ListTodos.test.ts
import { describe, expect, it } from 'vitest'

import { ListTodos } from '../../../../src/todos/application/ListTodos'
import { InMemoryTodoGateway } from '../InMemoryTodoGateway'

describe('ListTodos', () => {
  it('should describe each todo as open or done', async () => {
    const listTodos = new ListTodos(new InMemoryTodoGateway([{ id: '1', title: 'Pay rent', done: true }]))

    expect(await listTodos.execute()).toEqual([{ id: '1', title: 'Pay rent', status: 'done' }])
  })
})
```

## UI — component test through its provider

Render the component inside the feature's provider with real use cases over an in-memory
gateway. Query by role and accessible name, act with `userEvent`, assert what the user sees.
Never `getByTestId`, never a snapshot.

```tsx
// tests/unit/todos/ui/TodoList.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ListTodos } from '../../../../src/todos/application/ListTodos'
import { TodoList } from '../../../../src/todos/ui/TodoList/TodoList'
import { TodosProvider } from '../../../../src/todos/ui/TodosProvider/TodosProvider'
import { InMemoryTodoGateway } from '../InMemoryTodoGateway'

describe('TodoList', () => {
  it('should list the todos by title', async () => {
    const listTodos = new ListTodos(new InMemoryTodoGateway([{ id: '1', title: 'Buy milk', done: false }]))

    render(
      <TodosProvider useCases={{ listTodos }}>
        <TodoList />
      </TodosProvider>,
    )

    expect(await screen.findByRole('list', { name: 'Todos' })).toHaveTextContent('Buy milk')
  })
})
```

An error the API returns is tested the same way: the in-memory gateway rejects with the
gateway's error type, and the test asserts the message with `findByRole('alert')` or
`toHaveAccessibleErrorMessage`.

## Infrastructure — gateway against MSW

The HTTP gateway is the only code that calls `fetch`. MSW answers in place of the API, with
`onUnhandledRequest: 'error'` so an unexpected call fails the test.

```ts
// tests/integration/todos/infrastructure/HttpTodoGateway.test.ts
// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { HttpTodoGateway } from '../../../../src/todos/infrastructure/HttpTodoGateway'

const api = 'http://api.test'
const server = setupServer(http.get(`${api}/api/todos`, () => HttpResponse.json([{ id: '1', title: 'Buy milk', done: false }])))

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('HttpTodoGateway', () => {
  it('should fail when the API answers an error', async () => {
    server.use(http.get(`${api}/api/todos`, () => new HttpResponse(null, { status: 500 })))

    await expect(new HttpTodoGateway(api).list()).rejects.toThrow('500')
  })
})
```

A refusal the API owns (409, 422) gets its own case: the gateway turns it into the typed
result or error the use case returns, never into a generic failure.

## Architecture guard

The layer, feature and component rules live in the ESLint config of `clean-architecture-react`.
The guard is the lint itself (`eslint . --max-warnings 0`), run as a quality gate beside the
tests; no test re-implements it.
