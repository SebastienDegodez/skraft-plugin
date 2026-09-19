// Fixed identifiers from quality-gates-evidence-contract (v3); no score policy.
const gateIds = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11']
const statuses = ['pass', 'fail', 'not_applicable']
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value) => typeof value === 'string' && value.trim().length > 0
const identifier = (value) => text(value) && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
const revision = (value) => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value)

export function isRootReference(ref) {
  return text(ref) && !/[\\\s\u0000-\u001f\u007f:?#]/.test(ref)
    && !ref.startsWith('/') && ref.split('/').every((part) => part && part !== '.' && part !== '..')
}

export function validateReportData(data) {
  const require = (condition, field) => {
    if (!condition) throw new TypeError(`Invalid report ${field}`)
  }
  require(object(data), 'data')
  require(['forecast', 'outcome'].includes(data.kind), 'kind')
  require(identifier(data.story), 'story')
  for (const field of ['runId', 'reportId']) {
    if (data[field] !== undefined) require(identifier(data[field]), field)
  }
  require(revision(data.revision), 'revision')
  require(text(data.title), 'title')
  require(['en', 'fr'].includes(data.language), 'language')
  require(Number.isSafeInteger(data.maxMedia) && data.maxMedia >= 0, 'maxMedia')
  require(object(data.impact) && typeof data.impact.expected === 'string'
    && (data.impact.actual === undefined || typeof data.impact.actual === 'string'), 'impact')
  require(Array.isArray(data.criteria), 'criteria')
  const ids = new Set()
  for (const criterion of data.criteria) {
    require(object(criterion) && identifier(criterion.id) && !ids.has(criterion.id), 'criterion id')
    ids.add(criterion.id)
    require(text(criterion.description) && text(criterion.test), 'criterion text')
    require(criterion.evidence === undefined || typeof criterion.evidence === 'string', 'criterion evidence')
  }
  require(Array.isArray(data.limitations) && data.limitations.every((item) => typeof item === 'string'), 'limitations')
  require(Array.isArray(data.media) && data.media.every((item) => object(item) && text(item.label)
    && (item.url === undefined || typeof item.url === 'string')
    && (item.path === undefined || typeof item.path === 'string')), 'media')
  for (const field of ['testPlanRef', 'qualityEvidenceRef', 'reviewRef', 'changeLogRef']) {
    require(data[field] === undefined || isRootReference(data[field]), field)
  }
}

// Canonical qg refs beginning evidence/ are relative to the plan root. Already
// repository-root refs stay unchanged. Never probe alternatives or infer a date.
export function resolveQualityReference(ref, qualityEvidenceRef) {
  if (!isRootReference(ref)) return undefined
  if (!ref.startsWith('evidence/')) return ref
  const boundary = qualityEvidenceRef?.lastIndexOf('/evidence/') ?? -1
  if (boundary < 0) return qualityEvidenceRef?.startsWith('evidence/') ? ref : undefined
  return `${qualityEvidenceRef.slice(0, boundary)}/${ref}`
}

export function parseQualityEvidence(raw, data) {
  if (typeof raw !== 'string') return { error: 'Missing quality evidence document' }
  let quality
  try { quality = JSON.parse(raw) } catch { return { error: 'Malformed quality evidence JSON' } }
  if (!object(quality) || !/^quality-gates-evidence\/v[123]$/.test(quality.$schema)) {
    return { error: 'Unknown or missing quality evidence schema' }
  }
  if (quality.repo_root_rev !== data.revision || quality.story !== data.story) {
    return { error: 'Quality evidence revision or story mismatch' }
  }
  if (!text(quality.produced_at) || !Number.isFinite(Date.parse(quality.produced_at))
    || !text(quality.producer) || !text(quality.tech_adapter)
    || !Array.isArray(quality.gates) || !Array.isArray(quality.commits_covered)
    || !quality.commits_covered.every((commit) => object(commit) && revision(commit.sha)
      && text(commit.subject) && Array.isArray(commit.files_changed) && commit.files_changed.every(text))
    || !object(quality.test_integrity) || !Array.isArray(quality.test_integrity.cycles)
    || !quality.test_integrity.cycles.every(object)) {
    return { error: 'Malformed quality evidence fields' }
  }
  const ids = new Set()
  for (const gate of quality.gates) {
    if (!object(gate) || !gateIds.includes(gate.id) || ids.has(gate.id) || !text(gate.label)) {
      return { error: 'Malformed or duplicate quality gate identifier/label' }
    }
    ids.add(gate.id)
  }
  return { quality }
}

export function qualityProofs(quality, qualityEvidenceRef) {
  if (!quality) return []
  const refs = quality.gates.flatMap((gate) => [gate.stdout_ref, gate.exit_code_ref])
  refs.push(...quality.test_integrity.cycles.flatMap((cycle) => [cycle.red_stdout_ref, cycle.red_exit_code_ref]))
  return [...new Set(refs.map((ref) => resolveQualityReference(ref, qualityEvidenceRef)).filter(Boolean))]
}

const unverified = (reason) => ({ status: 'UNVERIFIED', reason })

function proofStatus(stdoutRef, exitRef, hash, tail, proofs, qualityRef, red = false) {
  const stdout = proofs.get(resolveQualityReference(stdoutRef, qualityRef))
  const exit = proofs.get(resolveQualityReference(exitRef, qualityRef))
  if (!stdout || !exit || !text(hash)) return unverified('Missing stdout, exit or hash evidence')
  if (!/^[a-f0-9]{64}$/.test(hash) || stdout.hash !== hash) return unverified('SHA256 hash mismatch')
  if (!red && (typeof tail !== 'string' || !stdout.text.endsWith(tail))) {
    return unverified('Missing or altered stdout tail')
  }
  if (!/^-?\d+$/.test(exit.text.trim())) return unverified('Malformed runner exit')
  const code = Number(exit.text.trim())
  if (!Number.isSafeInteger(code)) return unverified('Malformed runner exit')
  const passed = red ? code !== 0 : code === 0
  return { status: passed ? 'pass' : 'fail', reason: `exit=${code}` }
}

function gateStatus(gate, quality, proofs, qualityRef) {
  if (!statuses.includes(gate.status)) return unverified('Missing or unknown gate status')
  if (gate.status === 'not_applicable') {
    return text(gate.rationale) ? { status: gate.status, reason: gate.rationale } : unverified('Missing rationale')
  }
  if (gate.metrics !== undefined && (!object(gate.metrics)
    || !Object.values(gate.metrics).every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0))) {
    return unverified('Malformed metrics')
  }
  if (gate.id === 'G8' || gate.id === 'G9') return unverified('Git tree verification belongs to the reviewer')
  let result
  if (gate.id === 'G10') {
    const cycles = quality.test_integrity.cycles
    if (cycles.length === 0) return unverified('Missing RED cycles')
    const results = cycles.map((cycle) => proofStatus(cycle.red_stdout_ref, cycle.red_exit_code_ref,
      cycle.red_stdout_sha256, undefined, proofs, qualityRef, true))
    result = results.find((entry) => entry.status === 'UNVERIFIED')
      ?? results.find((entry) => entry.status === 'fail') ?? { status: 'pass', reason: 'Nonzero RED exits; hashes match' }
  } else {
    if (!text(gate.command_executed)) return unverified('Missing runner command')
    result = proofStatus(gate.stdout_ref, gate.exit_code_ref, gate.stdout_sha256, gate.stdout_tail, proofs, qualityRef)
  }
  if (result.status === 'UNVERIFIED') return result
  if (gate.status === 'fail' || gate.metrics?.tests_failed > 0) {
    return { status: 'fail', reason: 'Declared failure or failing test metrics' }
  }
  return result
}

