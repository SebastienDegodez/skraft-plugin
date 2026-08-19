#!/usr/bin/env bash
#
# run-vally-evals.sh — Single entry point for every Vally evaluation.
# Skills run as isolated baseline-versus-treatment comparisons. Agent suites run
# once through their declared custom executor and grade the resulting trajectory.
#
# Usage:
#   ./eng/run-vally-evals.sh                         # every skill + agent suite
#   ./eng/run-vally-evals.sh outside-in-tdd          # one skill
#   ./eng/run-vally-evals.sh agents                  # every agent suite
#   ./eng/run-vally-evals.sh agents agent-behavior   # one agent suite
#
# The plugin axis follows the eval layout, so it activates on its own the day the
# repository ships more than one plugin:
#   one plugin  — tests/skills/<skill>/eval.yaml     ↔ plugins/skraft-framework/skills/<skill>
#   many plugins — tests/<plugin>/<skill>/eval.yaml ↔ plugins/<plugin>/skills/<skill>
#
# Environment:
#   PARALLEL=4        Max concurrent evals (default: 4)
#   RUNS=             Trials per stimulus. Unset — the default — lets each spec's
#                     own `defaults.runs` decide, so the trial budget lives with
#                     the eval it belongs to. Set it only to override every spec.
#   WORKERS=3         Concurrent stimuli within a skill eval (default: 3)
#   AGENT_WORKERS=1   Concurrent stimuli within an agent eval (default: 1)
#   MODEL             Agent model (default: gpt-5.6-luna)
#   JUDGE_MODEL       Judge model (default: gpt-5.6-luna)
#   LIVE_LOGS=1       Stream Vally output while retaining eval.log (default: 1)
#   SKIP_EVALS=""     Override skip list (default: reads skip-evals.txt)
#   SKIP_AGENTS=1     Leave every agent suite out of an unnamed run (default: 0)
#   STIMULI=""        Comma-separated stimulus name fragments. Runs the frozen
#                     spec against only those stimuli — a cheap signal check
#                     before committing the full portfolio to two paired arms.
#                     Output goes to ./eval-results-pilot: a pilot is a budget
#                     probe, never a publishable verdict.
#   PILOT_RUNS=       Override defaults.runs for a pilot only. Keep it at the
#                     depth the real run will use; a pilot that is shallow as
#                     well as narrow measures nothing.
#   RESULTS_DIR       Output root (default: ./eval-results)
#
# Prerequisites:
#   - the Vally CLI: npm install -g @microsoft/vally-cli@0.12.0
#   - COPILOT_GITHUB_TOKEN (fine-grained PAT with Copilot Requests), or `gh auth login`
#
# Skill verdicts go to ./eval-results/<skill>/results.json.
# Agent verdicts go to ./eval-results/<suite>/results.json, raw trials to <suite>/live/.

set -euo pipefail

SKRAFT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VALLY_PACKAGE="${VALLY_PACKAGE:-@microsoft/vally-cli@0.12.0}"
if [ -n "${VALLY:-}" ]; then
  VALLY="$VALLY"
elif command -v vally >/dev/null 2>&1 && [ "$(vally --version)" = "0.12.0" ]; then
  VALLY="vally"
else
  VALLY="npx --yes $VALLY_PACKAGE"
fi
STIMULI="${STIMULI:-}"
PILOT_RUNS="${PILOT_RUNS:-}"
# A pilot answers "does this move anything at all", not "does this skill pass".
# Its output stays out of the directory the dashboard publishes so a probe can
# never be read back as a verdict.
if [ -n "$STIMULI" ]; then
  RESULTS_ROOT="${RESULTS_DIR:-$SKRAFT_ROOT/eval-results-pilot}"
else
  RESULTS_ROOT="${RESULTS_DIR:-$SKRAFT_ROOT/eval-results}"
