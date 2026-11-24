#!/usr/bin/env bash
# A/B benchmark of RESEARCH and DESIGN at two refs: the two throughput suites one after the
# other through eng/bench-agent-ab.sh, then where the tool time went and how many decisions of
# record each trial wrote (eng/research-design-report.mjs).
#
#   ./eng/bench-research-design.sh <control-ref> <candidate-ref>
#   ./eng/bench-research-design.sh origin/integration/v2-next origin/feat/v2-research-design-assisted
#
# Run it from this checkout: the suites and the harness are taken from it, the agents and
# skills from each ref.
#
# Environment:
#   RUNS=3                Trials per stimulus and per arm (default 3: a pilot, indicative only)
#   SUITES="a b"          Suites to run (default: solution-researcher-throughput solution-architect-throughput)
#   plus every variable eng/bench-agent-ab.sh and eng/run-vally-evals.sh read (BENCH_DIR, MODEL, ARMS_SEQUENTIAL, ...).
#
# Exit code: the highest exit code of eng/bench-agent-ab.sh over the suites.

set -uo pipefail

if [ $# -ne 2 ]; then
  sed -n '2,7p' "$0" >&2
  exit 2
fi

CONTROL_REF="$1"
CANDIDATE_REF="$2"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RESULTS="${BENCH_DIR:-$ROOT/bench-results}"
export RUNS="${RUNS:-3}"
WORST=0

for SUITE in ${SUITES:-solution-researcher-throughput solution-architect-throughput}; do
  echo "=== $SUITE: $CONTROL_REF vs $CANDIDATE_REF, $RUNS trial(s) per arm"
  "$ROOT/eng/bench-agent-ab.sh" "$SUITE" "$CONTROL_REF" "$CANDIDATE_REF"
  CODE=$?
  [ "$CODE" -gt "$WORST" ] && WORST="$CODE"
  LAST="$(find "$RESULTS/$SUITE" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort | tail -1)"
  if [ -n "$LAST" ]; then
    node "$ROOT/eng/research-design-report.mjs" "$LAST" --out "$LAST/where-the-time-went.md" > /dev/null \
      && echo "Report: $LAST/comparison.md and $LAST/where-the-time-went.md"
  fi
done

exit "$WORST"
