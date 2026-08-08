#!/usr/bin/env bash
#
# preview.sh — See a local evaluation on the dashboard, exactly as published.
#
# Folds the verdicts produced by eng/run-vally-evals.sh into a local history,
# rebuilds the catalogue from the plugin sources, then serves the site. Nothing
# it writes is committed: eval-results/, dashboard-data/ and the dashboard's
# data/ directory are all ignored.
#
# Usage:
#   ./eng/dashboard/preview.sh              # build, then serve on :4173
#   ./eng/dashboard/preview.sh --port 8080
#   ./eng/dashboard/preview.sh --no-serve   # build the data only
#
# Environment:
#   RESULTS_DIR   Where the verdicts are (default: ./eval-results)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESULTS_ROOT="${RESULTS_DIR:-$ROOT/eval-results}"
cd "$ROOT"

SERVE=true
SERVE_ARGS=()
for argument in "$@"; do
  case "$argument" in
    --no-serve) SERVE=false ;;
    *) SERVE_ARGS+=("$argument") ;;
  esac
done

shopt -s nullglob
RESULTS=("$RESULTS_ROOT"/*/results.json)
if (( ${#RESULTS[@]} > 0 )); then
  HISTORY_ARGS=()
  for result in "${RESULTS[@]}"; do HISTORY_ARGS+=(--results "$result"); done
  node eng/dashboard/update-history.mjs "${HISTORY_ARGS[@]}" \
    --commit "$(git rev-parse HEAD)"
else
  echo "No verdict under $RESULTS_ROOT — run ./eng/run-vally-evals.sh first; the dashboard will show the catalogue only."
fi

node eng/catalog/scan.mjs
node eng/dashboard/build.mjs

if [[ "$SERVE" == false ]]; then
  echo "Dashboard data built. Open docs/site/dashboard/ with any static server."
  exit 0
fi

exec node eng/dashboard/serve.mjs ${SERVE_ARGS[@]+"${SERVE_ARGS[@]}"}
