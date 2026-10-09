import { isConventionalCommitSubject } from './commit-convention.mjs'

// Pure verification of a quality-gates evidence log (quality-gates-evidence-contract).
// No IO: the application layer resolves every file and Git fact the log points at and
// hands them in as `facts`. The verdict is derived, never read from the log:
//   fail          — the substrate proves a gate failed or the log contradicts Git;
//   inconclusive  — a claim cannot be checked (missing, malformed, altered evidence);
//   pass          — every claim was checked against its substrate.

export const SUPPORTED_SCHEMAS = Object.freeze(['v1', 'v2', 'v3', 'v4'])

// Gates every log of a schema version must carry (a gate may be not_applicable with a rationale).
const REQUIRED_GATES = Object.freeze({
  v1: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9'],
  v2: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10'],
  v3: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11'],
  v4: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11'],
})
const G6_SCOPES = Object.freeze(['core', 'boundary'])
// Gates attested by the log structure rather than a runner exit: G7 by an empty grep
// output, G8/G9/G10 by commits and test-integrity cycles.
const STRUCTURAL_GATES = new Set(['G8', 'G9', 'G10'])

const INCONCLUSIVE = 'inconclusive'
const FAIL = 'fail'

const finding = (severity, code, detail, gate) => Object.freeze({ severity, code, detail, ...(gate ? { gate } : {}) })
const isText = (value) => typeof value === 'string' && value.length > 0
const versionOf = (log) => (typeof log?.$schema === 'string' ? log.$schema.match(/^quality-gates-evidence\/(v\d+)$/)?.[1] : undefined)
// v4 records one G6 entry per mutation scope; earlier schemas carry a single G6.
const gateKey = (gate, version) => (version === 'v4' && gate.id === 'G6' ? `G6/${gate.scope}` : gate.id)

// The files a log points at, so the application layer can read exactly those.
export const evidenceReferences = (log) => {
  const gates = Array.isArray(log?.gates) ? log.gates : []
  const cycles = Array.isArray(log?.test_integrity?.cycles) ? log.test_integrity.cycles : []
  return [...new Set([
    ...gates.flatMap((gate) => [gate?.stdout_ref, gate?.exit_code_ref]),
    ...cycles.flatMap((cycle) => [cycle?.red_stdout_ref, cycle?.red_exit_code_ref, cycle?.red_snapshot_ref, cycle?.green_snapshot_ref]),
  ].filter(isText))]
}

// A line removed or altered between RED and GREEN breaks G9: every RED line must still
// be there, in order, in the GREEN file (additions are free).
export const onlyAdditions = (red, green) => {
  const greenLines = green.split('\n')
  let at = 0
  for (const line of red === '' ? [] : red.split('\n')) {
    while (at < greenLines.length && greenLines[at] !== line) at++
    if (at === greenLines.length) return false
    at++
  }
  return true
}

const parseExit = (content) => {
  const text = typeof content === 'string' ? content.trim() : ''
  return /^-?\d+$/.test(text) ? Number(text) : undefined
}