fi
MODEL="${MODEL:-gpt-5.6-luna}"
JUDGE_MODEL="${JUDGE_MODEL:-gpt-5.6-luna}"
# Empty on purpose: `--runs` overrides whatever the spec declares, so passing it
# unconditionally would silently reduce every spec to one trial per stimulus and
# make almost every verdict underpowered.
RUNS="${RUNS:-}"
RUNS_ARGS=()
[ -n "$RUNS" ] && RUNS_ARGS=(--runs "$RUNS")
WORKERS="${WORKERS:-3}"
AGENT_WORKERS="${AGENT_WORKERS:-1}"
AGENT_MAX_RETRIES="${AGENT_MAX_RETRIES:-0}"
PARALLEL="${PARALLEL:-4}"
LIVE_LOGS="${LIVE_LOGS:-1}"

case "$LIVE_LOGS" in
  0|1) ;;
  *) echo "LIVE_LOGS must be 0 or 1." >&2; exit 1 ;;
esac

SKILL="${1:-}"

# Positional arguments mirror dotnet/skills: <plugin> then <skill>. While the
# repository ships a single plugin there is no plugin to name, so a lone
# argument that is not a directory under tests/ is read as a skill name.
PLUGIN="${1:-}"
SKILL="${2:-}"
if [ -n "$PLUGIN" ] && [ -z "$SKILL" ] && [ ! -d "$SKRAFT_ROOT/tests/$PLUGIN" ]; then
  SKILL="$PLUGIN"
  PLUGIN=""
fi

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

export VALLY_TELEMETRY_OPTOUT=1

# An eval drives a real agent and an LLM judge, so it needs a Copilot-enabled
# token. Vally 0.12.0 reads GITHUB_TOKEN for its judge client, while the spawned
# Copilot runtime reads COPILOT_GITHUB_TOKEN — export the same secret under both.
TOKEN="${COPILOT_GITHUB_TOKEN:-${GITHUB_TOKEN:-}}"
if [ -z "$TOKEN" ] && command -v gh >/dev/null 2>&1 && gh auth token >/dev/null 2>&1; then
  TOKEN="$(gh auth token)"
fi
if [ -z "$TOKEN" ]; then
  echo "Set COPILOT_GITHUB_TOKEN (fine-grained PAT with Copilot Requests) or run 'gh auth login'." >&2
  exit 1
fi
export COPILOT_GITHUB_TOKEN="$TOKEN"
export GITHUB_TOKEN="$TOKEN"

# ---- Skip list --------------------------------------------------------------

SKIP_FILE="$SKRAFT_ROOT/eng/vally-adapter/skip-evals.txt"
if [ -z "${SKIP_EVALS+x}" ] && [ -f "$SKIP_FILE" ]; then
  # awk, not grep: an empty skip list must not abort the run under `set -e`.
  SKIP_EVALS=$(awk '!/^#/ && NF' "$SKIP_FILE" | tr '\n' ' ')
fi
SKIP_EVALS="${SKIP_EVALS:-}"

# ---- Discover evals ---------------------------------------------------------

if [ -n "$PLUGIN" ] && [ -n "$SKILL" ]; then
  ALL_SPECS=("$SKRAFT_ROOT/tests/$PLUGIN/$SKILL/eval.yaml")
elif [ -n "$PLUGIN" ]; then
  ALL_SPECS=()
  while IFS= read -r f; do ALL_SPECS+=("$f"); done \
    < <(find "$SKRAFT_ROOT/tests/$PLUGIN" -name "eval.yaml" -type f | sort)
elif [ -n "$SKILL" ]; then
  ALL_SPECS=()
  while IFS= read -r f; do ALL_SPECS+=("$f"); done \
    < <(find "$SKRAFT_ROOT/tests" -path "*/$SKILL/eval.yaml" -type f | sort)
else
  ALL_SPECS=()
  while IFS= read -r f; do ALL_SPECS+=("$f"); done \
    < <(find "$SKRAFT_ROOT/tests" -name "eval.yaml" -type f | sort)
fi

