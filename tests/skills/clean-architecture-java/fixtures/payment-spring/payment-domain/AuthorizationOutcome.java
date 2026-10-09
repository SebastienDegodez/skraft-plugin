package com.example.payment.domain.authorization;

/** What the payment provider decided about one authorization request. */
public enum AuthorizationOutcome {
    DECLINED,
    APPROVED
}
