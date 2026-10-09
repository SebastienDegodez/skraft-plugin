package com.example.payment.application.authorization;

import com.example.payment.domain.authorization.AuthorizationOutcome;
import com.example.payment.domain.shared.Money;

/** Authorizes one payment and keeps a receipt of what the provider answered. */
public final class AuthorizePayment {

    private final PaymentGateway gateway;
    private final ReceiptStore receipts;

    public AuthorizePayment(PaymentGateway gateway, ReceiptStore receipts) {
        this.gateway = gateway;
        this.receipts = receipts;
    }

    public AuthorizationOutcome handle(String reference, Money amount) {
        var outcome = gateway.authorize(reference, amount);
        receipts.save(reference, amount.currency() + " " + amount.amount().toPlainString() + " -> " + outcome);
        return outcome;
    }
}
