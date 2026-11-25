import { isConventionalCommitSubject } from './commit-convention.mjs'

// Pure verification of a quality-gates evidence log (quality-gates-evidence-contract).
// No IO: the application layer resolves every file and Git fact the log points at and
// hands them in as `facts`. The verdict is derived, never read from the log:
//   fail          — the substrate proves a gate failed or the log contradicts Git;
//   inconclusive  — a claim cannot be checked (missing, malformed, altered evidence);
//   pass          — every claim was checked against its substrate.
// A v7 log carries only the verdicts its scripts wrote; commit.convention and test.integrity
// are derived here from Git, never read from the log.
// A `notice` finding records what the verdict does not turn on (G6 not run, v5 and v6).

export const SUPPORTED_SCHEMAS = Object.freeze(['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'])

// v7 names its gates `type.description`; architecture, coverage and mutation left the pipeline.
// The log records the gates a command attests; qg-verify derives the two Git gates itself.
export const V7_GATES = Object.freeze(['test.acceptance', 'test.unit', 'build.compile', 'build.lint', 'test.no-mocks-core'])
export const V7_DERIVED_GATES = Object.freeze(['commit.convention', 'test.integrity'])
export const SCREENSHOTS_GATE = 'evidence.screenshots'

// Gates every log of a schema version must carry (a gate may be not_applicable with a rationale).
const REQUIRED_GATES = Object.freeze({
  v1: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9'],
  v2: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10'],
  v3: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11'],
  v4: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11'],
  v5: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11'],
  // v6 drops G10: the acceptance RED commit is the proof, no RED run is captured.
  v6: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G11'],
  v7: V7_GATES,
})
// Schemas whose cycles carry a captured RED run (G10).
const RED_CAPTURED = new Set(['v2', 'v3', 'v4', 'v5'])
// Schemas where G6 may be not_run: mutation is the developer's.
const MUTATION_OPTIONAL = new Set(['v5', 'v6'])
const G6_SCOPES = Object.freeze(['core', 'boundary'])
// Gates attested by the log structure rather than a runner exit: G8/G9/G10 by commits and
// test-integrity cycles (G10 up to v5). The no-mocks gate attests an empty scan output.
const STRUCTURAL_GATES = new Set(['G8', 'G9', 'G10', 'commit.convention', 'test.integrity', SCREENSHOTS_GATE])
const NO_MOCKS_GATES = new Set(['G7', 'test.no-mocks-core'])
const commitGate = (version) => (version === 'v7' ? 'commit.convention' : 'G8')

const INCONCLUSIVE = 'inconclusive'
const FAIL = 'fail'
const NOTICE = 'notice'

const finding = (severity, code, detail, gate) => Object.freeze({ severity, code, detail, ...(gate ? { gate } : {}) })
const isText = (value) => typeof value === 'string' && value.length > 0
const versionOf = (log) => (typeof log?.$schema === 'string' ? log.$schema.match(/^quality-gates-evidence\/(v\d+)$/)?.[1] : undefined)
// v4 records one G6 entry per mutation scope; every other schema carries a single G6.
const gateKey = (gate, version) => (version === 'v4' && gate.id === 'G6' ? `G6/${gate.scope}` : gate.id)

const screenshotsOf = (gate) => (Array.isArray(gate?.screenshots) ? gate.screenshots.filter((shot) => shot && typeof shot === 'object') : [])

// The text files a log points at, so the application layer can read exactly those.
export const evidenceReferences = (log) => {
  const gates = Array.isArray(log?.gates) ? log.gates : []
  const cycles = Array.isArray(log?.test_integrity?.cycles) ? log.test_integrity.cycles : []
  return [...new Set([
    ...gates.flatMap((gate) => [gate?.stdout_ref, gate?.exit_code_ref]),
    ...cycles.flatMap((cycle) => [cycle?.red_stdout_ref, cycle?.red_exit_code_ref, cycle?.red_snapshot_ref, cycle?.green_snapshot_ref]),
  ].filter(isText))]
}

// The binary captures a v7 log points at: screenshots are hashed byte for byte.
export const screenshotReferences = (log) => {
  const gates = Array.isArray(log?.gates) ? log.gates : []
  return [...new Set(gates.filter((gate) => gate?.id === SCREENSHOTS_GATE).flatMap(screenshotsOf).map((shot) => shot.ref).filter(isText))]
}

// A story is frontend when it touches a Playwright test, a React package or a @visual scenario.
const E2E_DIR = /(?:^|\/)tests\/e2e\//
const PLAYWRIGHT_CONFIG = /(?:^|\/)playwright\.config\.[^/]+$/
const PACKAGE_JSON = /(?:^|\/)package\.json$/
const FEATURE_FILE = /\.feature$/
const declaresReact = (content) => {
  try {
    const manifest = JSON.parse(content)
    return ['dependencies', 'devDependencies', 'peerDependencies'].some((field) => Object.hasOwn(manifest?.[field] ?? {}, 'react'))
  } catch {
    return /"react"\s*:/.test(content)
  }
}

