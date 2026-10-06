// Port for SHA-256 digests of text (UTF-8), lowercase hex.
// Contract:
//   sha256(text)      => Promise<string>   the evidence check
//   sha256Sync(text)  => string            the report renderer and the publication protocol,
//                                          whose domain functions hash synchronously
export const HASHER_PORT = 'Hasher'
