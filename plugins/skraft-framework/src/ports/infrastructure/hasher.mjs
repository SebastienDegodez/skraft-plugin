// Port for content hashing (evidence integrity).
// Contract: sha256(text) => Promise<string>   lowercase hex digest of the UTF-8 bytes
export const HASHER_PORT = 'Hasher'
