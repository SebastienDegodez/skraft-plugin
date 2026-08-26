#!/usr/bin/env bash
# Publish evaluation evidence to the dashboard data branch.
#
# Every runner writes the same `results.json`, whether it compared a skill
# against a baseline or ran an agent suite, so the branch is updated the same way
# whoever produced the verdicts and neither can clobber the other's evidence.
#
# Usage:
#   eng/dashboard/publish.sh --results <file> [--results <file> ...]
#                            [--replay-from <vally-run-dir>] [--source scheduled|pr]
#                            [--pr-number N] [--drop-pr N] [--branch dashboard-data]
#                            [--retention-days 14] [--commit sha] [--run id] [--url link]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BRANCH="${DATA_BRANCH:-dashboard-data}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
SOURCE="scheduled"
PR_NUMBER="0"
DROP_PR=""
REPLAY_FROM=""
COMMIT=""
RUN_ID=""
RUN_URL=""
RESULTS=()

while (( $# > 0 )); do
  case "$1" in
    --results) RESULTS+=("$2"); shift 2 ;;
    --replay-from) REPLAY_FROM="$2"; shift 2 ;;
    --source) SOURCE="$2"; shift 2 ;;
    --pr-number) PR_NUMBER="$2"; shift 2 ;;
    --drop-pr) DROP_PR="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --retention-days) RETENTION_DAYS="$2"; shift 2 ;;
    --commit) COMMIT="$2"; shift 2 ;;
    --run) RUN_ID="$2"; shift 2 ;;
    --url) RUN_URL="$2"; shift 2 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if (( ${#RESULTS[@]} == 0 )) && [[ -z "$DROP_PR" ]]; then
  echo "::warning::No verdict to publish."
  exit 0
fi

# The remote holding the evidence branch. Defaults to the GitHub repository the
# workflow runs in; overridable so the script can be exercised against a local
# repository instead of only ever being tried in production.
if [[ -n "${DATA_REMOTE:-}" ]]; then
  REMOTE="$DATA_REMOTE"
elif [[ -n "${GITHUB_REPOSITORY:-}" && -n "${GITHUB_TOKEN:-}" ]]; then
  REMOTE="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
else
  echo "Set DATA_REMOTE, or GITHUB_REPOSITORY and GITHUB_TOKEN, to publish." >&2
  exit 1
fi

cd "$ROOT"

if [[ -n "$REPLAY_FROM" && ! -d "$REPLAY_FROM" ]]; then
  echo "Replay source does not exist: $REPLAY_FROM" >&2
  exit 1
fi

CHECKOUT="$(mktemp -d)"

# The branch accumulates evidence; it is never force-replaced. A fresh branch is
# started only when none exists yet.
if git ls-remote --exit-code --heads "$REMOTE" "$BRANCH" >/dev/null 2>&1; then
  git clone --branch "$BRANCH" --single-branch --depth 1 "$REMOTE" "$CHECKOUT"
else
  git -C "$CHECKOUT" init -q
  git -C "$CHECKOUT" checkout -q -b "$BRANCH"
  git -C "$CHECKOUT" remote add origin "$REMOTE"
fi
mkdir -p "$CHECKOUT/data"

if (( ${#RESULTS[@]} > 0 )); then
  HISTORY_ARGS=(--history "$CHECKOUT/data/history.json")
  [[ -n "$COMMIT" ]] && HISTORY_ARGS+=(--commit "$COMMIT")
  [[ -n "$RUN_ID" ]] && HISTORY_ARGS+=(--run "$RUN_ID")
  [[ -n "$RUN_URL" ]] && HISTORY_ARGS+=(--url "$RUN_URL")
  for result in "${RESULTS[@]}"; do HISTORY_ARGS+=(--results "$result"); done

  node eng/dashboard/update-history.mjs "${HISTORY_ARGS[@]}"
fi

# AGENTVIZ reads session URLs relative to the manifest, so both live side by side
# under data/ on the branch.
if [[ -n "$REPLAY_FROM" && -d "$REPLAY_FROM" ]]; then
  REPLAY_ARGS=(
    --results-dir "$REPLAY_FROM"
    --output-dir "$CHECKOUT/data"
    --source "$SOURCE"
    --pr-number "$PR_NUMBER"
    --strict
  )
  for result in "${RESULTS[@]}"; do REPLAY_ARGS+=(--expected-result "$result"); done
  node eng/dashboard/build-replay-sessions.mjs \
    "${REPLAY_ARGS[@]}"
fi

  PURGE_ARGS=(--root "$CHECKOUT/data" --retention-days "$RETENTION_DAYS")
  [[ -n "$DROP_PR" ]] && PURGE_ARGS+=(--drop-pr "$DROP_PR")
  node eng/dashboard/purge-replay-sessions.mjs "${PURGE_ARGS[@]}"

cd "$CHECKOUT"
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git add -A data
if git diff --cached --quiet; then
  echo "Nothing changed on $BRANCH."
  exit 0
fi
if (( ${#RESULTS[@]} > 0 )); then
  MESSAGE="chore(dashboard): publish evaluation run ${RUN_ID:-local}"
else
  MESSAGE="chore(dashboard): remove replay for PR $DROP_PR"
fi
git commit -q -m "$MESSAGE"
git push origin "$BRANCH"
if (( ${#RESULTS[@]} > 0 )); then
  echo "Published ${#RESULTS[@]} verdict file(s) to $BRANCH."
else
  echo "Removed replay sessions for PR $DROP_PR from $BRANCH."
fi
