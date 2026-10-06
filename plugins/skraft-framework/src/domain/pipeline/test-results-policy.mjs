// Pure: did the tests run, and did they pass — read from the quality-gates evidence log the
// engineer committed (quality-gates-evidence-contract) and from the code's own check of
// that log (EvidenceVerification, journaled by RunPipeline). The log says what ran; the
// verification says whether the log can be believed.

const gateKey = (gate) => (gate.scope ? `${gate.id}/${gate.scope}` : gate.id)

// evidence — the parsed log, or null; verification — run journal qualityGates, or null
export const testResults = ({ evidenceLog = null, evidence = null, verification = null }) => {
  const gates = Array.isArray(evidence?.gates)
    ? evidence.gates.filter((gate) => gate && typeof gate === 'object').map((gate) => ({
      id: gateKey(gate),
      label: gate.label ?? gate.id,
      status: gate.status ?? null,
      total: gate.metrics?.tests_total ?? null,
      passed: gate.metrics?.tests_passed ?? null,
      failed: gate.metrics?.tests_failed ?? null,
      rationale: gate.status === 'not_applicable' ? gate.rationale ?? null : null,
    }))
    : []
  const counted = gates.filter((gate) => typeof gate.total === 'number')
  const sum = (field) => counted.reduce((total, gate) => total + (gate[field] ?? 0), 0)
  const verified = verification && (!evidenceLog || verification.evidenceLog === evidenceLog) ? verification : null
  return {
    evidenceLog,
    producedAt: evidence?.produced_at ?? null,
    revision: evidence?.repo_root_rev ?? null,
    schema: evidence?.$schema ?? null,
    gates,
    tests: counted.length > 0 ? { total: sum('total'), passed: sum('passed'), failed: sum('failed') } : null,
    cycles: Array.isArray(evidence?.test_integrity?.cycles) ? evidence.test_integrity.cycles.length : null,
    verdict: verified?.verdict ?? null,
    verifiedAt: verified?.at ?? null,
    findings: (verified?.findings ?? []).map((f) => ({ severity: f.severity, code: f.code, detail: f.detail, gate: f.gate ?? null })),
  }
}
