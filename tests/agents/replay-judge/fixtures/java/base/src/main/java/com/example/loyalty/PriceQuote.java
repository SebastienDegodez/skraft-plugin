package com.example.loyalty;

import java.math.BigDecimal;
import java.util.List;

public final class PriceQuote {

    private final MembershipRepository memberships;
    private final PriceCalculator calculator;

    public PriceQuote(MembershipRepository memberships, PriceCalculator calculator) {
        this.memberships = memberships;
        this.calculator = calculator;
    }

    public BigDecimal priceFor(String memberId, List<BasketLine> lines) {
        return calculator.priceOf(lines, memberships.statusOf(memberId).isPresent());
    }
}
