package com.example.payment.app;

import com.example.payment.application.authorization.AuthorizePayment;
import com.example.payment.application.authorization.PaymentGateway;
import com.example.payment.application.authorization.ReceiptStore;
import com.example.payment.infrastructure.authorization.FileSystemReceiptStore;
import com.example.payment.infrastructure.authorization.HttpPaymentGateway;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
class PaymentConfiguration {

    @Bean
    PaymentGateway paymentGateway(RestClient.Builder builder, @Value("${payment.provider.base-url}") String baseUrl) {
        return new HttpPaymentGateway(builder.baseUrl(baseUrl).build());
    }

    @Bean
    ReceiptStore receiptStore(@Value("${payment.receipts.directory}") Path directory) {
        return new FileSystemReceiptStore(directory);
    }

    @Bean
    AuthorizePayment authorizePayment(PaymentGateway gateway, ReceiptStore receipts) {
        return new AuthorizePayment(gateway, receipts);
    }
}
