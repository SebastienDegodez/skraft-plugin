#!/usr/bin/env bash
# A/B benchmark of one agent suite at two refs, each in its own git worktree.
#
#   ./eng/bench-agent-ab.sh <suite> <control-ref> <candidate-ref>
#   ./eng/bench-agent-ab.sh software-engineer-throughput origin/main perf/tdd-loop-v1
#
# The suite (tests/agents/<suite>/: spec + fixtures) is taken from the CURRENT
# checkout and copied into both worktrees, so both arms see the same stimulus,
# fixture and graders; only the descriptors, skills and plugin code differ.
# Each arm runs through eng/run-vally-evals.sh of its own ref — the only eval
# entry point — then eng/compare-agent-ab.mjs reads the two results.jsonl.
#
# Environment:
#   BENCH_DIR=./bench-results     Output root (worktrees are removed, results kept)
#   RUNS=<n>                      Trials per stimulus and per arm, written into each arm's copy
#                                 of the spec (default: the spec's defaults.runs)
#   ARMS_SEQUENTIAL=1             Run the arms one after the other (default: in parallel)
#   KEEP_WORKTREES=1              Keep both worktrees for inspection
#   CONTROL_FROM=<run dir>        Reuse the control arm of an earlier run of this suite instead of
#                                 running it again (bench-results/<suite>/<stamp>). Refused when that
#                                 run's suite differs from the current one. A reused arm is one frozen
#                                 draw: the report says so, and it is never a verdict to publish.
#   plus every variable eng/run-vally-evals.sh reads (MODEL, VALLY, ...).
#
# Exit code: 0 improved / no-gain, 3 quality regression, 4 a trial errored, 1 an arm produced no results.

set -euo pipefail

if [ $# -ne 3 ]; then
  sed -n '2,6p' "$0" >&2
  exit 2
fi

SUITE="$1"
CONTROL_REF="$2"
CANDIDATE_REF="$3"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUITE_DIR="$ROOT/tests/agents/$SUITE"
[ -f "$SUITE_DIR/eval.yaml" ] || { echo "No agent suite at tests/agents/$SUITE/eval.yaml" >&2; exit 2; }

# Fingerprint of the suite (spec + fixtures) both arms run, so a reused control arm can be checked.
suite_hash() {
  node -e 'const{createHash}=require("node:crypto"),fs=require("node:fs"),path=require("node:path");
const walk=(d)=>fs.readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:1).flatMap((e)=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const h=createHash("sha256");for(const f of walk(process.argv[1])){h.update(path.relative(process.argv[1],f));h.update(fs.readFileSync(f))}
process.stdout.write(h.digest("hex"))' "$1"
}
SUITE_HASH="$(suite_hash "$SUITE_DIR")"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BENCH_DIR:-$ROOT/bench-results}/$SUITE/$STAMP"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"

prepare_arm() {
  local ARM="$1" REF="$2"
  local TREE="$OUT/$ARM/worktree"
  git -C "$ROOT" worktree add --detach --quiet "$TREE" "$REF"
  git -C "$TREE" rev-parse HEAD > "$OUT/$ARM/sha"
  rm -rf "$TREE/tests/agents/$SUITE"
  mkdir -p "$TREE/tests/agents"
  cp -R "$SUITE_DIR" "$TREE/tests/agents/$SUITE"
  # The runner passes RUNS to skill specs only: an agent suite runs its defaults.runs, so the
  # copy of the spec carries the trial count (the committed spec stays as it is).
  if [ -n "${RUNS:-}" ]; then
    sed -i.bak -E "s/^(  runs:) [0-9]+$/\1 $RUNS/" "$TREE/tests/agents/$SUITE/eval.yaml"
    rm -f "$TREE/tests/agents/$SUITE/eval.yaml.bak"
  fi
  # The executor imports the Copilot SDK; both arms share the current checkout's install.
  if [ -d "$ROOT/node_modules" ] && [ ! -e "$TREE/node_modules" ]; then
    ln -s "$ROOT/node_modules" "$TREE/node_modules"
  fi
  echo "$REF" > "$OUT/$ARM/ref"
  echo "$SUITE_HASH" > "$OUT/$ARM/suite"
}

