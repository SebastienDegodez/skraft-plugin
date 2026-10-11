from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class Money:
    """An amount and the currency it is expressed in."""

    amount: Decimal
    currency: str

    def __post_init__(self) -> None:
        if self.amount <= 0:
            raise ValueError("An amount must be positive.")
        if not self.currency or not self.currency.strip():
            raise ValueError("A currency is required.")
        object.__setattr__(self, "currency", self.currency.upper())
