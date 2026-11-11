package com.example.loyalty;

import java.math.BigDecimal;

public record BasketLine(BigDecimal unitPrice, int quantity) {
}
