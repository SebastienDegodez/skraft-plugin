from enum import Enum


class AuthorizationOutcome(Enum):
    """What the payment provider decided about one authorization request."""

    DECLINED = "declined"
    APPROVED = "approved"
