import type { PaymentGateway } from '../../application/payments/payment-gateway.js'
import type { AuthorizationOutcome } from '../../domain/payments/authorization-outcome.js'
import type { Money } from '../../domain/payments/money.js'

/**
 * Talks to the provider's REST API: POST /v1/authorizations with the reference, amount and currency.
 * It answers 200 with {"status": "approved" | "declined"}, and 402 when it refuses the request outright.
 */
export class HttpPaymentGateway implements PaymentGateway {
  constructor(private readonly baseUrl: string) {}

  async authorize(reference: string, amount: Money): Promise<AuthorizationOutcome> {
    const response = await fetch(new URL('/v1/authorizations', this.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reference, amount: amount.amount, currency: amount.currency }),
    })
    if (response.status === 402) return 'declined'
    if (!response.ok) throw new Error(`Payment provider answered ${response.status}`)
    const body = (await response.json()) as { status?: string }
    return body.status === 'approved' ? 'approved' : 'declined'
  }
}
