import { ListTodos } from '../todos/application/ListTodos'
import { HttpTodoGateway } from '../todos/infrastructure/HttpTodoGateway'
import type { TodosUseCases } from '../todos/ui/TodosContext/TodosContext'

/** The only place that builds infrastructure: every feature receives its use cases from here. */
export const createTodosUseCases = (apiBaseUrl: string): TodosUseCases => {
  const todos = new HttpTodoGateway(apiBaseUrl)
  return { listTodos: new ListTodos(todos) }
}
