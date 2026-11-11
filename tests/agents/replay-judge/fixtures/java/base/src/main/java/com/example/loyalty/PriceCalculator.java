package com.example.loyalty;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

public final class PriceCalculator {

    private static final BigDecimal MEMBER_RATE = new BigDecimal("0.90");

    public BigDecimal priceOf(List<BasketLine> lines, boolean member) {
        BigDecimal total = lines.stream()
            .map(line -> line.unitPrice().multiply(BigDecimal.valueOf(line.quantity())))
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        return member ? total.multiply(MEMBER_RATE).setScale(2, RoundingMode.HALF_UP) : total;
    }
}
