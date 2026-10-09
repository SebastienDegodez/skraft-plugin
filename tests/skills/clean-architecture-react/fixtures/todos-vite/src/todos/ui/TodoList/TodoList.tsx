import { ErrorMessage } from '../../../shared/ui/ErrorMessage/ErrorMessage'
import { TodoItem } from '../TodoItem/TodoItem'
import { useTodos } from '../useTodos/useTodos'

export const TodoList = () => {
  const state = useTodos()

  if (state.status === 'loading') return <p>Loading todos…</p>
  if (state.status === 'failed') return <ErrorMessage>The todos could not be loaded.</ErrorMessage>

  return state.todos.length > 0 ? (
    <ul aria-label="Todos">
      {state.todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </ul>
  ) : (
    <p>No todos yet.</p>
  )
}