run_arm() {
  local ARM="$1"
  local TREE="$OUT/$ARM/worktree"
  RESULTS_DIR="$OUT/$ARM/results" "$TREE/eng/run-vally-evals.sh" agents "$SUITE" \
    > "$OUT/$ARM/run.log" 2>&1 || echo "[$ARM] runner exited non-zero (see $OUT/$ARM/run.log)" >&2
}

cleanup() {
  [ "${KEEP_WORKTREES:-0}" = "1" ] && return
  for ARM in control candidate; do
    [ -d "$OUT/$ARM/worktree" ] && git -C "$ROOT" worktree remove --force "$OUT/$ARM/worktree" 2>/dev/null || true
  done
}
trap cleanup EXIT

mkdir -p "$OUT/control" "$OUT/candidate"
REUSED=""
if [ -n "${CONTROL_FROM:-}" ]; then
  FROM="$(cd "$CONTROL_FROM" && pwd)"
  PREVIOUS="$(find "$FROM/control/results/$SUITE/live" -name results.jsonl -type f 2>/dev/null | head -1)"
  [ -n "$PREVIOUS" ] || { echo "CONTROL_FROM: no control results.jsonl under $FROM" >&2; exit 2; }
  if [ ! -f "$FROM/control/suite" ]; then
    echo "CONTROL_FROM: $FROM records no suite fingerprint; reusing it on trust that the suite has not changed" >&2
  elif [ "$(cat "$FROM/control/suite")" != "$SUITE_HASH" ]; then
    echo "CONTROL_FROM: $FROM ran another version of tests/agents/$SUITE; run the control arm again" >&2
    exit 2
  fi
  mkdir -p "$OUT/control/results/$SUITE/live/reused"
  cp "$PREVIOUS" "$OUT/control/results/$SUITE/live/reused/results.jsonl"
  cp "$FROM/control/sha" "$OUT/control/sha" 2>/dev/null || echo unknown > "$OUT/control/sha"
  echo "$CONTROL_REF" > "$OUT/control/ref"
  echo "$FROM" > "$OUT/control/reused-from"
  REUSED="$FROM"
else
  prepare_arm control "$CONTROL_REF"
fi
prepare_arm candidate "$CANDIDATE_REF"

echo "A/B $SUITE: $CONTROL_REF ($(cat "$OUT/control/sha")) vs $CANDIDATE_REF ($(cat "$OUT/candidate/sha"))"
echo "Results: $OUT"
if [ -n "$REUSED" ]; then
  echo "Control arm reused from $REUSED: one frozen draw, not a verdict to publish"
  run_arm candidate
elif [ "${ARMS_SEQUENTIAL:-0}" = "1" ]; then
  run_arm control
  run_arm candidate
else
  run_arm control &
  run_arm candidate &
  wait
fi

results_of() { find "$OUT/$1/results/$SUITE/live" -name results.jsonl -type f 2>/dev/null | head -1; }
CONTROL_JSONL="$(results_of control)"
CANDIDATE_JSONL="$(results_of candidate)"
if [ -z "$CONTROL_JSONL" ] || [ -z "$CANDIDATE_JSONL" ]; then
  echo "An arm produced no results.jsonl; see $OUT/*/run.log" >&2
  exit 1
fi

node "$ROOT/eng/compare-agent-ab.mjs" \
  --control "$CONTROL_JSONL" --candidate "$CANDIDATE_JSONL" \
  --control-ref "$CONTROL_REF" --candidate-ref "$CANDIDATE_REF" \
  ${REUSED:+--control-reused "$REUSED"} \
  --out "$OUT/comparison.json" --markdown "$OUT/comparison.md"
