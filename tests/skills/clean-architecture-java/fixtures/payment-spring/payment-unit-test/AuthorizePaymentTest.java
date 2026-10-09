package com.example.payment.unittest.authorizepayment;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.payment.application.authorization.AuthorizePayment;
import com.example.payment.application.authorization.ReceiptStore;
import com.example.payment.domain.authorization.AuthorizationOutcome;
import com.example.payment.domain.shared.Money;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AuthorizePaymentTest {

    @Test
    void an_approved_payment_is_reported_as_approved() {
        var handler = new AuthorizePayment((reference, amount) -> AuthorizationOutcome.APPROVED, new InMemoryReceiptStore());

        var outcome = handler.handle("ORD-1", new Money(new BigDecimal("42.50"), "eur"));

        assertThat(outcome).isEqualTo(AuthorizationOutcome.APPROVED);
    }

    @Test
    void every_attempt_leaves_a_receipt_behind() {
        var receipts = new InMemoryReceiptStore();
        var handler = new AuthorizePayment((reference, amount) -> AuthorizationOutcome.DECLINED, receipts);

        handler.handle("ORD-2", new Money(BigDecimal.TEN, "EUR"));

        assertThat(receipts.saved).containsKey("ORD-2");
    }

    private static final class InMemoryReceiptStore implements ReceiptStore {
        final Map<String, String> saved = new HashMap<>();

        @Override
        public void save(String reference, String body) {
            saved.put(reference, body);
        }
    }
}
