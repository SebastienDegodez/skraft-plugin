import type { TodoGateway, TodoRecord } from '../../../src/todos/application/TodoGateway'

export class InMemoryTodoGateway implements TodoGateway {
  private readonly records: TodoRecord[]

  constructor(records: TodoRecord[] = []) {
    this.records = [...records]
  }

  list(): Promise<TodoRecord[]> {
    return Promise.resolve([...this.records])
  }
}
