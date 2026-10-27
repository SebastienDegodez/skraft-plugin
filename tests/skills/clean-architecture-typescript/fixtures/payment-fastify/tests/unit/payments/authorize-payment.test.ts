import { describe, expect, it } from 'vitest'
import { AuthorizePayment } from '../../../src/application/payments/authorize-payment.js'
import { InvalidAmount } from '../../../src/domain/payments/money.js'
import { InMemoryPaymentGateway } from './in-memory-payment-gateway.js'

describe('AuthorizePayment', () => {
  it('should answer what the provider decided', async () => {
    const gateway = new InMemoryPaymentGateway('declined')

    expect(await new AuthorizePayment(gateway).execute('pay-1', 42.5, 'eur')).toBe('declined')
    expect(gateway.requests.map(({ reference, amount }) => [reference, amount.amount, amount.currency])).toEqual([['pay-1', 42.5, 'EUR']])
  })

  it('should refuse a negative amount without asking the provider', async () => {
    const gateway = new InMemoryPaymentGateway('approved')

    await expect(new AuthorizePayment(gateway).execute('pay-1', -1, 'EUR')).rejects.toBeInstanceOf(InvalidAmount)
    expect(gateway.requests).toEqual([])
  })
})
