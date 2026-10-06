// Port for the structural scan of the repository the architect reads before DESIGN.
// Contract: scan({ slug, outputPath }) => Promise<{ ok: boolean, reason?: string }>
//   outputPath — tracking-relative path the scan result is written to.
// MUST NOT throw: a failure is ok:false with a reason.
export const STRUCTURAL_SCANNER_PORT = 'StructuralScanner'
