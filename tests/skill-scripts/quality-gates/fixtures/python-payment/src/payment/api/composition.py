from pathlib import Path

from payment.application.authorize_payment import AuthorizePayment
from payment.application.payment_gateway import PaymentGateway
from payment.infrastructure.file_system_receipt_store import FileSystemReceiptStore


def build_authorize_payment(gateway: PaymentGateway, receipts_directory: Path) -> AuthorizePayment:
    """Wires the use case to the receipt files kept under one directory."""
    return AuthorizePayment(gateway, FileSystemReceiptStore(receipts_directory))
