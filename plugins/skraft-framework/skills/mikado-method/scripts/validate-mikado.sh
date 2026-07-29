#!/usr/bin/env bash
# validate-mikado.sh — deterministic gate for a Mikado graph file (Mermaid `graph TD`).
#
# Inspired by the 8-pass validator in chaabani-anis/mikado-method (MIT License,
# https://github.com/chaabani-anis/mikado-method) — same validation discipline
# (parse, traceability, requires-reference validation, cycle detection, tree-direction
# ancestry, orphan detection, golden-master gate, true-leaf enumeration), reimplemented
# here to parse SKRAFT's Mermaid graph format instead of that repo's rail-notation
# text format. Written and tested independently against this format.
#
# Usage: bash validate-mikado.sh [--no-git] <path-to-mikado-graph.md>
# Exit 0 = graph valid | Exit 1 = defects found, fix before continuing.
#
# --no-git: skip the tree-direction ancestry check (Pass 5), which needs real,
# resolvable git commits. Use it for fixtures/samples with fictional SHAs (e.g. the
# examples in references/graph-format.md). Never use it on a real graph — the git
# check is the traceability guarantee.
#
# Commit convention required by Pass 5: every graph-update commit (creating the file,
# recording a discovery) uses the message prefix `refactor(mikado-graph): <what>`,
# matching this repo's existing conventional-commit scopes.
#
# Run this script:
#   - after every graph-update commit
#   - before every leaf commit (a leaf is not "done" until the graph validates)
#   - before dispatching the next refactoring-worker
#
# Expected graph shape (see references/graph-format.md for the full spec):
#   ```mermaid
#   graph TD
#     G((Goal: <sentence>))
#     classDef observed fill:#2e7d32,stroke:#66bb6a
#     classDef anticipated fill:#e65100,stroke:#ff9800,stroke-dasharray:5 5
#     P1["[ ] {P1} <desc><br/>discovered: <sha><br/>error: <file:line: msg>"]
#     G --> P1
#     class P1 observed
#   ```
# Compatible with Bash 3.2+ (macOS default). No associative arrays used.

set -euo pipefail

NO_GIT=0
FILE=""
for arg in "$@"; do
  case "$arg" in
    --no-git) NO_GIT=1 ;;
    --help|-h)
      sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) FILE="$arg" ;;
  esac
done
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "ERROR: graph file not found: ${FILE}" >&2
  echo "Usage: bash validate-mikado.sh [--no-git] <path-to-mikado-graph.md>" >&2
  echo "       bash validate-mikado.sh --help" >&2
  exit 1
fi

ERRORS=0
WARNINGS=0
log_error() { echo "  [ERROR] $*" >&2; ERRORS=$((ERRORS + 1)); }
log_warn()  { echo "  [WARN]  $*"; WARNINGS=$((WARNINGS + 1)); }
log_ok()    { echo "  [OK]    $*"; }

TMPDIR_LOCAL=$(mktemp -d)
trap 'rm -rf "$TMPDIR_LOCAL"' EXIT

NODES_FILE="$TMPDIR_LOCAL/nodes"       # lines: "id|label"
EDGES_FILE="$TMPDIR_LOCAL/edges"       # lines: "from|to|kind" (kind = tree|requires) — RAW, unfiltered
CLASS_FILE="$TMPDIR_LOCAL/classes"     # lines: "id|classname"
SHA_FILE="$TMPDIR_LOCAL/shas"          # lines: "id|sha"
touch "$NODES_FILE" "$EDGES_FILE" "$CLASS_FILE" "$SHA_FILE"

echo "=== Mikado Graph Validation: $FILE ==="
echo ""
echo "--- Pass 1: Parsing nodes, edges, classes ---"

ROOT_FOUND=0
GOAL_ID=""

