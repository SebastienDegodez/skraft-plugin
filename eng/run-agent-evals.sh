#!/usr/bin/env bash
# Evaluate a SKRAFT agent against a plain agent, and publish the verdict.
#
# Usage:
#   ./eng/run-agent-evals.sh                       # every pipeline suite, skraft-orchestrator
#   ./eng/run-agent-evals.sh order-checkout        # one story
#
# Vally environments load skills, not custom agents, so an agent is evaluated by
# skraft-test-harness: it drives the real Copilot CLI twice per scenario — once
# with `--no-custom-instructions` (baseline) and once with `--plugin-dir plugins
# --agent skraft:<agent>` — then this script folds the reports into the same
# verdict shape the dashboard reads for a skill.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENT="${AGENT:-skraft-orchestrator}"
HARNESS="$ROOT/tools/skraft-test-harness"
REPORTS_DIR="${REPORTS_DIR:-$ROOT/eval-reports}"
RESULTS_DIR="${RESULTS_DIR:-$ROOT/eval-results}"

usage() { sed -n '2,7p' "$0"; }

STORY=""
for argument in "$@"; do
  case "$argument" in
    -h|--help) usage; exit 0 ;;
    --*) echo "Unknown option: $argument" >&2; usage >&2; exit 2 ;;
    *) STORY="$argument" ;;
  esac
done

if [[ -n "$STORY" && ! "$STORY" =~ ^[A-Za-z0-9][A-Za-z0-9-]*$ ]]; then
  echo "Invalid story name: $STORY" >&2
  exit 2
fi
if ! command -v dotnet >/dev/null 2>&1; then
  echo "The .NET SDK is required to run the agent harness." >&2
  exit 1
fi
if ! command -v copilot >/dev/null 2>&1; then
  echo "The GitHub Copilot CLI is required: npm install -g @github/copilot" >&2
  exit 1
fi
if [[ -z "${COPILOT_GITHUB_TOKEN:-}" ]]; then
  if command -v gh >/dev/null 2>&1 && gh auth token >/dev/null 2>&1; then
    COPILOT_GITHUB_TOKEN="$(gh auth token)"
    export COPILOT_GITHUB_TOKEN
  else
    echo "Set COPILOT_GITHUB_TOKEN (fine-grained PAT with Copilot Requests) or run 'gh auth login'." >&2
    exit 1
  fi
fi

cd "$ROOT"
mkdir -p "$REPORTS_DIR"

# Every pipeline suite the repository declares for the agent, in phase order.
# Read with a portable loop: `mapfile` needs bash 4, and macOS ships bash 3.2.
SUITES=()
while IFS= read -r suite; do
  SUITES+=("$suite")
done < <(find "tests/skraft-plugin/pipeline${STORY:+/$STORY}" -name eval.yaml -print 2>/dev/null | sort)

if (( ${#SUITES[@]} == 0 )); then
  echo "No pipeline eval suite found${STORY:+ for story '$STORY'}." >&2
  exit 1
fi

echo "Evaluating agent '$AGENT' over ${#SUITES[@]} suite(s)."
for suite in "${SUITES[@]}"; do
  directory="$(dirname "$suite")"
  echo "::group::$directory"
  dotnet run --project "$HARNESS/src/SkraftTestHarness.Cli" -- \
    evaluate --skill "$AGENT" \
    --tests-dir "$directory" \
    --plugin-dir plugins --agent "skraft:$AGENT" \
    --fixtures-root "$HARNESS/fixtures" \
    --report-dir "$REPORTS_DIR"
  echo "::endgroup::"
done

node eng/harness-adapter/adapt.mjs \
  --reports-dir "$REPORTS_DIR" \
  --output-root "$RESULTS_DIR" \
  --agent "$AGENT"

echo
echo "Verdict written to $RESULTS_DIR/agents/$AGENT/results.json"
echo "Preview the dashboard locally:"
echo "  node eng/dashboard/update-history.mjs --results $RESULTS_DIR/agents/$AGENT/results.json"
echo "  npm run dashboard:build"
