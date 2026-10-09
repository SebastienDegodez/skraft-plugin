package com.example.payment.infrastructure.authorization;

import com.example.payment.application.authorization.PaymentGateway;
import com.example.payment.domain.authorization.AuthorizationOutcome;
import com.example.payment.domain.shared.Money;
import java.math.BigDecimal;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;

/**
 * Talks to the provider's REST API: POST /v1/authorizations, and read back the decision.
 * The provider answers 200 with {"status":"approved"|"declined"} and 402 when it refuses
 * the request outright.
 */
public final class HttpPaymentGateway implements PaymentGateway {

    private final RestClient client;

    public HttpPaymentGateway(RestClient client) {
        this.client = client;
    }

    @Override
    public AuthorizationOutcome authorize(String reference, Money amount) {
        var request = new AuthorizationRequest(reference, amount.amount(), amount.currency());
        return client.post()
                .uri("/v1/authorizations")
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .exchange((sent, response) -> {
                    if (response.getStatusCode().value() == 402) return AuthorizationOutcome.DECLINED;
                    if (response.getStatusCode().isError()) {
                        throw new IllegalStateException("Payment provider answered " + response.getStatusCode());
                    }
                    var body = response.bodyTo(AuthorizationResponse.class);
                    return body != null && "approved".equals(body.status())
                            ? AuthorizationOutcome.APPROVED
                            : AuthorizationOutcome.DECLINED;
                });
    }

    record AuthorizationRequest(String reference, BigDecimal amount, String currency) {}

    record AuthorizationResponse(String status) {}
}