while IFS= read -r line; do
  trimmed="$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

  # Goal/root node: G((label))
  if [[ "$trimmed" =~ ^([A-Za-z0-9_]+)\(\((.*)\)\)$ ]]; then
    id="${BASH_REMATCH[1]}"
    label="${BASH_REMATCH[2]}"
    if grep -qi "^goal:" <<<"$label" 2>/dev/null || [[ "$label" =~ [Gg]oal: ]]; then
      ROOT_FOUND=1
      GOAL_ID="$id"
      echo "${id}|${label}" >>"$NODES_FILE"
      log_ok "Goal node found: {${id}}"
    fi
    continue
  fi

  # Prerequisite node: P1["label"]
  if [[ "$trimmed" =~ ^([A-Za-z0-9_]+)\[\"(.*)\"\]$ ]]; then
    id="${BASH_REMATCH[1]}"
    label="${BASH_REMATCH[2]}"
    if grep -q "^${id}|" "$NODES_FILE" 2>/dev/null; then
      log_error "Duplicate node id: {${id}}"
    fi
    echo "${id}|${label}" >>"$NODES_FILE"
    if [[ "$label" =~ discovered:[[:space:]]*([A-Za-z0-9]{6,40}) ]]; then
      echo "${id}|${BASH_REMATCH[1]}" >>"$SHA_FILE"
    fi
    continue
  fi

  # Tree edge: A --> B
  if [[ "$trimmed" =~ ^([A-Za-z0-9_]+)[[:space:]]*--\>[[:space:]]*([A-Za-z0-9_]+)$ ]]; then
    echo "${BASH_REMATCH[1]}|${BASH_REMATCH[2]}|tree" >>"$EDGES_FILE"
    continue
  fi

  # Requires cross-link (shared prerequisite): A -.requires.-> B
  if [[ "$trimmed" =~ ^([A-Za-z0-9_]+)[[:space:]]*-\.requires\.-\>[[:space:]]*([A-Za-z0-9_]+)$ ]]; then
    echo "${BASH_REMATCH[1]}|${BASH_REMATCH[2]}|requires" >>"$EDGES_FILE"
    continue
  fi

  # Class assignment: class P1,P2 observed  (or "class P1 anticipated")
  if [[ "$trimmed" =~ ^class[[:space:]]+([A-Za-z0-9_,]+)[[:space:]]+([A-Za-z0-9_]+)$ ]]; then
    ids="${BASH_REMATCH[1]}"
    cls="${BASH_REMATCH[2]}"
    [[ "$cls" == "new" ]] && continue # genesis diagram convention, not a graph-status class
    IFS=',' read -ra idlist <<<"$ids"
    for one in "${idlist[@]}"; do
      echo "${one}|${cls}" >>"$CLASS_FILE"
    done
    continue
  fi
done <"$FILE"

if [[ $ROOT_FOUND -eq 0 ]]; then
  log_error "No goal node found. Expected a node shaped G((Goal: <sentence>))."
fi

total_nodes=$(wc -l <"$NODES_FILE" | tr -d ' ')
echo ""

echo "--- Pass 2: Traceability (discovered + error, unless anticipated) ---"
while IFS='|' read -r id label; do
  [[ "$id" == "$GOAL_ID" ]] && continue
  cls=$(grep "^${id}|" "$CLASS_FILE" 2>/dev/null | cut -d'|' -f2 | head -1 || true)
  if [[ "$cls" == "anticipated" ]]; then
    log_ok "{${id}} anticipated — traceability not required until confirmed by experiment"
    continue
  fi
  has_discovered=0
  has_error=0
  if echo "$label" | grep -qi 'discovered:'; then has_discovered=1; fi
  if echo "$label" | grep -qi 'error:'; then has_error=1; fi
  if [[ $has_discovered -eq 1 && $has_error -eq 1 ]]; then
    log_ok "{${id}} has discovered + error citation"
  else
    log_error "{${id}} missing 'discovered:' and/or 'error:' in its label (or mark it anticipated)"
  fi
done <"$NODES_FILE"
echo ""

echo "--- Pass 3: Requires-reference validation ---"
FILTERED_EDGES_FILE="$TMPDIR_LOCAL/edges_filtered"
touch "$FILTERED_EDGES_FILE"
REQUIRES_BROKEN=0
while IFS='|' read -r from to kind; do
  from_ok=0
  to_ok=0
  grep -q "^${from}|" "$NODES_FILE" 2>/dev/null && from_ok=1
  grep -q "^${to}|" "$NODES_FILE" 2>/dev/null && to_ok=1
  if [[ $from_ok -eq 1 && $to_ok -eq 1 ]]; then
    echo "${from}|${to}|${kind}" >>"$FILTERED_EDGES_FILE"
  else
    log_error "${kind} edge {${from}} -> {${to}}: unknown node id (not defined in this graph)"
    REQUIRES_BROKEN=1
  fi
done <"$EDGES_FILE"
[[ $REQUIRES_BROKEN -eq 0 ]] && log_ok "All edge references resolve to defined nodes"
echo ""

echo "--- Pass 4: Cycle detection (tree + requires edges) ---"
# Iterative Kahn's algorithm over the FILTERED edge set (broken references excluded
# by Pass 3 — an unresolved reference must never masquerade as a false cycle).
INDEGREE_FILE="$TMPDIR_LOCAL/indegree"
touch "$INDEGREE_FILE"
while IFS='|' read -r id _; do echo "$id 0" >>"$INDEGREE_FILE"; done <"$NODES_FILE"
while IFS='|' read -r from to _kind; do
  count=$(grep "^${to} " "$INDEGREE_FILE" 2>/dev/null | awk '{print $2}' || true)
  count=$((${count:-0} + 1))
  grep -v "^${to} " "$INDEGREE_FILE" >"$TMPDIR_LOCAL/id_tmp" 2>/dev/null || true
  echo "${to} ${count}" >>"$TMPDIR_LOCAL/id_tmp"
  mv "$TMPDIR_LOCAL/id_tmp" "$INDEGREE_FILE"
done <"$FILTERED_EDGES_FILE"

QUEUE_FILE="$TMPDIR_LOCAL/queue"
grep ' 0$' "$INDEGREE_FILE" | awk '{print $1}' >"$QUEUE_FILE" || true
PROCESSED=0
while [[ -s "$QUEUE_FILE" ]]; do
  node=$(head -1 "$QUEUE_FILE")
  tail -n +2 "$QUEUE_FILE" >"$TMPDIR_LOCAL/q_tmp" && mv "$TMPDIR_LOCAL/q_tmp" "$QUEUE_FILE"
  PROCESSED=$((PROCESSED + 1))
  while IFS='|' read -r from to _kind; do
    [[ "$from" != "$node" ]] && continue
    count=$(grep "^${to} " "$INDEGREE_FILE" | awk '{print $2}' || true)
    count=$((${count:-1} - 1))
    grep -v "^${to} " "$INDEGREE_FILE" >"$TMPDIR_LOCAL/id_tmp" 2>/dev/null || true
    echo "${to} ${count}" >>"$TMPDIR_LOCAL/id_tmp"
    mv "$TMPDIR_LOCAL/id_tmp" "$INDEGREE_FILE"
    [[ "$count" -eq 0 ]] && echo "$to" >>"$QUEUE_FILE"
  done <"$FILTERED_EDGES_FILE"
done

CYCLE=0
while IFS=' ' read -r id count; do
  if [[ "${count:-0}" -gt 0 ]]; then
    log_error "Cycle detected involving {${id}}"
    CYCLE=1
  fi
done <"$INDEGREE_FILE"
[[ $CYCLE -eq 0 ]] && log_ok "No cycles detected"
echo ""

echo "--- Pass 5: Tree direction (child discovered during/after parent) ---"
if [[ $NO_GIT -eq 1 ]]; then
  log_ok "Skipped (--no-git): ancestry checks require resolvable git commits"
else
  DIRECTION_CHECKED=0
  while IFS='|' read -r from to kind; do
    [[ "$kind" != "tree" ]] && continue
    p_sha=$(grep "^${from}|" "$SHA_FILE" 2>/dev/null | cut -d'|' -f2 | head -1 || true)
    c_sha=$(grep "^${to}|" "$SHA_FILE" 2>/dev/null | cut -d'|' -f2 | head -1 || true)
    if [[ -z "${p_sha:-}" || -z "${c_sha:-}" ]]; then
      continue # already flagged by Pass 2 (missing discovered:)
    fi
    DIRECTION_CHECKED=1
    if ! git cat-file -e "${c_sha}" 2>/dev/null; then
      log_error "{${to}} discovered-by ${c_sha:0:7}: commit not found in git history"
      continue
    fi
    commit_msg=$(git log -1 --format=%s "${c_sha}" 2>/dev/null || echo "")
    if [[ ! "$commit_msg" =~ ^refactor\(mikado-graph\): ]]; then
      log_error "{${to}} discovered-by ${c_sha:0:7}: commit message must start with 'refactor(mikado-graph): ' (got: \"${commit_msg}\")"
    fi
    if [[ "$p_sha" == "$c_sha" ]]; then
      log_ok "{${to}} (${c_sha:0:7}) same cycle as {${from}} — direction OK"
    elif git merge-base --is-ancestor "$p_sha" "$c_sha" 2>/dev/null; then
      log_ok "{${to}} (${c_sha:0:7}) discovered after {${from}} (${p_sha:0:7}) — direction OK"
    else
      log_error "{${to}} (discovered-by: ${c_sha:0:7}) appears to have been discovered BEFORE its parent {${from}} (${p_sha:0:7}). Children are prerequisites: they must be discovered during or after the parent's naive attempt."
    fi
  done <"$FILTERED_EDGES_FILE"
  [[ $DIRECTION_CHECKED -eq 0 ]] && log_ok "No tree edges with resolvable SHAs to check"
fi
echo ""

echo "--- Pass 6: Orphan detection (warning only) ---"
REFERENCED_FILE="$TMPDIR_LOCAL/referenced"
touch "$REFERENCED_FILE"
while IFS='|' read -r _from to _kind; do echo "$to" >>"$REFERENCED_FILE"; done <"$FILTERED_EDGES_FILE"
ORPHANS=0
while IFS='|' read -r id _label; do
  [[ "$id" == "$GOAL_ID" ]] && continue
  if ! grep -q "^${id}$" "$REFERENCED_FILE" 2>/dev/null; then
    log_warn "{${id}} appears unreferenced (not a target of any tree or requires edge)"
    ORPHANS=1
  fi
done <"$NODES_FILE"
[[ $ORPHANS -eq 0 ]] && log_ok "No orphan nodes"
echo ""

echo "--- Pass 7: Golden master gate ---"
GM_DECLARED=0
if grep -qi 'golden master' "$FILE"; then GM_DECLARED=1; fi
if grep -q '%% no-golden-master:' "$FILE"; then GM_DECLARED=1; fi
if [[ $GM_DECLARED -eq 1 ]]; then
  log_ok "Golden master addressed (node present or '%% no-golden-master: <reason>' declared)"
else
  log_error "No golden master node and no '%% no-golden-master: <reason>' comment. Measure coverage on touched modules: add a Golden Master node if coverage is thin, or declare '%% no-golden-master: coverage X% on <module>' if it is already sufficient."
fi
echo ""

echo "--- Pass 8: True leaf enumeration ---"
is_node_done() {
  grep "^${1}|" "$NODES_FILE" 2>/dev/null | cut -d'|' -f2- | grep -q '\[x\]' || return 1
}
TRUE_LEAVES=0
while IFS='|' read -r id label; do
  [[ "$id" == "$GOAL_ID" ]] && continue
  if is_node_done "$id"; then continue; fi
  has_pending_child=0
  while IFS='|' read -r from to _kind; do
    [[ "$from" != "$id" ]] && continue
    if ! is_node_done "$to"; then
      has_pending_child=1
      break
    fi
  done <"$FILTERED_EDGES_FILE"
  if [[ $has_pending_child -eq 0 ]]; then
    TRUE_LEAVES=$((TRUE_LEAVES + 1))
    log_ok "Leaf ready: {${id}} ${label:0:60}"
  fi
done <"$NODES_FILE"
[[ $TRUE_LEAVES -eq 0 ]] && log_warn "No true leaves ready (either the graph is done, or all remaining nodes still have pending children)"
echo ""

echo "=== Summary ==="
echo "  Nodes parsed : ${total_nodes}"
echo "  Warnings     : ${WARNINGS}"
if [[ $ERRORS -eq 0 ]]; then
  echo "  Result       : VALID — graph is ready for the next leaf"
  exit 0
else
  echo "  Result       : INVALID — ${ERRORS} error(s) found. Fix before continuing."
  exit 1
fi
