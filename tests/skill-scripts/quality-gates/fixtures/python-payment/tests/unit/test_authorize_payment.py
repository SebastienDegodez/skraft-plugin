from decimal import Decimal

from payment.application.authorize_payment import AuthorizePayment
from payment.domain.authorization_outcome import AuthorizationOutcome
from payment.domain.money import Money


class AlwaysAnswers:
    def __init__(self, outcome: AuthorizationOutcome) -> None:
        self._outcome = outcome

    def authorize(self, reference: str, amount: Money) -> AuthorizationOutcome:
        return self._outcome


class InMemoryReceiptStore:
    def __init__(self) -> None:
        self.saved: dict[str, str] = {}

    def save(self, reference: str, body: str) -> None:
        self.saved[reference] = body


def test_an_approved_payment_is_reported_as_approved() -> None:
    handler = AuthorizePayment(AlwaysAnswers(AuthorizationOutcome.APPROVED), InMemoryReceiptStore())

    outcome = handler.handle("ORD-1", Money(Decimal("42.50"), "eur"))

    assert outcome is AuthorizationOutcome.APPROVED


def test_every_attempt_leaves_a_receipt_of_the_decision() -> None:
    receipts = InMemoryReceiptStore()
    handler = AuthorizePayment(AlwaysAnswers(AuthorizationOutcome.DECLINED), receipts)

    handler.handle("ORD-2", Money(Decimal("10"), "EUR"))

    assert receipts.saved == {"ORD-2": "EUR 10 -> DECLINED"}
