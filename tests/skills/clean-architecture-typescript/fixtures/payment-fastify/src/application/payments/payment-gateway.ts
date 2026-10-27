import type { AuthorizationOutcome } from '../../domain/payments/authorization-outcome.js'
import type { Money } from '../../domain/payments/money.js'

export interface PaymentGateway {
  authorize(reference: string, amount: Money): Promise<AuthorizationOutcome>
}
