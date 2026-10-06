package com.example.payment.domain;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.Objects;

/** An amount and the currency it is expressed in. */
public record Money(BigDecimal amount, String currency) {

    public Money {
        Objects.requireNonNull(amount, "An amount is required.");
        if (amount.signum() <= 0) throw new IllegalArgumentException("An amount must be positive.");
        if (currency == null || currency.isBlank()) throw new IllegalArgumentException("A currency is required.");
        currency = currency.toUpperCase(Locale.ROOT);
    }
}
