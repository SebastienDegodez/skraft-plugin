import { describe, expect, it } from 'vitest'

import { ListTodos } from '../../../../src/todos/application/ListTodos'
import { InMemoryTodoGateway } from '../InMemoryTodoGateway'

describe('ListTodos', () => {
  it('should describe each todo as open or done', async () => {
    const listTodos = new ListTodos(
      new InMemoryTodoGateway([
        { id: '1', title: 'Buy milk', done: false },
        { id: '2', title: 'Pay rent', done: true },
      ]),
    )

    expect(await listTodos.execute()).toEqual([
      { id: '1', title: 'Buy milk', status: 'open' },
      { id: '2', title: 'Pay rent', status: 'done' },
    ])
  })
})