const checkGate = (gate, version, facts, findings) => {
  const key = gateKey(gate, version)
  if (gate.status === 'fail') findings.push(finding(FAIL, 'GATE_FAILED', `${key} records status fail`, key))
  if (gate.status === 'not_applicable') {
    if (!isText(gate.rationale)) findings.push(finding(INCONCLUSIVE, 'RATIONALE_MISSING', `${key} is not_applicable without a rationale`, key))
    return
  }
  if (gate.status !== 'pass' && gate.status !== 'fail') {
    findings.push(finding(INCONCLUSIVE, 'STATUS_INVALID', `${key} status ${gate.status} is not pass, fail or not_applicable`, key))
    return
  }
  if (gate.status === 'pass' && gate.metrics?.tests_failed > 0) {
    findings.push(finding(FAIL, 'TESTS_FAILED_WHILE_PASS', `${key} passes with ${gate.metrics.tests_failed} failed test(s)`, key))
  }
  if (STRUCTURAL_GATES.has(gate.id)) return

  const stdout = facts.files.get(gate.stdout_ref)
  if (!isText(gate.stdout_ref) || stdout === undefined) {
    findings.push(finding(INCONCLUSIVE, 'STDOUT_MISSING', `${key} stdout ${gate.stdout_ref ?? '(none)'} is not on disk`, key))
  } else {
    if (gate.stdout_sha256 !== stdout.sha256) {
      findings.push(finding(INCONCLUSIVE, 'STDOUT_HASH_MISMATCH', `${key} stdout sha256 differs from ${gate.stdout_ref}`, key))
    }
    if (typeof gate.stdout_tail === 'string' && !stdout.content.endsWith(gate.stdout_tail)) {
      findings.push(finding(INCONCLUSIVE, 'STDOUT_TAIL_MISMATCH', `${key} stdout_tail is not the end of ${gate.stdout_ref}`, key))
    }
  }

  // G7 attests an absence: the grep for mocking symbols printed nothing.
  if (gate.id === 'G7') {
    if (gate.status === 'pass' && stdout !== undefined && stdout.content.trim() !== '') {
      findings.push(finding(FAIL, 'MOCKS_FOUND', `G7 passes but ${gate.stdout_ref} lists mocking symbols`, key))
    }
    return
  }

  const exit = facts.files.get(gate.exit_code_ref)
  const code = parseExit(exit?.content)
  if (!isText(gate.exit_code_ref) || exit === undefined) {
    findings.push(finding(INCONCLUSIVE, 'EXIT_MISSING', `${key} exit code ${gate.exit_code_ref ?? '(none)'} is not on disk`, key))
  } else if (code === undefined) {
    findings.push(finding(INCONCLUSIVE, 'EXIT_MALFORMED', `${key} exit code file holds no integer`, key))
  } else if (gate.status === 'pass' && code !== 0) {
    findings.push(finding(FAIL, 'EXIT_CONTRADICTS_STATUS', `${key} passes but its runner exited ${code}`, key))
  }
}

const checkGateSet = (log, version, findings) => {
  const gates = log.gates.filter((gate) => gate && typeof gate === 'object')
  const seen = new Map()
  for (const gate of gates) {
    const key = gateKey(gate, version)
    if (seen.has(key)) findings.push(finding(INCONCLUSIVE, 'GATE_DUPLICATED', `${key} appears more than once`, key))
    seen.set(key, gate)
  }
  for (const id of REQUIRED_GATES[version]) {
    if (id === 'G6' && version === 'v4') {
      for (const scope of G6_SCOPES) {
        if (!seen.has(`G6/${scope}`)) findings.push(finding(INCONCLUSIVE, 'GATE_MISSING', `G6 has no ${scope} scope entry`, `G6/${scope}`))
      }
    } else if (!seen.has(id)) {
      findings.push(finding(INCONCLUSIVE, 'GATE_MISSING', `${id} is absent from the log`, id))
    }
  }
  return gates
}

const checkRevision = (log, facts, findings) => {
  const rev = log.repo_root_rev
  if (!facts.git.commits.get(rev)?.exists) {
    findings.push(finding(FAIL, 'REVISION_UNRESOLVED', `repo_root_rev ${rev} does not resolve`))
    return
  }
  // The log cannot hold the SHA of the commit that adds it: the evidence commit may sit on
  // top of repo_root_rev as long as it touches nothing but the story's evidence directory.
  const onlyEvidence = facts.git.headParent === rev
    && facts.git.headFiles.length > 0
    && facts.git.headFiles.every((file) => isText(facts.evidenceDir) && file.startsWith(`${facts.evidenceDir}/`))
  if (facts.git.head !== rev && !onlyEvidence) {
    findings.push(finding(INCONCLUSIVE, 'REVISION_STALE', `repo_root_rev ${rev} is neither HEAD nor the parent of an evidence-only HEAD`))
  }
}

const checkCommits = (log, facts, findings) => {
  const listed = new Set()
  for (const commit of log.commits_covered) {
    const actual = facts.git.commits.get(commit?.sha)
    if (!actual?.exists) {
      findings.push(finding(FAIL, 'COMMIT_UNRESOLVED', `covered commit ${commit?.sha} does not resolve`, 'G8'))
      continue
    }
    listed.add(commit.sha)
    if (commit.subject !== actual.subject) {
      findings.push(finding(FAIL, 'COMMIT_SUBJECT_MISMATCH', `${commit.sha} subject is "${actual.subject}", not "${commit.subject}"`, 'G8'))
    }
    const unknown = (commit.files_changed ?? []).filter((file) => !actual.files.includes(file))
    if (unknown.length > 0) {
      findings.push(finding(FAIL, 'COMMIT_FILES_MISMATCH', `${commit.sha} does not change ${unknown.join(', ')}`, 'G8'))
    }
    if (!isConventionalCommitSubject(actual.subject)) {
      findings.push(finding(FAIL, 'COMMIT_NOT_CONVENTIONAL', `${commit.sha} subject "${actual.subject}" is not type(feature): subject`, 'G8'))
    }
    if (!/^Signed-off-by: .+$/m.test(actual.message)) {
      findings.push(finding(FAIL, 'COMMIT_UNSIGNED', `${commit.sha} carries no Signed-off-by trailer`, 'G8'))
    }
  }
  if (Array.isArray(facts.git.range)) {
    const missing = facts.git.range.filter((sha) => !listed.has(sha))
    if (missing.length > 0) {
      findings.push(finding(FAIL, 'COMMITS_INCOMPLETE', `commits_covered omits ${missing.join(', ')} made since the phase base`, 'G8'))
    }
  }
}

