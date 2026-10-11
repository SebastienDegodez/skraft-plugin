from decimal import Decimal

import pytest

from payment.domain.money import Money


@pytest.mark.parametrize("amount", [Decimal("0"), Decimal("-1")])
def test_an_amount_must_be_positive(amount: Decimal) -> None:
    with pytest.raises(ValueError):
        Money(amount, "EUR")


def test_the_smallest_positive_amount_is_accepted() -> None:
    assert Money(Decimal("0.01"), "eur").currency == "EUR"


@pytest.mark.parametrize("currency", ["", "  "])
def test_a_currency_is_required(currency: str) -> None:
    with pytest.raises(ValueError):
        Money(Decimal("1"), currency)


def test_money_is_immutable() -> None:
    money = Money(Decimal("1"), "EUR")
    with pytest.raises(AttributeError):
        money.amount = Decimal("2")  # type: ignore[misc]