// Structured fields are plain text; source documents retain Markdown below.
const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '|': '&#124;', '@': '&#64;',
  '[': '&#91;', ']': '&#93;', '`': '&#96;', '*': '&#42;', '\\': '&#92;', '{': '&#123;', '}': '&#125;' }
const escape = (value) => String(value ?? '').replace(/[&<>|@\[\]`*\\{}]/g, (char) => entities[char])
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
const cell = (value) => escape(value).replace(/\r?\n|\r/g, ' ')
const row = (values) => `| ${values.map(cell).join(' | ')} |`
const table = (headings, rows) => [row(headings), row(headings.map(() => '---')), ...rows.map(row)].join('\n')

// Bounded publication filtering, not an arbitrary-Markdown security boundary.
// Support ordinary inline/reference links and top-level fences; GitHub's HTML
// sanitizer remains required. Never promote a relative source link to remote proof.
function sourceDestination(value) {
  const destination = value.startsWith('<') && value.endsWith('>') ? value.slice(1, -1) : value
  const remote = safeMediaUrl(destination)
  if (remote) return { remote }
  const local = destination && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(destination)
    && !/[&<>\\\s\u0000-\u001f\u007f]/.test(destination)
  return { note: local
    ? `local source reference: ${cell(destination)}; not remotely verified`
    : 'destination withheld: unsupported or unsafe URL' }
}

function sourceProse(value) {
  // Resolve destinations before escaping HTML so encoded schemes cannot gain
  // trust through entity decoding. Unsupported destinations retain their labels.
  return value
    .replace(/(^ {0,3}\[[^\]\n]+\]:)[ \t]*(<[^>\n]*>|\S+)([^\n]*)$/gm,
      (_, label, destination, suffix) => {
        const link = sourceDestination(destination)
        return link.remote ? `${label} ${link.remote}${suffix}` : `${label.replace(/[\[\]]/g, '')} (${link.note})`
      })
    .replace(/(!?\[[^\]\n]*\])\([ \t]*(<[^>\n]*>|[^\s\n]*?)(?:[ \t]+("[^"\n]*"|'[^'\n]*'|\([^\)\n]*\)))?[ \t]*\)/g,
      (_, label, destination, title) => {
        const link = sourceDestination(destination)
        return link.remote ? `${label}(${link.remote}${title ? ` ${title}` : ''})`
          : `${label.replace(/^!?\[|\]$/g, '')} (${link.note})`
      })
    .replace(/[&<>@]/g, (char) => entities[char])
}

function sourceMarkdown(content) {
  const lines = content.replace(/\r\n?|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,
    (char) => char.startsWith('\r') ? '\n' : '').split('\n')
  const output = []
  let fence
  for (const line of lines) {
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence) {
      // Code stays code, including literal HTML. Break publication markers and
      // mentions even here because comment identity is inspected as raw text.
      output.push(line.replace(/<!--/g, '<\u200b!--').replace(/@/g, '@\u200b'))
      if (delimiter && delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length
        && !delimiter[2].trim()) fence = undefined
    } else if (delimiter && (delimiter[1][0] === '~' || !delimiter[2].includes('`'))) {
      fence = delimiter[1]
      output.push(`${fence}${sourceProse(delimiter[2])}`)
    } else {
      output.push(sourceProse(line))
    }
  }
  // An unclosed source fence must not swallow the renderer's following sections.
  if (fence) output.push(fence)
  return output.join('\n')
}

