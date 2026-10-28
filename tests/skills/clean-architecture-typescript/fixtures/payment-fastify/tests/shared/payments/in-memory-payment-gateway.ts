import type { PaymentGateway } from '../../../src/application/payments/payment-gateway.js'
import type { AuthorizationOutcome } from '../../../src/domain/payments/authorization-outcome.js'
import type { Money } from '../../../src/domain/payments/money.js'

export class InMemoryPaymentGateway implements PaymentGateway {
  readonly requests: { reference: string; amount: Money }[] = []

  constructor(private readonly outcome: AuthorizationOutcome) {}

  async authorize(reference: string, amount: Money): Promise<AuthorizationOutcome> {
    this.requests.push({ reference, amount })
    return this.outcome
  }
}
