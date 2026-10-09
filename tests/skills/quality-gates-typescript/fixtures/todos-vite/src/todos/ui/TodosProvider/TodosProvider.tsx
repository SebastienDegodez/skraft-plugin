import type { PropsWithChildren } from 'react'

import { TodosContext, type TodosUseCases } from '../TodosContext/TodosContext'

type TodosProviderProps = PropsWithChildren<{
  useCases: TodosUseCases
}>

export const TodosProvider = ({ useCases, children }: TodosProviderProps) => (
  <TodosContext value={useCases}>{children}</TodosContext>
)