function documentContent(ref, documents) {
  const content = documents.get(ref)
  return `${cell(ref || '(missing reference)')} (local source reference; not remotely verified)\n\n${typeof content === 'string'
    ? sourceMarkdown(content)
    : 'UNVERIFIED: missing or unavailable document'}`
}

function safeMediaUrl(value) {
  if (!text(value) || !/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\u007f<>\\]/.test(value)) return undefined
  try {
    const url = new URL(value)
    if (!url.hostname || url.username || url.password) return undefined
    return url.href.replace(/[()\[\]`*{}|]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
  } catch { return undefined }
}

function mediaSection(data, french) {
  let selected = 0
  let omitted = 0
  const seen = new Set()
  const lines = []
  for (const item of data.media) {
    const url = safeMediaUrl(item.url)
    if (url && selected < data.maxMedia && !seen.has(url)) {
      selected++
      seen.add(url)
      lines.push(`- [${cell(item.label)}](${url})`)
    } else {
      omitted++
      const reason = item.url ? 'withheld (unsafe URL, duplicate or selection limit)' : 'local-only; not remotely accessible'
      lines.push(`- ${cell(item.label)}: ${cell(item.path)} ${reason}`)
    }
  }
  lines.push(french ? `${omitted} média(s) omis.` : `${omitted} media omitted.`)
  return lines.join('\n')
}

export function buildReportView(data, documents, parsed, proofs) {
  const french = data.language === 'fr'
  const forecast = data.kind === 'forecast'
  const { quality, error } = parsed
  const gates = gateIds.map((id) => {
    const gate = quality?.gates.find((entry) => entry.id === id)
    const result = gate ? gateStatus(gate, quality, proofs, data.qualityEvidenceRef)
      : unverified(error || 'Missing gate evidence')
    return { gate, id, ...result }
  })
  const criteria = data.criteria.map((criterion) => {
    const evidence = resolveQualityReference(criterion.evidence, data.qualityEvidenceRef)
    // The current contract has no per-test result bound to a criterion. Neither
    // an aggregate G1 exit nor a test path in stdout establishes that outcome.
    return [criterion.id, criterion.description, criterion.test, forecast ? 'PLANNED' : 'UNVERIFIED',
      forecast ? data.testPlanRef : evidence || criterion.evidence]
  })
  const view = {
    kind: forecast ? (french ? 'Rapport prévisionnel' : 'Forecast report') : (french ? 'Rapport de résultat' : 'Outcome report'),
    title: cell(data.title), identity: `${cell(data.story)} | ${cell(data.revision)}`,
    labels: {
      expectedImpact: french ? 'Impact attendu' : 'Expected impact',
      actualImpact: french ? 'Impact constaté' : 'Actual impact',
      traceability: french ? 'Traçabilité' : 'Traceability',
      testPlan: french ? 'Plan de tests prévisionnel' : 'Test plan',
      gates: french ? 'Preuves des contrôles' : 'Gate evidence',
      review: french ? 'Revue persistée' : 'Persisted review',
      changes: french ? 'Journal des changements' : 'Change log',
      limitations: french ? 'Limites' : 'Limitations',
      media: french ? 'Médias' : 'Media',
    },
    expectedImpact: cell(data.impact.expected),
    actualImpact: forecast ? '' : cell(data.impact.actual || 'UNVERIFIED'),
    traceability: table(french
      ? ['Critère', 'Description', 'Test', 'Statut', 'Preuve'] : ['Criterion', 'Description', 'Test', 'Status', 'Evidence'], criteria),
    traceabilityNote: french
      ? 'La traçabilité associe les critères aux tests et références déclarés, sans prouver leur exécution ni leur résultat. Les références locales ne sont pas des preuves accessibles à distance.'
      : 'Traceability maps criteria to declared tests and references; it does not prove execution or outcomes. Local references are not remotely accessible proof.',
    testPlan: '', gates: '', review: '', changes: '',
    aggregateNote: '', reviewNote: '',
    limitations: data.limitations.map((item) => `- ${cell(item)}`).join('\n'),
    media: mediaSection(data, french),
  }
  if (forecast) {
    view.testPlan = documentContent(data.testPlanRef, documents)
  } else {
    const rows = gates.map(({ id, gate, status, reason }) => {
      const refs = id === 'G10' && gate ? quality.test_integrity.cycles.flatMap((cycle) => [cycle.red_stdout_ref, cycle.red_exit_code_ref])
        : [gate?.stdout_ref, gate?.exit_code_ref]
      const metrics = object(gate?.metrics) ? Object.entries(gate.metrics)
        .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
        .map(([key, value]) => `${key}: ${value}`).join('; ') : ''
      return [id, gate?.label, status, gate?.command_executed, refs.filter(Boolean)
        .map((ref) => resolveQualityReference(ref, data.qualityEvidenceRef) || ref).join('; '), metrics, reason]
    })
    view.gates = `${cell(data.qualityEvidenceRef || '(missing reference)')}\n\n${table(
      ['ID', 'Gate', 'Status', 'Command', 'References', 'Reported metrics', 'Evidence check'], rows)}`
    view.review = documentContent(data.reviewRef, documents)
    view.changes = documentContent(data.changeLogRef, documents)
    view.aggregateNote = french
      ? 'Les contrôles agrégés, y compris G1, restent distincts des résultats par critère. Sans preuve individuelle liée au test et au critère, le résultat reste UNVERIFIED.'
      : 'Aggregate gates, including G1, remain separate from criterion outcomes. Without individual evidence bound to the test and criterion, the outcome remains UNVERIFIED.'
    view.reviewNote = french ? 'Le rendu vérifie les preuves locales, pas les objets Git ni le déploiement. La décision globale appartient à la revue.'
      : 'Rendering checks local proofs, not Git objects or deployment. The overall decision belongs to the reviewer.'
  }
  return view
}