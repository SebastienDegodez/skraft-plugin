from typing import final

from payment.application.payment_gateway import PaymentGateway
from payment.application.receipt_store import ReceiptStore
from payment.domain.authorization_outcome import AuthorizationOutcome
from payment.domain.money import Money


@final  # pragma: no mutate -- typing.final has no runtime effect
class AuthorizePayment:
    """Authorizes one payment and keeps a receipt of what the provider answered."""

    def __init__(self, gateway: PaymentGateway, receipts: ReceiptStore) -> None:
        self._gateway = gateway
        self._receipts = receipts

    def handle(self, reference: str, amount: Money) -> AuthorizationOutcome:
        outcome = self._gateway.authorize(reference, amount)
        self._receipts.save(reference, f"{amount.currency} {amount.amount} -> {outcome.name}")
        return outcome
