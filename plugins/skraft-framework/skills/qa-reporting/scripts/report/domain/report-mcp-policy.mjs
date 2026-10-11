const HOSTS = { github: 'github.com', gitlab: 'gitlab.com', 'azure-devops': 'dev.azure.com' }
const SCOPE = ['provider', 'host', 'organization', 'project', 'repo', 'type', 'number']
const MAX_BODY_LENGTH = 65_536
const digestPattern = /^[a-f0-9]{64}$/
const markerStart = /<!--\s*skraft-report:/gi
const isText = (value) => typeof value === 'string' && value.trim().length > 0 && !/[\x00-\x1f\x7f]/.test(value)
const isSegment = (value) => isText(value) && value === value.trim() &&
  !['.', '..'].includes(value) && !/[/%\\?#:@]/.test(value)
const isSlug = (value) => isSegment(value) && /^[A-Za-z0-9_.-]+$/.test(value)

function requireThat(condition, reason) {
  if (!condition) throw new Error(reason)
}

// Hostnames are checked syntactically only. Self-hosted providers need no DNS probe.
function normalizeHost(host) {
  requireThat(typeof host === 'string' && host.length <= 253 &&
    host.split('.').every((part) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(part)),
  'Provider host must be an HTTPS hostname without credentials, port or path')
  const normalized = new URL(`https://${host}`).hostname
  requireThat(!/^\d+(?:\.\d+)*$/.test(normalized) && normalized !== 'localhost' &&
    !normalized.endsWith('.localhost'), 'Provider host must be a non-loopback hostname')
  return normalized
}

export function normalizeProviderScope(value, { requireRepo = true } = {}) {
  const provider = value.provider === undefined ? 'github' : value.provider
  requireThat(Object.hasOwn(HOSTS, provider), 'Unsupported report provider')
  const host = normalizeHost(value.host === undefined ? HOSTS[provider] : value.host)
  const scope = { provider, host, repo: value.repo }
  if (provider === 'azure-devops') {
    requireThat(isSegment(value.organization) && isSegment(value.project), 'Azure organization and project scope are required')
    scope.organization = value.organization
    scope.project = value.project
  } else {
    requireThat(value.organization === undefined && value.project === undefined,
      'Organization and project fields require an Azure provider')
  }
  if (requireRepo || (value.repo !== undefined && value.repo !== null)) {
    const parts = typeof value.repo === 'string' ? value.repo.split('/') : []
    const valid = provider === 'github'
      ? parts.length === 2 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(parts[0]) && isSlug(parts[1])
      : provider === 'gitlab' ? parts.length >= 2 && parts.every(isSlug) : isSegment(value.repo)
    requireThat(valid, 'Repository must match the provider scope without traversal, encoding or credentials')
  }
  return scope
}

export function normalizeMcpTarget(value, type, number) {
  const scope = normalizeProviderScope(value)
  requireThat(['pr', 'issue'].includes(type), 'Invalid report destination target type')
  requireThat(Number.isSafeInteger(number) && number > 0, 'Target number must be a positive safe integer')
  return { ...scope, type, number }
}

export function sameMcpScope(left, right) {
  return !!left && !!right && SCOPE.every((key) => left[key] === right[key])
}

export function reportMarker(story, kind) {
  requireThat(isText(story) && ['forecast', 'outcome'].includes(kind), 'Report requires a story and forecast or outcome kind')
  const identity = Array.from(story, (character) => character.codePointAt(0).toString(16).padStart(6, '0')).join('')
  return `<!-- skraft-report:${kind}:${identity} -->`
}

export function markReportBody(body, story, kind) {
  requireThat(typeof body === 'string' && body.trim().length > 0 && !/<!--\s*skraft-report:/i.test(body),
    'Report body must contain Markdown without a publication marker')
  const marker = reportMarker(story, kind)
  const text = `${marker}\n\n${body}`
  requireThat(text.length <= MAX_BODY_LENGTH, 'Marked report body exceeds comment limit')
  return { marker, body: text }
}

export function trustedMcpDigest(receipt, { story, kind, target }) {
  if (receipt?.story !== story || receipt?.kind !== kind) return undefined
  const entry = receipt.targets?.[target.type]
  if (!sameMcpScope(entry?.target, target)) return undefined
  return typeof entry.renderedBodyDigest === 'string' && digestPattern.test(entry.renderedBodyDigest)
    ? entry.renderedBodyDigest : undefined
}

export function validateMcpId(id) {
  requireThat(Number.isSafeInteger(id) && id > 0, 'Invalid report comment or thread ID')
}

// URLs remain host attestations, not proof of a local fetch. Only scoped links pass.
export function validateMcpCommentUrl(comment, target, { pointer = false } = {}) {
  validateMcpId(comment?.id)
  const raw = comment.url
  if (target.provider === 'azure-devops' && target.type === 'pr' &&
      (!pointer || comment.threadId !== undefined)) validateMcpId(comment.threadId)
  if (raw === undefined && !pointer) return undefined
  requireThat(typeof raw === 'string' && raw.startsWith('https://') && !/[\s\\\x00-\x1f\x7f]/.test(raw),
    'Invalid report comment URL')
  let url
  try { url = new URL(raw) } catch { throw new Error('Invalid report comment URL') }
  requireThat(url.protocol === 'https:' && url.host === target.host && !url.username && !url.password,
    'Report URL host does not match target scope')
  // Compare raw canonical paths too: URL parsing must not erase traversal or controls.
  const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/')
  let path
  if (target.provider === 'github') {
    path = `/${encodePath(target.repo)}/${target.type === 'pr' ? 'pull' : 'issues'}/${target.number}`
    requireThat(url.search === '' && url.hash === `#issuecomment-${comment.id}`, 'Report URL comment scope mismatch')
  } else if (target.provider === 'gitlab') {
    path = `/${encodePath(target.repo)}/-/${target.type === 'pr' ? 'merge_requests' : 'issues'}/${target.number}`
    requireThat(url.search === '' && url.hash === `#note_${comment.id}`, 'Report URL comment scope mismatch')
  } else {
    const base = `/${encodeURIComponent(target.organization)}/${encodeURIComponent(target.project)}`
    if (target.type === 'pr') {
      path = `${base}/_git/${encodeURIComponent(target.repo)}/pullrequest/${target.number}`
      const fromUrl = url.searchParams.get('discussionId')
      const threadId = pointer && comment.threadId === undefined && /^[1-9]\d*$/.test(fromUrl ?? '')
        ? Number(fromUrl) : comment.threadId
      validateMcpId(threadId)
      requireThat((url.search === '' || url.search === `?discussionId=${threadId}`) && url.hash === '', 'Report URL thread scope mismatch')
    } else {
      path = `${base}/_workitems/edit/${target.number}`
      requireThat(url.search === '' && (url.hash === '' || url.hash === `#${comment.id}`), 'Report URL comment scope mismatch')
    }
  }
  requireThat(url.pathname === path && raw === `https://${target.host}${path}${url.search}${url.hash}`,
    'Report URL does not match the confirmed target scope')
  return raw
}

export function prPointerBody(receipt, { story, kind, target }) {
  requireThat(receipt?.story === story && receipt?.kind === kind, 'PR pointer requires a matching report receipt')
  const entry = receipt.targets?.pr
  requireThat(entry?.status === 'published' && sameMcpScope(entry.target, target),
    'PR pointer requires a published receipt in the same target scope')
  return `Report: ${validateMcpCommentUrl(entry, target, { pointer: true })}\n`
}

export function validateMcpPacket(packet, hashText) {
  requireThat(packet?.status === 'ready', 'Publication packet is pending or missing')
  const normalized = normalizeMcpTarget(packet.target, packet.target?.type, packet.target?.number)
  requireThat(sameMcpScope(normalized, packet.target) && packet.destination === packet.target.type,
    'Publication packet target scope mismatch')
  requireThat(packet.target.type !== 'pr' || isText(packet.branch), 'Publication packet PR branch is missing')
  requireThat(packet.marker === reportMarker(packet.story, packet.kind), 'Publication packet marker mismatch')
  requireThat(typeof packet.body === 'string' && packet.body.startsWith(`${packet.marker}\n\n`) &&
    packet.body.slice(packet.marker.length + 2).trim().length > 0 && packet.body.length <= MAX_BODY_LENGTH &&
    (packet.body.match(markerStart) ?? []).length === 1, 'Publication packet body or marker is invalid')
  requireThat(typeof packet.digest === 'string' && digestPattern.test(packet.digest) && hashText(packet.body) === packet.digest,
    'Publication packet body digest mismatch')
  requireThat(packet.previousDigest === undefined || (typeof packet.previousDigest === 'string' && digestPattern.test(packet.previousDigest)),
    'Publication packet previous digest is invalid')
}

function validateProvenance(provenance, target) {
  requireThat(isText(provenance?.server) && isText(provenance?.tool), 'Host server/tool provenance is required')
  const transport = provenance.transport ?? 'mcp'
  requireThat(['mcp', 'gh-cli'].includes(transport), 'Unsupported publication transport provenance')
  if (transport === 'gh-cli') {
    requireThat(target.provider === 'github' && provenance.server === 'gh' && provenance.tool === 'gh api',
      'GitHub CLI fallback requires GitHub target and gh api provenance')
  }
}

function validateObservationScope(packet, observed) {
  requireThat(sameMcpScope(packet.target, observed?.target), 'Observed target scope mismatch')
  requireThat(packet.target.type !== 'pr' || observed.branch === packet.branch, 'Observed PR branch scope mismatch')
  requireThat(isText(observed.viewer), 'Observed viewer identity is missing')
  validateProvenance(observed.provenance, packet.target)
}

export function chooseMcpAction(packet, observed, hashText, priorDecision) {
  validateObservationScope(packet, observed)
  requireThat(observed.complete === true && Array.isArray(observed.comments), 'Complete comment pagination is required')
  requireThat(observed.capabilities?.read === true, 'Read capability is required')
  const owned = observed.comments.filter((comment) => comment?.author === observed.viewer &&
    typeof comment.body === 'string' && comment.body.includes(packet.marker))
  requireThat(owned.length <= 1, 'Duplicate owned markers are ambiguous')
  const result = { body: packet.body, digest: packet.digest, viewer: observed.viewer, target: { ...packet.target } }
  if (owned.length === 0) {
    requireThat(observed.capabilities.create === true, 'Create capability is required')
    return { action: 'create', ...result }
  }
  const comment = owned[0]
  requireThat((comment.body.match(markerStart) ?? []).length === 1, 'Ambiguous report marker body')
  validateMcpCommentUrl(comment, packet.target)
  const remoteDigest = hashText(comment.body)
  const recoveredUpdate = priorDecision?.action === 'update' && sameMcpScope(priorDecision.target, packet.target) &&
    priorDecision.viewer === observed.viewer && priorDecision.commentId === comment.id &&
    priorDecision.threadId === comment.threadId && priorDecision.body === packet.body &&
    priorDecision.digest === packet.digest && comment.body === packet.body
  if (packet.previousDigest !== undefined) {
    requireThat(remoteDigest === packet.previousDigest || recoveredUpdate, 'Remote digest changed; preserve manual edits and reconcile conflict')
  } else {
    requireThat(comment.body === packet.body, 'Missing previous trusted digest; reconcile history before overwrite')
  }
  const action = comment.body === packet.body ? 'unchanged' : 'update'
  requireThat(action === 'unchanged' || observed.capabilities.update === true, 'Update capability is required; no create fallback')
  return { action, ...result, commentId: comment.id,
    ...(packet.target.provider === 'azure-devops' && packet.target.type === 'pr' ? { threadId: comment.threadId } : {}) }
}

export function attestMcpReadback(packet, decision, readback) {
  requireThat(['create', 'update', 'unchanged'].includes(decision?.action), 'Pending or invalid publication decision action')
  requireThat(decision.body === packet.body && decision.digest === packet.digest && isText(decision.viewer),
    'Decision body, digest or viewer does not match packet')
  requireThat(!!readback, 'Fresh host readback observation is required')
  validateObservationScope(packet, readback)
  requireThat(readback.viewer === decision.viewer, 'Readback viewer identity differs from decision')
  const comment = readback.comment
  requireThat(comment?.body === packet.body && comment?.author === decision.viewer, 'Readback comment body or author mismatch')
  validateMcpCommentUrl(comment, packet.target)
  const threaded = packet.target.provider === 'azure-devops' && packet.target.type === 'pr'
  if (decision.action === 'create') {
    requireThat(decision.commentId === undefined && decision.threadId === undefined, 'Create decision cannot adopt an existing comment ID')
  } else {
    validateMcpId(decision.commentId)
    requireThat(decision.commentId === comment.id && (!threaded || decision.threadId === comment.threadId),
      'Readback comment or thread ID differs from decision')
  }
  if (decision.action !== 'unchanged' || readback.writeResult !== undefined) {
    validateMcpId(readback.writeResult?.id)
    requireThat(readback.writeResult.id === comment.id && (!threaded || readback.writeResult.threadId === comment.threadId),
      'Write result comment or thread ID differs from readback')
  }
  return {
    target: { ...packet.target }, status: 'published', id: comment.id,
    ...(comment.url === undefined ? { urlStatus: 'unavailable' } : { url: comment.url }),
    renderedBodyDigest: packet.digest,
    verification: readback.provenance.transport === 'gh-cli' ? 'host-gh-cli-readback' : 'host-mcp-readback',
    localValidation: 'body-target-match',
    provenance: { server: readback.provenance.server, tool: readback.provenance.tool,
      ...(readback.provenance.transport === undefined ? {} : { transport: readback.provenance.transport }) },
    ...(threaded ? { threadId: comment.threadId } : {}),
  }
}