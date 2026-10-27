import type { AuthorizationOutcome } from '../../domain/payments/authorization-outcome.js'
import { Money } from '../../domain/payments/money.js'
import type { PaymentGateway } from './payment-gateway.js'

/** Asks the provider to authorize one payment and answers what it decided. */
export class AuthorizePayment {
  constructor(private readonly gateway: PaymentGateway) {}

  async execute(reference: string, amount: number, currency: string): Promise<AuthorizationOutcome> {
    return this.gateway.authorize(reference, Money.of(amount, currency))
  }
}
