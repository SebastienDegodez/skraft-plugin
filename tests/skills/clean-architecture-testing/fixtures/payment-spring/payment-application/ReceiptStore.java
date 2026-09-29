package com.example.payment.application;

/** Outbound store keeping one receipt per authorization attempt. */
public interface ReceiptStore {

    void save(String reference, String body);
}
