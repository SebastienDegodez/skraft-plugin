from decimal import Decimal

from payment.application.authorize_payment import AuthorizePayment
from payment.domain.authorization_outcome import AuthorizationOutcome
from payment.domain.money import Money
from tests.unit.test_authorize_payment import AlwaysAnswers, InMemoryReceiptStore


def test_a_receipt_names_the_amount_then_the_outcome() -> None:
    receipts = InMemoryReceiptStore()

    AuthorizePayment(AlwaysAnswers(AuthorizationOutcome.APPROVED), receipts).handle("ORD-3", Money(Decimal("5"), "EUR"))

    assert receipts.saved["ORD-3"] == "5 EUR -> APPROVED"
