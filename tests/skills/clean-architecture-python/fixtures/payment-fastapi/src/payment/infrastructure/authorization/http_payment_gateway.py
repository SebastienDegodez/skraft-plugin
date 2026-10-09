from typing import final

import httpx

from payment.domain.authorization.authorization_outcome import AuthorizationOutcome
from payment.domain.shared.money import Money


@final
class HttpPaymentGateway:
    """Talks to the provider's REST API: POST /v1/authorizations, then reads back the decision.

    The provider answers 200 with {"status": "approved" | "declined"} and 402 when it
    refuses the request outright.
    """

    def __init__(self, client: httpx.Client) -> None:
        self._client = client

    def authorize(self, reference: str, amount: Money) -> AuthorizationOutcome:
        response = self._client.post(
            "/v1/authorizations",
            json={"reference": reference, "amount": str(amount.amount), "currency": amount.currency},
        )
        if response.status_code == 402:
            return AuthorizationOutcome.DECLINED
        if response.is_error:
            raise RuntimeError(f"Payment provider answered {response.status_code}")
        return AuthorizationOutcome.APPROVED if response.json().get("status") == "approved" else AuthorizationOutcome.DECLINED
