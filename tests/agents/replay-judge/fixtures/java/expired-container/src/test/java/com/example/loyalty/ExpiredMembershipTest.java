package com.example.loyalty;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class ExpiredMembershipTest {

    @Container
    static final PostgreSQLContainer<?> DATABASE = new PostgreSQLContainer<>("postgres:17-alpine");

    @Test
    void anExpiredMemberPaysTheStandardPrice() {
        var memberships = new MembershipRepository(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
        memberships.save("M-1042", MembershipStatus.EXPIRED);

        BigDecimal price = new PriceQuote(memberships, new PriceCalculator())
            .priceFor("M-1042", List.of(new BasketLine(new BigDecimal("5.00"), 2)));

        assertEquals(new BigDecimal("10.00"), price);
    }
}
