import type { TodoViewModel } from '../../application/TodoViewModel'

type TodoItemProps = {
  todo: TodoViewModel
}

export const TodoItem = ({ todo }: TodoItemProps) => (
  <li>
    {todo.title}
    {todo.status === 'done' ? ' (done)' : null}
  </li>
)
