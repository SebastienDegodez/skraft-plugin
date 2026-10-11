from decimal import Decimal
from pathlib import Path

from payment.api.composition import build_authorize_payment
from payment.domain.authorization_outcome import AuthorizationOutcome
from payment.domain.money import Money
from payment.infrastructure.file_system_receipt_store import FileSystemReceiptStore


class Approves:
    def authorize(self, reference: str, amount: Money) -> AuthorizationOutcome:
        return AuthorizationOutcome.APPROVED


def test_a_receipt_is_written_under_a_directory_created_on_demand(tmp_path: Path) -> None:
    store = FileSystemReceiptStore(tmp_path / "receipts" / "2026")

    store.save("ORD-7", "EUR 12 -> APPROVED")
    store.save("ORD-8", "EUR 3 -> DECLINED")

    assert (tmp_path / "receipts" / "2026" / "ORD-7.txt").read_text(encoding="utf-8") == "EUR 12 -> APPROVED"
    assert (tmp_path / "receipts" / "2026" / "ORD-8.txt").read_text(encoding="utf-8") == "EUR 3 -> DECLINED"


def test_the_wired_use_case_keeps_its_receipt_on_disk(tmp_path: Path) -> None:
    authorize_payment = build_authorize_payment(Approves(), tmp_path)

    outcome = authorize_payment.handle("ORD-9", Money(Decimal("5"), "usd"))

    assert outcome is AuthorizationOutcome.APPROVED
    assert (tmp_path / "ORD-9.txt").read_text(encoding="utf-8") == "USD 5 -> APPROVED"
