import { adrStatus, citedPaths, freshnessOf, isBriefPath, normalBody, readBrief } from '../../domain/architecture/brief.mjs'

export const createArchitectureReader = (deps) => Object.freeze({
  find: (issue) => find(deps, issue),
})

const find = async (deps, issue) => {
  const snapshot = await deps.architectureRepository.snapshot()
  if (!snapshot.ok) return { status: 'unreadable', code: 'architecture-unreadable', reason: snapshot.reason }
  const matches = snapshot.paths.filter((path) => isBriefPath(path, issue.number))
  if (matches.length > 1) return invalid('Several merged architecture briefs name this story.')
  if (matches.length === 0) return missing(deps, issue.number, snapshot.sha)
  return readMatched(deps, snapshot, matches[0], issue)
}

const missing = async (deps, issue, sha) => {
  const pending = await deps.architectureRepository.unmerged(issue, sha)
  if (!pending.ok) return { status: 'unreadable', code: 'architecture-unreadable', reason: pending.reason }
  return pending.found ? { status: 'unmerged', code: 'architecture-unmerged', reason: 'Merge the architecture pull request before delivering this story.' } : null
}

const readMatched = async (deps, snapshot, path, issue) => {
  const text = await snapshot.read(path)
  const brief = readBrief(text)
  if (brief === null) return invalid('The merged architecture brief has an invalid v1 header.')
  const fingerprint = await deps.hasher.sha256(normalBody(issue.body))
  const status = freshnessOf(brief, { ...issue, bodySha256: fingerprint })
  if (status === 'foreign') return invalid('The architecture brief belongs to another issue, repository or forge.')
  return withDocuments(deps, snapshot, { status, path, brief, text, fingerprint })
}

const withDocuments = async (deps, snapshot, found) => {
  const documents = [{ path: found.path, text: found.text }]
  for (const path of citedPaths(found.brief)) {
    const text = await snapshot.read(path)
    if (text === null) return invalid('An architecture document cited by the brief is missing from the merged base.')
    if (found.brief.adrs.includes(path) && adrStatus(text) !== 'Accepted') return stale(path)
    if (await changedSincePinned(deps, found.brief, path, text)) return changed(path)
    documents.push({ path, text })
  }
  return { ...found, sha: snapshot.sha, documents }
}

/** Whether a document the brief pins reads otherwise on the merged base than when the design ended (#669). @param {any} deps @param {any} brief @param {string} path @param {string} text */
const changedSincePinned = async (deps, brief, path, text) => brief.pins?.[path] !== undefined && brief.pins[path] !== await deps.hasher.sha256(normalBody(text))

const invalid = (reason) => ({ status: 'invalid', code: 'architecture-invalid', reason })
const changed = (path) => ({ status: 'stale', code: 'architecture-stale', path, reason: `${path} changed on the merged base since the design; design the story again before delivery.` })
const stale = (path) => ({ status: 'stale', code: 'architecture-stale', path, reason: `ADR ${path} is not Accepted on the merged base; refresh and merge the architecture before delivery.` })