// Paths whose content at repo_root_rev decides frontend detection.
export const frontendProbes = (paths) => paths.filter((path) => PACKAGE_JSON.test(path) || FEATURE_FILE.test(path))

// contentAt(path) → the file at repo_root_rev, or undefined when absent.
export const frontendSignals = (paths, contentAt) => [...new Set(paths)].filter((path) => {
  if (E2E_DIR.test(path) || PLAYWRIGHT_CONFIG.test(path)) return true
  const content = contentAt(path)
  if (typeof content !== 'string') return false
  if (PACKAGE_JSON.test(path)) return declaresReact(content)
  return FEATURE_FILE.test(path) && /(?:^|\s)@visual(?![\w-])/.test(content)
})

// A file the RED may hold as a test: a Gherkin feature, a file under a test folder or named
// as a test. Production stubs committed with the RED are not tests: their GREEN may rewrite them.
const TEST_DIR = /(?:^|\/)(?:tests?|__tests__|specs?|e2e)\//i
const TEST_NAME = /(?:\.(?:test|spec)\.[^/]+|Tests?\.cs|(?:^|\/)test_[^/]+\.py|_test\.py)$/
export const isTestPath = (path) => typeof path === 'string' && (FEATURE_FILE.test(path) || TEST_DIR.test(path) || TEST_NAME.test(path))
const isTestCommit = (subject) => /^test\(/.test(subject ?? '')
const deviates = (message) => /^PLAN_DEVIATION:/m.test(message ?? '')

// v7 test.integrity, from Git alone. `red` are the DISTILL commits before the DELIVER base and
// `delivered` the DELIVER commits, both oldest first, each { sha, subject, files }. Every test
// file a `test` commit holds is guarded from then on; returns each later change to one of
// them, for the application layer to read before and after.
export const integrityChanges = (red, delivered) => {
  const guarded = new Set(red.filter((commit) => isTestCommit(commit.subject)).flatMap((commit) => commit.files.filter(isTestPath)))
  const atDeliverBase = [...guarded]
  const changes = []
  for (const commit of delivered) {
    for (const file of commit.files) if (guarded.has(file)) changes.push({ sha: commit.sha, file })
    if (isTestCommit(commit.subject)) for (const file of commit.files.filter(isTestPath)) guarded.add(file)
  }
  return { guarded: atDeliverBase, changes }
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
  // v5+: mutation is the developer's; without a declared command G6 is not run, and said so.
  if (gate.status === 'not_run' && gate.id === 'G6' && MUTATION_OPTIONAL.has(version)) {
    if (!isText(gate.rationale)) findings.push(finding(INCONCLUSIVE, 'RATIONALE_MISSING', `${key} is not_run without a rationale`, key))
    else findings.push(finding(NOTICE, 'G6_NOT_RUN', `G6 not run: ${gate.rationale}`, key))
    return
  }
  if (gate.status !== 'pass' && gate.status !== 'fail') {
    findings.push(finding(INCONCLUSIVE, 'STATUS_INVALID', `${key} status ${gate.status} is not pass, fail or not_applicable${MUTATION_OPTIONAL.has(version) && gate.id === 'G6' ? ' (or not_run)' : ''}`, key))
    return
  }
  if (gate.status === 'pass' && gate.metrics?.tests_failed > 0) {
    findings.push(finding(FAIL, 'TESTS_FAILED_WHILE_PASS', `${key} passes with ${gate.metrics.tests_failed} failed test(s)`, key))
  }
  if (gate.id === SCREENSHOTS_GATE && version === 'v7') {
    checkScreenshotFiles(gate, facts, findings)
    return
  }
  // v7 keeps no stdout, exit code or hash: the status was written by the script that ran it,
  // with the tree it ran on — a verdict from another tree than repo_root_rev's is stale.
  if (version === 'v7') {
    if (gate.tree !== facts.git.tree) findings.push(finding(INCONCLUSIVE, 'GATE_STALE', `${key} ran on another tree than repo_root_rev: run it again`, key))
    return
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

  // The no-mocks gate attests an absence: the scan for mocking symbols printed nothing.
  if (NO_MOCKS_GATES.has(gate.id)) {
    if (gate.status === 'pass' && stdout !== undefined && stdout.content.trim() !== '') {
      findings.push(finding(FAIL, 'MOCKS_FOUND', `${key} passes but ${gate.stdout_ref} lists mocking symbols`, key))
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

const checkScreenshotFiles = (gate, facts, findings) => {
  for (const shot of screenshotsOf(gate)) {
    const capture = facts.screenshots?.get(shot.ref)
    if (!isText(shot.ref) || capture === undefined) {
      findings.push(finding(INCONCLUSIVE, 'SCREENSHOT_MISSING', `screenshot ${shot.ref ?? '(none)'} is not on disk`, SCREENSHOTS_GATE))
    } else if (shot.sha256 !== capture.sha256) {
      findings.push(finding(INCONCLUSIVE, 'SCREENSHOT_HASH_MISMATCH', `screenshot sha256 differs from ${shot.ref}`, SCREENSHOTS_GATE))
    }
  }
}

// v7: a frontend story must show what it delivered; a screenshot gate needs captures.
const checkScreenshots = (gates, facts, findings) => {
  const gate = gates.find((entry) => entry.id === SCREENSHOTS_GATE)
  const signals = Array.isArray(facts.frontend) ? facts.frontend : []
  const shots = screenshotsOf(gate).length
  if (signals.length > 0 && (gate === undefined || gate.status === 'not_applicable' || (gate.status === 'pass' && shots === 0))) {
    findings.push(finding(FAIL, 'SCREENSHOTS_MISSING', `frontend story (${signals.join(', ')}) records no screenshot`, SCREENSHOTS_GATE))
  } else if (gate?.status === 'pass' && shots === 0) {
    findings.push(finding(INCONCLUSIVE, 'SCREENSHOTS_EMPTY', `${SCREENSHOTS_GATE} passes without any screenshot`, SCREENSHOTS_GATE))
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
  if (version === 'v7') {
    for (const id of seen.keys()) {
      if (V7_DERIVED_GATES.includes(id)) findings.push(finding(INCONCLUSIVE, 'GATE_DERIVED', `${id} is derived from Git by qg-verify, never recorded in the log`, id))
      else if (!V7_GATES.includes(id) && id !== SCREENSHOTS_GATE) findings.push(finding(INCONCLUSIVE, 'GATE_UNKNOWN', `${id} is not a v7 gate`, id))
    }
  }
  return gates
}

const checkRevision = (log, version, facts, findings) => {
  const rev = log.repo_root_rev
  if (!facts.git.commits.get(rev)?.exists) {
    findings.push(finding(FAIL, 'REVISION_UNRESOLVED', `repo_root_rev ${rev} does not resolve`))
    return
  }
  // v7: the evidence stays out of Git, so the log describes HEAD itself.
  if (version === 'v7') {
    const tracked = Array.isArray(facts.git.trackedEvidence) ? facts.git.trackedEvidence : []
    if (tracked.length > 0) findings.push(finding(FAIL, 'EVIDENCE_COMMITTED', `evidence is tracked by Git: ${tracked.join(', ')}`))
    if (facts.git.head !== rev) findings.push(finding(INCONCLUSIVE, 'REVISION_STALE', `repo_root_rev ${rev} is not HEAD`))
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

const checkCommits = (log, version, facts, findings) => {
  const gate = commitGate(version)
  const listed = new Set()
  for (const commit of log.commits_covered) {
    const actual = facts.git.commits.get(commit?.sha)
    if (!actual?.exists) {
      findings.push(finding(FAIL, 'COMMIT_UNRESOLVED', `covered commit ${commit?.sha} does not resolve`, gate))
      continue
    }
    listed.add(commit.sha)
    if (commit.subject !== actual.subject) {
      findings.push(finding(FAIL, 'COMMIT_SUBJECT_MISMATCH', `${commit.sha} subject is "${actual.subject}", not "${commit.subject}"`, gate))
    }
    const unknown = (commit.files_changed ?? []).filter((file) => !actual.files.includes(file))
    if (unknown.length > 0) {
      findings.push(finding(FAIL, 'COMMIT_FILES_MISMATCH', `${commit.sha} does not change ${unknown.join(', ')}`, gate))
    }
    if (!isConventionalCommitSubject(actual.subject)) {
      findings.push(finding(FAIL, 'COMMIT_NOT_CONVENTIONAL', `${commit.sha} subject "${actual.subject}" is not type(feature): subject`, gate))
    }
    if (!/^Signed-off-by: .+$/m.test(actual.message)) {
      findings.push(finding(FAIL, 'COMMIT_UNSIGNED', `${commit.sha} carries no Signed-off-by trailer`, gate))
    }
  }
  if (Array.isArray(facts.git.range)) {
    const missing = facts.git.range.filter((sha) => !listed.has(sha))
    if (missing.length > 0) {
      findings.push(finding(FAIL, 'COMMITS_INCOMPLETE', `commits_covered omits ${missing.join(', ')} made since the phase base`, gate))
    }
  }
}

// v7 commit.convention: every commit since the DELIVER base, read from Git.
const checkCommitsFromGit = (facts, findings) => {
  const range = facts.git.range
  if (!Array.isArray(range)) {
    findings.push(finding(INCONCLUSIVE, 'BASE_UNKNOWN', 'no DELIVER base: the delivered commits cannot be listed', 'commit.convention'))
    return
  }
  if (range.length === 0) findings.push(finding(INCONCLUSIVE, 'RANGE_EMPTY', 'no commit since the DELIVER base', 'commit.convention'))
  for (const sha of range) {
    const actual = facts.git.commits.get(sha)
    if (!actual?.exists) {
      findings.push(finding(INCONCLUSIVE, 'COMMIT_UNREADABLE', `${sha} cannot be read`, 'commit.convention'))
      continue
    }
    if (!isConventionalCommitSubject(actual.subject)) {
      findings.push(finding(FAIL, 'COMMIT_NOT_CONVENTIONAL', `${sha} subject "${actual.subject}" is not type(feature): subject`, 'commit.convention'))
    }
    if (!/^Signed-off-by: .+$/m.test(actual.message)) {
      findings.push(finding(FAIL, 'COMMIT_UNSIGNED', `${sha} carries no Signed-off-by trailer`, 'commit.convention'))
    }
  }
}

// v7 test.integrity: a test the RED committed only grows; a replaced line needs a PLAN_DEVIATION.
const checkIntegrityFromGit = (gates, facts, findings) => {
  const integrity = facts.git.integrity
  const acceptance = gates.find((gate) => gate.id === 'test.acceptance')
  if (!integrity) {
    findings.push(finding(INCONCLUSIVE, 'RED_BASE_UNKNOWN', 'no DISTILL base: the RED acceptance tests cannot be found', 'test.integrity'))
    return
  }
  if (integrity.guarded.length === 0) {
    if (acceptance?.status !== 'not_applicable') findings.push(finding(INCONCLUSIVE, 'RED_TESTS_MISSING', 'no test commit before DELIVER holds an acceptance test', 'test.integrity'))
    return
  }
  for (const change of integrity.changes) {
    if (typeof change.before !== 'string') continue
    const tampered = typeof change.after !== 'string' || !onlyAdditions(change.before, change.after)
    if (!tampered) continue
    if (deviates(facts.git.commits.get(change.sha)?.message)) {
      findings.push(finding(NOTICE, 'PLAN_DEVIATION', `${change.sha} rewrites ${change.file} under a PLAN_DEVIATION`, 'test.integrity'))
    } else {
      findings.push(finding(FAIL, 'TEST_TAMPERED', `${change.sha} removed or changed a line of ${change.file}`, 'test.integrity'))
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
    if (!RED_CAPTURED.has(version)) continue
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

// facts: { files: Map<ref, { content, sha256 }>, screenshots?: Map<ref, { sha256 }>,
// frontend?: path[], evidenceDir, git: { head, headParent, headFiles, trackedEvidence?: path[],
// commits: Map<sha, { exists, subject, message, files }>, range?: sha[], shows: Map<'sha:path', content>,
// tree?: tree of repo_root_rev (v7), integrity?: { guarded: path[], changes: [{ sha, file, before, after }] } (v7) } }
export const verifyEvidence = (log, facts) => {
  const version = versionOf(log)
  if (!SUPPORTED_SCHEMAS.includes(version)) {
    const findings = [finding(INCONCLUSIVE, 'SCHEMA_UNSUPPORTED', `$schema ${log?.$schema ?? '(none)'} is not a supported evidence schema`)]
    return { verdict: 'inconclusive', findings }
  }
  const missing = ['story', 'repo_root_rev', 'produced_at', 'tech_adapter'].filter((field) => !isText(log[field]))
  if (!Array.isArray(log.gates)) missing.push('gates')
  if (version !== 'v7' && !Array.isArray(log.commits_covered)) missing.push('commits_covered')
  if (version !== 'v7' && !Array.isArray(log.test_integrity?.cycles)) missing.push('test_integrity.cycles')
  if (missing.length > 0) {
    return { verdict: 'inconclusive', findings: [finding(INCONCLUSIVE, 'FIELD_MISSING', `missing or malformed: ${missing.join(', ')}`)] }
  }

  const findings = []
  const gates = checkGateSet(log, version, findings)
  for (const gate of gates) checkGate(gate, version, facts, findings)
  checkRevision(log, version, facts, findings)
  if (version === 'v7') {
    checkScreenshots(gates, facts, findings)
    checkCommitsFromGit(facts, findings)
    checkIntegrityFromGit(gates, facts, findings)
  } else {
    checkCommits(log, version, facts, findings)
    checkCycles(log, version, facts, findings)
  }
  return { verdict: verdictOf(findings), findings }
}
