package com.example.payment.integrationtest.receiptstore;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.payment.infrastructure.FileSystemReceiptStore;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class FileSystemReceiptStoreTest {

    @TempDir
    Path root;

    @Test
    void a_saved_receipt_can_be_read_back_from_disk() throws Exception {
        var store = new FileSystemReceiptStore(root);

        store.save("ORD-7", "EUR 12 -> APPROVED");

        assertThat(Files.readString(root.resolve("ORD-7.txt"))).isEqualTo("EUR 12 -> APPROVED");
    }
}
