#!/usr/bin/env bash
# Run the SKRAFT skill-versus-baseline evaluations locally.
#
# Usage:
#   ./eng/run-skill-evals.sh                # every evaluated skill
#   ./eng/run-skill-evals.sh <skill>        # one skill
#
# Add --dry-run to validate the resolved experiment without spending model quota.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXPERIMENT_FILE="${EXPERIMENT_FILE:-$ROOT/skraft-plugin.experiment.yaml}"
RESULTS_DIR="${RESULTS_DIR:-$ROOT/eval-results}"
WORKERS="${WORKERS:-4}"
VALLY_PACKAGE="${VALLY_PACKAGE:-@microsoft/vally-cli@0.12.0}"
VALLY_NPM_CACHE="${VALLY_NPM_CACHE:-${TMPDIR:-/tmp}/skraft-vally-npm-cache}"
ADAPTER="$ROOT/eng/vally-adapter/adapt.mjs"
MODEL="${MODEL:-claude-sonnet-5}"
JUDGE_MODEL="${JUDGE_MODEL:-gpt-5.6-luna}"

usage() { sed -n '2,9p' "$0"; }

DRY_RUN=false
POSITIONAL=()
for argument in "$@"; do
  case "$argument" in
    --dry-run) DRY_RUN=true ;;
    -h|--help) usage; exit 0 ;;
    --*) echo "Unknown option: $argument" >&2; usage >&2; exit 2 ;;
    *) POSITIONAL+=("$argument") ;;
  esac
done

if (( ${#POSITIONAL[@]} > 1 )); then usage >&2; exit 2; fi
SKILL="${POSITIONAL[0]:-}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22 or newer is required." >&2
  exit 1
fi
if (( $(node -p 'process.versions.node.split(".")[0]') < 22 )); then
  echo "Node.js $(node --version) is too old; install Node.js 22 or newer." >&2
  exit 1
fi
if [[ ! -f "$EXPERIMENT_FILE" ]]; then
  echo "Experiment file not found: $EXPERIMENT_FILE" >&2
  exit 1
fi

FILTER=()
if [[ -n "$SKILL" ]]; then
  if [[ ! "$SKILL" =~ ^[A-Za-z0-9][A-Za-z0-9-]*$ ]]; then
    echo "Invalid skill name: $SKILL" >&2
    exit 2
  fi
  if [[ ! -f "$ROOT/tests/skills/$SKILL/eval.yaml" || ! -f "$ROOT/plugins/skills/$SKILL/SKILL.md" ]]; then
    echo "Expected tests/skills/$SKILL/eval.yaml and plugins/skills/$SKILL/SKILL.md." >&2
    exit 1
  fi
  FILTER=(--eval-filter "tests/skills/$SKILL/eval.yaml")
fi

# An eval drives a real agent, so it needs a Copilot-enabled token. The
# auto-generated Actions token cannot reach Copilot; a fine-grained PAT with the
# "Copilot Requests" permission can.
if [[ "$DRY_RUN" == false && -z "${COPILOT_GITHUB_TOKEN:-}" ]]; then
  if command -v gh >/dev/null 2>&1 && gh auth token >/dev/null 2>&1; then
    COPILOT_GITHUB_TOKEN="$(gh auth token)"
    export COPILOT_GITHUB_TOKEN
  else
    echo "Set COPILOT_GITHUB_TOKEN (fine-grained PAT with Copilot Requests) or run 'gh auth login'." >&2
    exit 1
  fi
fi

mkdir -p "$RESULTS_DIR/_experiment" "$VALLY_NPM_CACHE"
cd "$ROOT"

# Keep npx downloads out of a globally shared cache, which may be owned by a
# different user after an earlier system-wide npm invocation.
export npm_config_cache="$VALLY_NPM_CACHE"
export VALLY_TELEMETRY_OPTOUT=1

echo "Running ${SKILL:-all evaluated skills} with $WORKERS worker(s)."
COMMAND=(npx --yes "$VALLY_PACKAGE" experiment run "$EXPERIMENT_FILE")
if (( ${#FILTER[@]} > 0 )); then COMMAND+=("${FILTER[@]}"); fi
COMMAND+=(--output-dir "$RESULTS_DIR/_experiment" --workers "$WORKERS")
if [[ "$DRY_RUN" == true ]]; then COMMAND+=(--dry-run); fi

"${COMMAND[@]}"

if [[ "$DRY_RUN" == true ]]; then
  echo "Dry run complete — no comparison produced."
  exit 0
fi

RUN_DIR="$(find "$RESULTS_DIR/_experiment" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)"
if [[ -z "$RUN_DIR" ]]; then
  echo "No experiment run directory found under $RESULTS_DIR/_experiment." >&2
  exit 1
fi

node "$ADAPTER" \
  --experiment-dir "$RUN_DIR" \
  --output-root "$RESULTS_DIR" \
  --vally "npx --yes $VALLY_PACKAGE" \
  --model "$MODEL" \
  --judge-model "$JUDGE_MODEL"

echo
echo "Verdicts written under $RESULTS_DIR/<skill>/results.json"
echo "Preview the dashboard locally:"
echo "  node eng/dashboard/update-history.mjs --results $RESULTS_DIR/*/results.json"
echo "  node eng/catalog/scan.mjs && node eng/dashboard/build.mjs"
