/**
 * Hasher — chains the journal.
 *
 * @typedef {{ sha256: (text: string) => Promise<string>, hmacSha256: (key: string, text: string) => Promise<string> }} Hasher
 *   sha256: lowercase hex SHA-256 of the UTF-8 bytes of text. hmacSha256: lowercase hex
 *   HMAC-SHA-256 of the UTF-8 bytes of text, under the bytes the hex key spells.
 */
export {}
