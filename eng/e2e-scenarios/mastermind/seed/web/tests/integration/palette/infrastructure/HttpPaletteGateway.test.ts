// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { HttpPaletteGateway } from '../../../../src/palette/infrastructure/HttpPaletteGateway'

const api = 'http://api.test'
const server = setupServer(http.get(`${api}/api/couleurs`, () => HttpResponse.json({ couleurs: ['rouge', 'vert'] })))

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('HttpPaletteGateway', () => {
  it('lit les couleurs que l’API répond', async () => {
    expect(await new HttpPaletteGateway(api).couleurs()).toEqual(['rouge', 'vert'])
  })

  it('échoue quand l’API répond une erreur', async () => {
    server.use(http.get(`${api}/api/couleurs`, () => new HttpResponse(null, { status: 503 })))

    await expect(new HttpPaletteGateway(api).couleurs()).rejects.toThrow('GET /api/couleurs a répondu 503')
  })
})
