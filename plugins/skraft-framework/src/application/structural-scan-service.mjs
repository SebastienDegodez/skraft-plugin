import { isScannableSource, scanSource, summariseScan } from '../domain/structural-scan-policy.mjs'

// Use case StructuralScan: the structural commitments the existing code carries (DESIGN
// Step 7.0 signatures), as one report. Ports: SourceTree, SourceControl, TimeProvider.
// Run in process by RunPipeline before the architect, and by the structural-scan command
// for the architect reviewer.
export const MAX_SCANNED_FILE_BYTES = 1024 * 1024

export const createStructuralScan = ({ sourceTree, sourceControl, time }) => Object.freeze({
  scan: async () => {
    const files = (await sourceTree.listFiles()).filter(isScannableSource)
    const hits = []
    for (const path of files) {
      const content = await sourceTree.readSource(path, MAX_SCANNED_FILE_BYTES)
      if (content !== null) hits.push(...scanSource(path, content))
    }
    const revision = await sourceControl.headSha()
    return { generatedAt: time.isoString(), ...summariseScan(hits, { revision, scannedFiles: files.length }) }
  },
})
