import type { TodoViewModel } from './TodoViewModel'

/** The line shown above the list: how far the user has got. */
export const progress = (todos: readonly TodoViewModel[]): string => {
  if (todos.length === 0) return 'Nothing to do'
  const done = todos.filter((todo) => todo.status === 'done').length
  if (done === todos.length) return 'All done'
  return `${done} of ${todos.length} done`
}
