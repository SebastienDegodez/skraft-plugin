from typing import Protocol

from payment.domain.authorization_outcome import AuthorizationOutcome
from payment.domain.money import Money


class PaymentGateway(Protocol):
    """Outbound gateway to the payment provider."""

    def authorize(self, reference: str, amount: Money) -> AuthorizationOutcome: ...
