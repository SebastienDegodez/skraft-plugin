package com.example.payment.application;

import com.example.payment.domain.AuthorizationOutcome;
import com.example.payment.domain.Money;

/** Outbound gateway to the payment provider. */
public interface PaymentGateway {

    AuthorizationOutcome authorize(String reference, Money amount);
}
