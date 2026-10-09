import os
from pathlib import Path

import httpx

from payment.application.authorization.authorize_payment import AuthorizePayment
from payment.infrastructure.authorization.file_system_receipt_store import FileSystemReceiptStore
from payment.infrastructure.authorization.http_payment_gateway import HttpPaymentGateway


def build_authorize_payment() -> AuthorizePayment:
    provider = httpx.Client(base_url=os.environ.get("PAYMENT_PROVIDER_BASE_URL", "https://payments.example.invalid"))
    receipts = FileSystemReceiptStore(Path(os.environ.get("PAYMENT_RECEIPTS_DIRECTORY", "./receipts")))
    return AuthorizePayment(HttpPaymentGateway(provider), receipts)
