// Pure domain: CLI-ensemble freshness policy. No IO.
// Guards the shipped plugin coherence: one master version (plugin manifest),
// a hooks manifest that only declares routable hook types, and a CI workflow
// that mirrors every local gate. Detection is a tool call, never an LLM assertion.

const finding = (code, severity, source, expected, actual, message) => ({
  code,
  severity,
  source,
  expected,
  actual,
  message
})

// Every distribution surface must carry the master version (plugin manifest).
// Missing version anywhere = blocker; divergence = blocker.
export const checkVersionSync = ({ master, others = [] }) => {
  const findings = []
  if (!master?.version) {
    findings.push(
      finding('VERSION_MISSING', 'blocker', master?.source ?? 'master', undefined, undefined,
        `${master?.source ?? 'master'} declares no version`)
    )
  }
  for (const entry of others) {
    if (!entry.version) {
      findings.push(
        finding('VERSION_MISSING', 'blocker', entry.source, master?.version, undefined,
          `${entry.source} declares no version`)
      )
    } else if (master?.version && entry.version !== master.version) {
      findings.push(
        finding('VERSION_DESYNC', 'blocker', entry.source, master.version, entry.version,
          `${entry.source} is ${entry.version} but ${master.source} is ${master.version}`)
      )
    }
  }
  return findings
}

// The hooks manifest must never declare a hook type the router cannot route
// (blocker: the harness would call a dead command). A routable type absent from
// the manifest is only surfaced (medium): support may land before declaration.
export const checkHooksParity = ({ declared = [], supported = [] }) => {
  const findings = []
  for (const type of declared) {
    if (!supported.includes(type)) {
      findings.push(
        finding('UNROUTED_HOOK', 'blocker', 'hooks.json', supported.join(','), type,
          `hooks.json declares ${type} but the hook router cannot route it`)
      )
    }
  }
  for (const type of supported) {
    if (!declared.includes(type)) {
      findings.push(
        finding('UNDECLARED_HOOK', 'medium', 'hook-router', declared.join(','), type,
          `the hook router supports ${type} but hooks.json never declares it`)
      )
    }
  }
  return findings
}

// Every local gate must have its distinctive command marker somewhere in the
// CI workflow text — local-ci and CI must stay the same gate set.
export const checkCiParity = ({ markers = [], workflowText = '' }) =>
  markers
    .filter(({ marker }) => !workflowText.includes(marker))
    .map(({ gate, marker }) =>
      finding('CI_GATE_MISSING', 'high', gate, marker, undefined,
        `local gate "${gate}" (${marker}) has no matching step in the CI workflow`)
    )

// A freshness run is only clean when no finding at blocker/high severity exists.
export const hasBlockingFinding = (findings) =>
  findings.some((f) => f.severity === 'blocker' || f.severity === 'high')
