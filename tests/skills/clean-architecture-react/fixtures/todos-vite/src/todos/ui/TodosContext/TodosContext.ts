import { createContext } from 'react'

import type { ListTodos } from '../../application/ListTodos'

export type TodosUseCases = {
  readonly listTodos: ListTodos
}

export const TodosContext = createContext<TodosUseCases | null>(null)
