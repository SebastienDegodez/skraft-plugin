package com.example.loyalty;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class PriceCalculatorTest {

    @Test
    void aBasketWithoutMembershipPaysTheSumOfItsLines() {
        BigDecimal price = new PriceCalculator().priceOf(
            List.of(new BasketLine(new BigDecimal("4.00"), 2), new BasketLine(new BigDecimal("2.00"), 1)), false);

        assertEquals(new BigDecimal("10.00"), price);
    }

    @Test
    void anActiveMemberGetsTenPercentOff() {
        BigDecimal price = new PriceCalculator().priceOf(List.of(new BasketLine(new BigDecimal("5.00"), 2)), true);

        assertEquals(new BigDecimal("9.00"), price);
    }
}
