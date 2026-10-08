package com.example.payment.application.authorization;

import com.example.payment.domain.authorization.AuthorizationOutcome;
import com.example.payment.domain.shared.Money;

/** Outbound gateway to the payment provider. */
public interface PaymentGateway {

    AuthorizationOutcome authorize(String reference, Money amount);
}
