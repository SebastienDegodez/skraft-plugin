from typing import Protocol


class ReceiptStore(Protocol):
    """Outbound store keeping one receipt per authorization attempt."""

    def save(self, reference: str, body: str) -> None: ...
