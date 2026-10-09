import { use } from 'react'

import { TodosContext, type TodosUseCases } from '../TodosContext/TodosContext'

export const useTodosUseCases = (): TodosUseCases => {
  const useCases = use(TodosContext)
  if (!useCases) throw new Error('useTodosUseCases must be called inside <TodosProvider>')
  return useCases
}
