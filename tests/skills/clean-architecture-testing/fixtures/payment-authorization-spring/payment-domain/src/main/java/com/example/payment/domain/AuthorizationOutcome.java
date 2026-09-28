package com.example.payment.domain;

/** What the payment provider decided about one authorization request. */
public enum AuthorizationOutcome {
    DECLINED,
    APPROVED
}
