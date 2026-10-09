// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { HttpTodoGateway } from '../../../../src/todos/infrastructure/HttpTodoGateway'

const api = 'http://api.test'
const server = setupServer(
  http.get(`${api}/api/todos`, () => HttpResponse.json([{ id: '1', title: 'Buy milk', done: false }])),
)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('HttpTodoGateway', () => {
  it('should read the todos the API returns', async () => {
    expect(await new HttpTodoGateway(api).list()).toEqual([{ id: '1', title: 'Buy milk', done: false }])
  })

  it('should fail when the API answers an error', async () => {
    server.use(http.get(`${api}/api/todos`, () => new HttpResponse(null, { status: 500 })))

    await expect(new HttpTodoGateway(api).list()).rejects.toThrow('500')
  })
})