EVAL_SPECS=()
# `${ARR[@]}` on an EMPTY array is an unbound-variable error under `set -u` in
# bash 3.2 (the macOS default); bash 4.4+ (the CI runner) is lenient, which is
# why this only ever bit locally. The `+` expansion yields nothing when the array
# is unset or empty, so a named subject with no spec reaches the message below in
# both shells instead of dying on "ALL_SPECS[@]: unbound variable".
for spec in ${ALL_SPECS[@]+"${ALL_SPECS[@]}"}; do
  EVAL_NAME=$(basename "$(dirname "$spec")")
  SKIPPED=false
  # An agent suite is single-arm and pins its own model, so a run that varies the
  # model would publish the same suite verdict once per arm.
  if [ "${SKIP_AGENTS:-0}" = "1" ]; then
    case "$spec" in "$SKRAFT_ROOT/tests/agents/"*) SKIPPED=true ;; esac
  fi
  for skip in $SKIP_EVALS; do
    if [ "$EVAL_NAME" = "$skip" ]; then SKIPPED=true; break; fi
  done
  if [ "$SKIPPED" = "true" ]; then
    echo -e "${YELLOW}⚠ Skipping $EVAL_NAME (in skip-evals.txt)${NC}"
  else
    EVAL_SPECS+=("$spec")
  fi
done

