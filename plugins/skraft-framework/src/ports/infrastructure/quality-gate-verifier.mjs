// Port for verifying a story's quality-gate evidence log (G1–G11).
// Contract: verify({ slug, evidenceLog, baseSha }) => Promise<{ outcome, findings }>
//   evidenceLog — tracking-relative path of evidence/{date}/{story}/qg-{story}.json
//   baseSha     — DELIVER base commit, or null
//   outcome     — 'pass' | 'fail' | 'inconclusive' | 'error'
//   findings    — text a human or the engineer can act on
// MUST NOT throw: an infrastructure failure is outcome 'error'.
export const QUALITY_GATE_VERIFIER_PORT = 'QualityGateVerifier'
