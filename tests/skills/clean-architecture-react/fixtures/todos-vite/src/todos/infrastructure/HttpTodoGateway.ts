import type { TodoGateway, TodoRecord } from '../application/TodoGateway'

export class HttpTodoGateway implements TodoGateway {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async list(signal?: AbortSignal): Promise<TodoRecord[]> {
    const response = await fetch(`${this.baseUrl}/api/todos`, { signal })
    if (!response.ok) throw new Error(`GET /api/todos answered ${response.status}`)
    return (await response.json()) as TodoRecord[]
  }
}
