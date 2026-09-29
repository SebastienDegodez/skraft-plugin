package com.example.payment.infrastructure;

import com.example.payment.application.ReceiptStore;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** Keeps one receipt file per reference under a root directory. */
public final class FileSystemReceiptStore implements ReceiptStore {

    private final Path rootDirectory;

    public FileSystemReceiptStore(Path rootDirectory) {
        this.rootDirectory = rootDirectory;
    }

    @Override
    public void save(String reference, String body) {
        try {
            Files.createDirectories(rootDirectory);
            Files.writeString(rootDirectory.resolve(reference + ".txt"), body);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
