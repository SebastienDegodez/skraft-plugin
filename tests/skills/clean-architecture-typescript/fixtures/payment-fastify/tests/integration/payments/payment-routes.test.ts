import { describe, expect, it } from 'vitest'
import { buildServer } from '../../../src/api/server.js'
import { AuthorizePayment } from '../../../src/application/payments/authorize-payment.js'
import { InMemoryPaymentGateway } from '../../unit/payments/in-memory-payment-gateway.js'

const serverAnswering = (outcome: 'approved' | 'declined') =>
  buildServer({ authorizePayment: new AuthorizePayment(new InMemoryPaymentGateway(outcome)) })

describe('POST /payments/:reference/authorizations', () => {
  it('should answer the outcome of the authorization', async () => {
    const response = await serverAnswering('approved').inject({
      method: 'POST',
      url: '/payments/pay-1/authorizations',
      payload: { amount: 42.5, currency: 'EUR' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ outcome: 'approved' })
  })

  it('should answer 422 for an amount that is not positive', async () => {
    const response = await serverAnswering('approved').inject({
      method: 'POST',
      url: '/payments/pay-1/authorizations',
      payload: { amount: 0, currency: 'EUR' },
    })

    expect(response.statusCode).toBe(422)
  })
})
