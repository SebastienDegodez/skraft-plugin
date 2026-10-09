import { useEffect, useState } from 'react'

import type { TodoViewModel } from '../../application/TodoViewModel'
import { useTodosUseCases } from '../useTodosUseCases/useTodosUseCases'

export type TodosState =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly todos: TodoViewModel[] }
  | { readonly status: 'failed' }

export const useTodos = (): TodosState => {
  const { listTodos } = useTodosUseCases()
  const [state, setState] = useState<TodosState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    listTodos.execute(controller.signal).then(
      (todos) => setState({ status: 'loaded', todos }),
      () => {
        if (!controller.signal.aborted) setState({ status: 'failed' })
      },
    )
    return () => controller.abort()
  }, [listTodos])

  return state
}
