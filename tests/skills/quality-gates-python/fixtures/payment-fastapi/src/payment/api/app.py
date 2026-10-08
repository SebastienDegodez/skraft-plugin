from decimal import Decimal

from fastapi import FastAPI
from pydantic import BaseModel

from payment.api.composition import build_authorize_payment
from payment.domain.money import Money


class AuthorizationRequest(BaseModel):
    amount: Decimal
    currency: str


def create_app() -> FastAPI:
    app = FastAPI(title="payment-authorization")
    authorize_payment = build_authorize_payment()

    @app.post("/payments/{reference}/authorizations")
    def authorize(reference: str, request: AuthorizationRequest) -> dict[str, str]:
        outcome = authorize_payment.handle(reference, Money(request.amount, request.currency))
        return {"outcome": outcome.value}

    return app


app = create_app()
