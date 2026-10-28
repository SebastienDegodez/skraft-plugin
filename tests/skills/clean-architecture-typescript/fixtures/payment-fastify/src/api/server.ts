import Fastify, { type FastifyInstance } from 'fastify'
import type { AuthorizePayment } from '../application/payments/authorize-payment.js'
import { InvalidAmount } from '../domain/payments/money.js'

export type UseCases = {
  authorizePayment: AuthorizePayment
}

type AuthorizationRequest = { Params: { reference: string }; Body: { amount: number; currency: string } }

export const buildServer = ({ authorizePayment }: UseCases): FastifyInstance => {
  const server = Fastify()

  server.post<AuthorizationRequest>('/payments/:reference/authorizations', async (request, reply) => {
    try {
      const outcome = await authorizePayment.execute(request.params.reference, request.body.amount, request.body.currency)
      return { outcome }
    } catch (error) {
      if (error instanceof InvalidAmount) return reply.code(422).send({ error: error.message })
      throw error
    }
  })

  return server
}
