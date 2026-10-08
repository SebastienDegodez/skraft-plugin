from pathlib import Path

from payment.infrastructure.file_system_receipt_store import FileSystemReceiptStore


def test_a_saved_receipt_can_be_read_back_from_disk(tmp_path: Path) -> None:
    store = FileSystemReceiptStore(tmp_path)

    store.save("ORD-7", "EUR 12 -> APPROVED")

    assert (tmp_path / "ORD-7.txt").read_text(encoding="utf-8") == "EUR 12 -> APPROVED"
