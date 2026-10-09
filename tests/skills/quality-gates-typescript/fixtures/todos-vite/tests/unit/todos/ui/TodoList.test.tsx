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

    expect(await screen.findByRole('list', { name: 'Todo list' })).toHaveTextContent('Buy milk')
  })
})
