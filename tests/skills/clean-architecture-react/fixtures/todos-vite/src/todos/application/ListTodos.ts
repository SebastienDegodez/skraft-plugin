import type { TodoGateway } from './TodoGateway'
import type { TodoViewModel } from './TodoViewModel'

export class ListTodos {
  private readonly todos: TodoGateway

  constructor(todos: TodoGateway) {
    this.todos = todos
  }

  async execute(signal?: AbortSignal): Promise<TodoViewModel[]> {
    const records = await this.todos.list(signal)
    return records.map((record) => ({
      id: record.id,
      title: record.title,
      status: record.done ? 'done' : 'open',
    }))
  }
}
