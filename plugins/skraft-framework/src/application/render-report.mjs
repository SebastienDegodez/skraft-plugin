import {
  validateReportData, parseQualityEvidence, qualityProofs, presentReport,
} from '../domain/reporting-presentation.mjs'

/**
 * Synchronous report boundary. readText resolves repository-root references and
 * returns UTF-8 text (undefined or ENOENT for a missing file). hashText returns
 * lowercase SHA-256 hex for UTF-8 text; outcome evidence verification needs it.
 * @param {object} data
 * @param {{readText: (ref: string) => string | undefined, hashText?: (text: string) => string}} deps
 * @returns {string} Markdown
 */
export function renderReport(data, { readText, hashText }) {
  validateReportData(data)
  if (typeof readText !== 'function') throw new TypeError('readText port is required')
  if (data.kind === 'outcome' && typeof hashText !== 'function') throw new TypeError('hashText port is required for outcome proofs')
  const documents = new Map()
  const read = (ref) => {
    if (!ref) return undefined
    if (documents.has(ref)) return documents.get(ref)
    let value
    try { value = readText(ref) } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    documents.set(ref, typeof value === 'string' ? value : undefined)
    return documents.get(ref)
  }
  if (data.kind === 'forecast') {
    read(data.testPlanRef)
    return presentReport(data, documents, {}, new Map())
  }
  const parsed = parseQualityEvidence(read(data.qualityEvidenceRef), data)
  read(data.reviewRef)
  read(data.changeLogRef)
  const proofs = new Map()
  for (const ref of qualityProofs(parsed.quality, data.qualityEvidenceRef)) {
    const content = read(ref)
    if (content !== undefined) proofs.set(ref, { text: content, hash: hashText(content) })
  }
  return presentReport(data, documents, parsed, proofs)
}