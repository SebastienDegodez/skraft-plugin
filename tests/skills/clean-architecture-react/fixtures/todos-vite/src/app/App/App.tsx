import { TodoList } from '../../todos/ui/TodoList/TodoList'
import { TodosProvider } from '../../todos/ui/TodosProvider/TodosProvider'
import { createTodosUseCases } from '../composition'

const todos = createTodosUseCases('')

export const App = () => (
  <TodosProvider useCases={todos}>
    <main>
      <h1>Todos</h1>
      <TodoList />
    </main>
  </TodosProvider>
)
