#!/usr/bin/env bash
#
# run-vally-evals.sh — Run the skill-versus-baseline evaluations one eval spec at
# a time, the way `dotnet/skills` does it: two isolated `vally eval` runs per
# skill, one with no skill at all and one with only the skill under test.
#
# Usage:
#   ./eng/run-vally-evals.sh                          # every eval spec
#   ./eng/run-vally-evals.sh outside-in-tdd            # one skill
#   ./eng/run-vally-evals.sh <plugin>                  # one plugin
#   ./eng/run-vally-evals.sh <plugin> <skill>          # one skill of one plugin
#
# The plugin axis follows the eval layout, so it activates on its own the day the
# repository ships more than one plugin:
#   one plugin  — tests/skills/<skill>/eval.yaml     ↔ plugins/skills/<skill>
#   many plugins — tests/<plugin>/<skill>/eval.yaml ↔ plugins/<plugin>/skills/<skill>
#
# Environment:
#   PARALLEL=4        Max concurrent evals (default: 4)
#   RUNS=1            Trials per stimulus (default: 1)
#   WORKERS=3         Concurrent stimuli within an eval (default: 3)
#   MODEL             Agent model (default: gpt-5.6-luna)
#   JUDGE_MODEL       Judge model (default: gpt-5.6-luna)
#   SKIP_EVALS=""     Override skip list (default: reads skip-evals.txt)
#   RESULTS_DIR       Output root (default: ./eval-results)
#
# Prerequisites:
#   - the Vally CLI: npm install -g @microsoft/vally-cli@0.12.0
#   - COPILOT_GITHUB_TOKEN (fine-grained PAT with Copilot Requests), or `gh auth login`
#
# Results go to ./eval-results/<skill>/results.json

set -euo pipefail

SKRAFT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VALLY_PACKAGE="${VALLY_PACKAGE:-@microsoft/vally-cli@0.12.0}"
if command -v vally >/dev/null 2>&1; then
  VALLY="${VALLY:-vally}"
else
  VALLY="${VALLY:-npx --yes $VALLY_PACKAGE}"
fi
RESULTS_ROOT="${RESULTS_DIR:-$SKRAFT_ROOT/eval-results}"
MODEL="${MODEL:-gpt-5.6-luna}"
JUDGE_MODEL="${JUDGE_MODEL:-gpt-5.6-luna}"
RUNS="${RUNS:-1}"
WORKERS="${WORKERS:-3}"
PARALLEL="${PARALLEL:-4}"

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
for spec in "${ALL_SPECS[@]}"; do
  EVAL_NAME=$(basename "$(dirname "$spec")")
  SKIPPED=false
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
  echo "No eval.yaml files to run"
  exit 1
fi

echo -e "${BOLD}Running ${#EVAL_SPECS[@]} eval(s) with PARALLEL=$PARALLEL RUNS=$RUNS${NC}"
echo ""

# ---- Per-eval function (runs in background) --------------------------------

STATUS_DIR=$(mktemp -d)

run_one_eval() {
  local EVAL_SPEC="$1"
  local EVAL_DIR="$(dirname "$EVAL_SPEC")"
  local EVAL_NAME="$(basename "$EVAL_DIR")"
  local EVAL_PLUGIN="$(basename "$(dirname "$EVAL_DIR")")"
  # Multi-plugin layout first, single-plugin layout as the fallback: today
  # EVAL_PLUGIN is the literal `skills` segment of tests/skills/<skill>.
  local SKILL_DIR="$SKRAFT_ROOT/plugins/$EVAL_PLUGIN/skills/$EVAL_NAME"
  if [ ! -d "$SKILL_DIR" ]; then
    SKILL_DIR="$SKRAFT_ROOT/plugins/skills/$EVAL_NAME"
  fi
  local BASELINE_DIR="$RESULTS_ROOT/$EVAL_NAME/baseline"
  local SKILLED_DIR="$RESULTS_ROOT/$EVAL_NAME/skilled"
  local LOG="$RESULTS_ROOT/$EVAL_NAME/eval.log"

  mkdir -p "$RESULTS_ROOT/$EVAL_NAME"
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
  # under plugins/skills/, contaminating the baseline). One dir per eval to
  # avoid any cross-run contention when running in parallel.
  local EMPTY_SKILL_DIR
  EMPTY_SKILL_DIR=$(mktemp -d -t vally-empty-skills-XXXXXX)
  trap 'rm -rf "$EMPTY_SKILL_DIR"' RETURN

  echo -e "  ${BOLD}▶${NC} $EVAL_NAME — baseline..." >&2

  {
    echo "=== $EVAL_NAME ==="

    # Baseline: no skill available to the agent.
    echo "--- Baseline run ---"
    $VALLY eval \
      --eval-spec "$EVAL_SPEC" \
      --skill-dir "$EMPTY_SKILL_DIR" \
      --model "$MODEL" \
      --runs "$RUNS" --workers "$WORKERS" \
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
      --runs "$RUNS" --workers "$WORKERS" \
      --skip-validate \
      --judge-model "$JUDGE_MODEL" \
      --output-dir "$SKILLED_DIR" \
      2>&1 || echo "WARNING: Skilled eval failed"

    # Adapt
    local BASELINE_JSONL=$(find "$BASELINE_DIR" -name "*.jsonl" -type f 2>/dev/null | head -1)
    local SKILLED_JSONL=$(find "$SKILLED_DIR" -name "*.jsonl" -type f 2>/dev/null | head -1)

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
  } > "$LOG" 2>&1

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
export SKRAFT_ROOT VALLY RESULTS_ROOT MODEL JUDGE_MODEL RUNS WORKERS STATUS_DIR
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
