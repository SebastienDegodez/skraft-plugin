#!/usr/bin/env bash
# Compact the evidence branch: keep the tree, drop the history.
#
# `publish.sh` only ever appends, and `purge-replay-sessions.mjs` only removes
# files from the tree — the blobs stay in the branch's history for ever, and
# every `git clone` of this repository pays for them. This script restarts the
# branch from a single commit holding exactly the tree that is already published.
#
# It is deliberately paranoid, because a force-push on a shared branch has
# already wiped this branch once:
#   • it refuses to run when the branch does not exist;
#   • it does nothing until the history is actually worth compacting;
#   • it aborts unless the rewritten tree is byte-for-byte the published one.
#
# Nothing semantic is lost: history.json already keeps only the last entries per
# subject, and replay sessions past the retention window are purged anyway.
#
# Usage:
#   eng/dashboard/compact-data-branch.sh [--branch dashboard-data]
#                                        [--max-commits 200] [--max-megabytes 100]
#                                        [--dry-run]
set -euo pipefail

BRANCH="${DATA_BRANCH:-dashboard-data}"
MAX_COMMITS="${MAX_COMMITS:-200}"
MAX_MEGABYTES="${MAX_MEGABYTES:-100}"
DRY_RUN=false

while (( $# > 0 )); do
  case "$1" in
    --branch) BRANCH="$2"; shift 2 ;;
    --max-commits) MAX_COMMITS="$2"; shift 2 ;;
    --max-megabytes) MAX_MEGABYTES="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) sed -n '2,21p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if [[ -n "${DATA_REMOTE:-}" ]]; then
  REMOTE="$DATA_REMOTE"
elif [[ -n "${GITHUB_REPOSITORY:-}" && -n "${GITHUB_TOKEN:-}" ]]; then
  REMOTE="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
else
  echo "Set DATA_REMOTE, or GITHUB_REPOSITORY and GITHUB_TOKEN, to compact." >&2
  exit 1
fi

if ! git ls-remote --exit-code --heads "$REMOTE" "$BRANCH" >/dev/null 2>&1; then
  echo "Branch $BRANCH does not exist — nothing to compact."
  exit 0
fi

CHECKOUT="$(mktemp -d)"
trap 'rm -rf "$CHECKOUT"' EXIT

# Full history on purpose: its weight is the very thing being measured.
git clone --branch "$BRANCH" --single-branch "$REMOTE" "$CHECKOUT" --quiet
cd "$CHECKOUT"

COMMITS="$(git rev-list --count HEAD)"
SIZE_KB="$(git count-objects -v | awk '/^size-pack:/ { print $2 }')"
SIZE_MB=$(( SIZE_KB / 1024 ))
echo "$BRANCH: $COMMITS commit(s), ${SIZE_MB} MB of packed history."

if (( COMMITS <= MAX_COMMITS )) && (( SIZE_MB <= MAX_MEGABYTES )); then
  echo "Under both thresholds (${MAX_COMMITS} commits, ${MAX_MEGABYTES} MB) — nothing to compact."
  exit 0
fi

PUBLISHED_TREE="$(git rev-parse 'HEAD^{tree}')"

git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git checkout --quiet --orphan compacted
git add -A
git commit --quiet -m "chore(dashboard): compact evidence history

Restarts $BRANCH from the tree published at $(git -c core.abbrev=12 rev-parse --short HEAD 2>/dev/null || echo 'its tip'), dropping $COMMITS commit(s) of superseded blobs. The published files are unchanged."

COMPACTED_TREE="$(git rev-parse 'HEAD^{tree}')"
if [[ "$COMPACTED_TREE" != "$PUBLISHED_TREE" ]]; then
  echo "Refusing to push: the compacted tree ($COMPACTED_TREE) is not the published one ($PUBLISHED_TREE)." >&2
  exit 1
fi

if [[ "$DRY_RUN" == true ]]; then
  echo "Dry run — would force-push the identical tree over $BRANCH, dropping $COMMITS commit(s)."
  exit 0
fi

git push --force origin "compacted:$BRANCH"
echo "Compacted $BRANCH to a single commit; the published tree is unchanged."