if [ ${#EVAL_SPECS[@]} -eq 0 ]; then
  if [ -n "${1:-}" ]; then
    # Named subject with nothing to run: most often a skill that ships without an
    # eval spec (8 of 36 have one). Say which, so the caller does not read this as
    # "the evaluation found nothing".
    echo "No eval spec for '${1}': expected tests/skills/${1}/eval.yaml or tests/agents/${1}/eval.yaml" >&2
  else
    echo "No eval.yaml files to run" >&2
  fi
  exit 1
fi

echo -e "${BOLD}Running ${#EVAL_SPECS[@]} eval(s) with PARALLEL=$PARALLEL RUNS=${RUNS:-per-spec}${NC}"
echo ""

# ---- Per-eval function (runs in background) --------------------------------

STATUS_DIR=$(mktemp -d)

open_log_fd() {
  local LOG="$1"
  if [ "$LIVE_LOGS" = "1" ]; then
    exec 3> >(tee "$LOG")
  else
    exec 3> "$LOG"
  fi
}

run_agent_eval() {
  local EVAL_SPEC="$1"
  local EVAL_DIR="$(dirname "$EVAL_SPEC")"
  local EVAL_NAME="$(basename "$EVAL_DIR")"
  local LIVE_DIR="$RESULTS_ROOT/$EVAL_NAME/live"
  local LOG="$RESULTS_ROOT/$EVAL_NAME/eval.log"
  local STATUS_FILE="$STATUS_DIR/agent__$EVAL_NAME"
  local EXECUTOR="$SKRAFT_ROOT/eng/vally-agent-executor/plugin.mjs"

  mkdir -p "$RESULTS_ROOT/$EVAL_NAME"
  rm -rf "$LIVE_DIR"
  mkdir -p "$LIVE_DIR"

  echo -e "  ${BOLD}▶${NC} $EVAL_NAME — real agent..." >&2
  local EVAL_EXIT=0
  open_log_fd "$LOG"
  {
    echo "=== $EVAL_NAME (agent) ==="
    if $VALLY eval \
      --eval-spec "$EVAL_SPEC" \
      --skill-dir "$SKRAFT_ROOT/plugins/skraft-framework/skills" \
      --executor-plugin "$EXECUTOR" \
      --workers "$AGENT_WORKERS" \
      --max-retries "$AGENT_MAX_RETRIES" \
      --output-dir "$LIVE_DIR"; then
      echo "Agent eval completed"
    else
      EVAL_EXIT=$?
      echo "WARNING: Agent eval failed"
    fi
  } >&3 2>&1
  exec 3>&-

  local RESULTS_JSONL
  RESULTS_JSONL=$(find "$LIVE_DIR" -name "results.jsonl" -type f 2>/dev/null | head -1)

  # Turn the raw trajectory into the same results.json a skill comparison
  # writes, so the publisher and the PR comment need no agent-specific path.
  if [ -n "$RESULTS_JSONL" ]; then
    node "$SKRAFT_ROOT/eng/vally-adapter/adapt-agent.mjs" \
      --results "$RESULTS_JSONL" \
      --spec "$EVAL_SPEC" \
      --suite "$EVAL_NAME" \
      --output-root "$RESULTS_ROOT" \
      --model "$MODEL" \
      >> "$LOG" 2>&1 || echo "WARNING: agent adapter failed" >> "$LOG"
  fi

  if [ "$EVAL_EXIT" -eq 0 ] && [ -n "$RESULTS_JSONL" ]; then
    echo "pass" > "$STATUS_FILE"
    echo -e "  ${GREEN}✔${NC} $EVAL_NAME"
  else
    echo "error" > "$STATUS_FILE"
    echo -e "  ${RED}✘${NC} $EVAL_NAME (see $LOG)"
  fi
}

run_one_eval() {
  local EVAL_SPEC="$1"
  case "$EVAL_SPEC" in
    "$SKRAFT_ROOT/tests/agents/"*) run_agent_eval "$EVAL_SPEC"; return ;;
  esac
  local EVAL_DIR="$(dirname "$EVAL_SPEC")"
  local EVAL_NAME="$(basename "$EVAL_DIR")"
  local EVAL_PLUGIN="$(basename "$(dirname "$EVAL_DIR")")"
  # Multi-plugin layout first, single-plugin layout as the fallback: today
  # EVAL_PLUGIN is the literal `skills` segment of tests/skills/<skill>.
  local SKILL_DIR="$SKRAFT_ROOT/plugins/$EVAL_PLUGIN/skills/$EVAL_NAME"
  if [ ! -d "$SKILL_DIR" ]; then
    SKILL_DIR="$SKRAFT_ROOT/plugins/skraft-framework/skills/$EVAL_NAME"
  fi
  local BASELINE_DIR="$RESULTS_ROOT/$EVAL_NAME/baseline"
  local SKILLED_DIR="$RESULTS_ROOT/$EVAL_NAME/skilled"
  local LOG="$RESULTS_ROOT/$EVAL_NAME/eval.log"

  mkdir -p "$RESULTS_ROOT/$EVAL_NAME"

  # Two concurrent runs of the same eval clobber each other: both wipe and
  # recreate the arm directories, both truncate the same log, and the pairing
  # below can then match a baseline from one run with a treatment from the
  # other. Refuse to start rather than produce a verdict nobody can trust.
  local LOCK_DIR="$RESULTS_ROOT/$EVAL_NAME/.run.lock"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    echo -e "  ${RED}✘${NC} $EVAL_NAME (already running — remove $LOCK_DIR if stale)"
    echo "error" > "$STATUS_DIR/$EVAL_NAME"
    return
  fi
  trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' RETURN

  rm -rf "$BASELINE_DIR" "$SKILLED_DIR"
  mkdir -p "$BASELINE_DIR" "$SKILLED_DIR"

  if [ ! -d "$SKILL_DIR" ]; then
    # Skipped: the eval directory name does not resolve to a shipped skill, so
    # there is no isolated skill set to compare against a zero-skill baseline.
    echo "SKIP: skill dir not found: $SKILL_DIR" > "$LOG"
    echo -e "  ${YELLOW}⚠${NC} $EVAL_NAME (skipped — no skill dir)"
    echo "skip" > "$STATUS_DIR/$EVAL_NAME"
    return
  fi

  # Empty dir used as `--skill-dir` for the baseline so vally discovers zero
  # skills (without it, vally walks up to the repo root and loads every skill
  # under plugins/skraft-framework/skills/, contaminating the baseline). One dir per eval to
  # avoid any cross-run contention when running in parallel.
  local EMPTY_SKILL_DIR
  EMPTY_SKILL_DIR=$(mktemp -d -t vally-empty-skills-XXXXXX)
  local PILOT_SPEC=""
  trap 'rm -rf "$EMPTY_SKILL_DIR"; [ -n "$PILOT_SPEC" ] && rm -f "$PILOT_SPEC"; rmdir "$LOCK_DIR" 2>/dev/null || true' RETURN

  # Pilot: the same frozen spec with fewer stimuli, generated per run. The
  # committed instrument is never edited to make a cheaper measurement possible.
  # The pilot lands beside the frozen spec, never in the results tree: vally
  # resolves fixture `src:` paths relative to the spec file, so a pilot written
  # elsewhere cannot stage any fixture.
  if [ -n "$STIMULI" ]; then
    PILOT_SPEC="$(dirname "$EVAL_SPEC")/.pilot.eval.yaml"
    local KEPT
    if ! KEPT=$(node "$SKRAFT_ROOT/eng/make-pilot-spec.mjs" "$EVAL_SPEC" "$PILOT_SPEC" "$STIMULI" ${PILOT_RUNS:+"$PILOT_RUNS"} 2>&1); then
      echo "$KEPT" > "$LOG"
      echo -e "  ${RED}✘${NC} $EVAL_NAME (pilot: $KEPT)"
      echo "error" > "$STATUS_DIR/$EVAL_NAME"
      return
    fi
    # Archive the pilot beside the results as the record of what actually ran;
    # the executed copy lives next to the spec and is removed by the trap.
    mkdir -p "$RESULTS_ROOT/$EVAL_NAME"
    cp "$PILOT_SPEC" "$RESULTS_ROOT/$EVAL_NAME/pilot.eval.yaml"
    EVAL_SPEC="$PILOT_SPEC"
    echo -e "  ${YELLOW}⚠${NC} $EVAL_NAME — PILOT on $(echo "$KEPT" | paste -sd';' -) (probe only, not a verdict)" >&2
  fi

  echo -e "  ${BOLD}▶${NC} $EVAL_NAME — baseline..." >&2

  open_log_fd "$LOG"
  {
    echo "=== $EVAL_NAME ==="

    # Baseline: no skill available to the agent.
    echo "--- Baseline run ---"
    $VALLY eval \
      --eval-spec "$EVAL_SPEC" \
      --skill-dir "$EMPTY_SKILL_DIR" \
      --model "$MODEL" \
      ${RUNS_ARGS[@]+"${RUNS_ARGS[@]}"} --workers "$WORKERS" \
      --skip-validate \
      --judge-model "$JUDGE_MODEL" \
      --output-dir "$BASELINE_DIR" \
      2>&1 || echo "WARNING: Baseline eval failed"

    echo -e "  ${BOLD}▶${NC} $EVAL_NAME — skilled..." >&2

    # Skilled: exactly the one skill under evaluation.
    echo "--- Skilled run ---"
    $VALLY eval \
      --eval-spec "$EVAL_SPEC" \
      --skill-dir "$SKILL_DIR" \
      --model "$MODEL" \
      ${RUNS_ARGS[@]+"${RUNS_ARGS[@]}"} --workers "$WORKERS" \
      --skip-validate \
      --judge-model "$JUDGE_MODEL" \
      --output-dir "$SKILLED_DIR" \
      2>&1 || echo "WARNING: Skilled eval failed"

    # Adapt
    # Session logging also emits events.jsonl and OpenTelemetry JSONL streams.
    # Only Vally's results.jsonl contains trial-result records for comparison.
    # Vally writes one timestamped directory per invocation. `find` returns
    # them in filesystem order, so pick the newest explicitly: matching a
    # baseline from one invocation with a treatment from another silently
    # breaks the pairing and yields unmatched trials.
    # Vally names its output directory after an ISO timestamp, so the newest
    # invocation sorts last. Lexicographic order is portable and deterministic.
    local BASELINE_JSONL=$(find "$BASELINE_DIR" -name "results.jsonl" -type f 2>/dev/null | sort | tail -1)
    local SKILLED_JSONL=$(find "$SKILLED_DIR" -name "results.jsonl" -type f 2>/dev/null | sort | tail -1)

    if [ -n "$BASELINE_JSONL" ] && [ -n "$SKILLED_JSONL" ]; then
      echo "--- Adapting results ---"
      node "$SKRAFT_ROOT/eng/vally-adapter/adapt.mjs" \
        --baseline "$BASELINE_JSONL" \
        --skilled "$SKILLED_JSONL" \
        --skill "$EVAL_NAME" \
        --skill-path "${SKILL_DIR#"$SKRAFT_ROOT/"}" \
        --output-root "$RESULTS_ROOT" \
        --vally "$VALLY" \
        --model "$MODEL" \
        --judge-model "$JUDGE_MODEL" \
        2>&1
    fi
  } >&3 2>&1
  exec 3>&-

  # Determine status outside the log-capture block
  local RESULTS_FILE="$RESULTS_ROOT/$EVAL_NAME/results.json"
  if [ -f "$RESULTS_FILE" ]; then
    local PASSED=$(node -e "const r=JSON.parse(require('fs').readFileSync('$RESULTS_FILE','utf-8')); console.log(r.verdicts[0].passed)" 2>/dev/null || echo "")
    if [ "$PASSED" = "true" ]; then
      echo "pass" > "$STATUS_DIR/$EVAL_NAME"
      echo -e "  ${GREEN}✔${NC} $EVAL_NAME"
    else
      echo "no_improvement" > "$STATUS_DIR/$EVAL_NAME"
      echo -e "  ${CYAN}⊘${NC} $EVAL_NAME (no improvement)"
    fi
  else
    echo "error" > "$STATUS_DIR/$EVAL_NAME"
    echo -e "  ${RED}✘${NC} $EVAL_NAME (see $LOG)"
  fi
}

export -f run_one_eval
export -f run_agent_eval
export -f open_log_fd
export SKRAFT_ROOT VALLY RESULTS_ROOT MODEL JUDGE_MODEL RUNS WORKERS AGENT_WORKERS AGENT_MAX_RETRIES STATUS_DIR LIVE_LOGS
export GREEN RED YELLOW CYAN BOLD NC

# ---- Run in parallel --------------------------------------------------------

PIDS=()
RUNNING=0

for EVAL_SPEC in "${EVAL_SPECS[@]}"; do
  run_one_eval "$EVAL_SPEC" &
  PIDS+=($!)
  RUNNING=$((RUNNING + 1))

  if [ "$RUNNING" -ge "$PARALLEL" ]; then
    wait -n 2>/dev/null || true
    RUNNING=$((RUNNING - 1))
  fi
done

wait

# ---- Summary ---------------------------------------------------------------

echo ""
PASS=0; NOIMPROVE=0; FAIL=0; SKIP=0
for f in "$STATUS_DIR"/*; do
  [ ! -f "$f" ] && continue
  case "$(cat "$f")" in
    pass)           PASS=$((PASS + 1)) ;;
    no_improvement) NOIMPROVE=$((NOIMPROVE + 1)) ;;
    skip)           SKIP=$((SKIP + 1)) ;;
    *)              FAIL=$((FAIL + 1)) ;;
  esac
done
rm -rf "$STATUS_DIR"

TOTAL=$((PASS + NOIMPROVE))
echo -e "${BOLD}━━━ Summary ━━━${NC}"
echo -e "  ${GREEN}✔ $PASS passed${NC}"
[ $NOIMPROVE -gt 0 ] && echo -e "  ${CYAN}⊘ $NOIMPROVE no improvement${NC}"
echo -e "  Completed: $TOTAL/$((TOTAL + FAIL + SKIP))"
[ $FAIL -gt 0 ] && echo -e "  ${RED}✘ $FAIL errors${NC}"
[ $SKIP -gt 0 ] && echo -e "  ${YELLOW}⚠ $SKIP skipped${NC}"
echo -e "  Results: $RESULTS_ROOT"

[ $FAIL -gt 0 ] && exit 1 || exit 0
