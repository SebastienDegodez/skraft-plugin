// Single source of truth for the SKRAFT fast CI gates.
// Consumed by scripts/local-ci.mjs (runner) AND plugins/src/cli/check-freshness.mjs
// (CI-parity check): every gate's ciMarker must appear in the CI workflow text.
// The test gate keeps dynamic args in local-ci.mjs (directory enumeration);
// its marker still lives here so parity covers it.

export const TEST_GATE = {
  name: 'Framework tests & coverage (node --test)',
  ciMarker: 'tests/skraft-framework/*.test.mjs'
}

export const STATIC_GATES = [
  {
    name: 'Guardrail config in sync (US2)',
    cmd: 'node',
    args: ['plugins/src/cli/build-config-bin.mjs', '--check'],
    ciMarker: 'build-config-bin.mjs --check'
  },
  {
    name: 'Agent model policy (B12)',
    cmd: 'node',
    args: ['plugins/src/cli/resolve-model-bin.mjs', '--check'],
    ciMarker: 'resolve-model-bin.mjs --check'
  },
  {
    name: 'CLI ensemble freshness',
    cmd: 'node',
    args: ['plugins/src/cli/check-freshness-bin.mjs', '--check'],
    ciMarker: 'check-freshness-bin.mjs --check'
  }
]

export const ciGateMarkers = () =>
  [TEST_GATE, ...STATIC_GATES].map(({ name, ciMarker }) => ({ gate: name, marker: ciMarker }))
