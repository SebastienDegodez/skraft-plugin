import { ErrorMessage } from '../../../shared/ui/ErrorMessage/ErrorMessage'
import { progress } from '../../application/progress'
import { TodoItem } from '../TodoItem/TodoItem'
import { useTodos } from '../useTodos/useTodos'

export const TodoList = () => {
  const state = useTodos()

  if (state.status === 'loading') return <p>Loading todos…</p>
  if (state.status === 'failed') return <ErrorMessage>The todos could not be loaded.</ErrorMessage>

  return (
    <section aria-label="Todos">
      <p>{progress(state.todos)}</p>
      {state.todos.length > 0 ? (
        <ul aria-label="Todo list">
          {state.todos.map((todo) => (
            <TodoItem key={todo.id} todo={todo} />
          ))}
        </ul>
      ) : null}
    </section>
  )
}
