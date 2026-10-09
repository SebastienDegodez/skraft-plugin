export type TodoRecord = {
  readonly id: string
  readonly title: string
  readonly done: boolean
}

/** The todos API owns the todos; this is how the application reaches it. */
export interface TodoGateway {
  list(signal?: AbortSignal): Promise<TodoRecord[]>
}