const checkCycles = (log, version, facts, findings) => {
  for (const cycle of log.test_integrity.cycles) {
    const label = `cycle ${cycle?.cycle ?? '?'}`
    const red = facts.files.get(cycle?.red_snapshot_ref)
    const green = facts.files.get(cycle?.green_snapshot_ref)
    if (red === undefined || green === undefined) {
      findings.push(finding(INCONCLUSIVE, 'SNAPSHOT_MISSING', `${label} snapshot missing`, 'G9'))
    } else {
      const testFile = cycle.test_files?.[0]
      const atRed = facts.git.shows.get(`${cycle.red_commit}:${testFile}`)
      const atGreen = facts.git.shows.get(`${cycle.green_commit}:${testFile}`)
      if (atRed !== red.content || atGreen !== green.content) {
        findings.push(finding(INCONCLUSIVE, 'SNAPSHOT_MISMATCH', `${label} snapshots differ from ${testFile} at its RED/GREEN commits`, 'G9'))
      } else if (!onlyAdditions(red.content, green.content)) {
        findings.push(finding(FAIL, 'TEST_TAMPERED', `${label} removed or changed a line of ${testFile} between RED and GREEN`, 'G9'))
      }
    }
    if (version === 'v1') continue
    const redStdout = facts.files.get(cycle?.red_stdout_ref)
    const redExit = parseExit(facts.files.get(cycle?.red_exit_code_ref)?.content)
    if (redStdout === undefined || redExit === undefined) {
      findings.push(finding(INCONCLUSIVE, 'RED_EVIDENCE_MISSING', `${label} RED stdout or exit code missing`, 'G10'))
    } else if (redStdout.sha256 !== cycle.red_stdout_sha256) {
      findings.push(finding(INCONCLUSIVE, 'RED_HASH_MISMATCH', `${label} RED stdout sha256 differs`, 'G10'))
    } else if (redExit === 0) {
      findings.push(finding(FAIL, 'RED_NEVER_FAILED', `${label} RED run exited 0: the test never failed`, 'G10'))
    }
  }
}

const verdictOf = (findings) => {
  if (findings.some((f) => f.severity === FAIL)) return 'fail'
  return findings.some((f) => f.severity === INCONCLUSIVE) ? 'inconclusive' : 'pass'
}

// facts: { files: Map<ref, { content, sha256 }>, evidenceDir, git: { head, headParent,
// headFiles, commits: Map<sha, { exists, subject, message, files }>, range?: sha[],
// shows: Map<'sha:path', content> } }
export const verifyEvidence = (log, facts) => {
  const version = versionOf(log)
  if (!SUPPORTED_SCHEMAS.includes(version)) {
    const findings = [finding(INCONCLUSIVE, 'SCHEMA_UNSUPPORTED', `$schema ${log?.$schema ?? '(none)'} is not a supported evidence schema`)]
    return { verdict: 'inconclusive', findings }
  }
  const missing = ['story', 'repo_root_rev', 'produced_at', 'tech_adapter'].filter((field) => !isText(log[field]))
  if (!Array.isArray(log.gates)) missing.push('gates')
  if (!Array.isArray(log.commits_covered)) missing.push('commits_covered')
  if (!Array.isArray(log.test_integrity?.cycles)) missing.push('test_integrity.cycles')
  if (missing.length > 0) {
    return { verdict: 'inconclusive', findings: [finding(INCONCLUSIVE, 'FIELD_MISSING', `missing or malformed: ${missing.join(', ')}`)] }
  }

  const findings = []
  for (const gate of checkGateSet(log, version, findings)) checkGate(gate, version, facts, findings)
  checkRevision(log, facts, findings)
  checkCommits(log, facts, findings)
  checkCycles(log, version, facts, findings)
  return { verdict: verdictOf(findings), findings }
}
