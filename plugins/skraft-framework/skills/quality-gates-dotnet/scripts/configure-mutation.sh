#!/usr/bin/env bash
# configure-mutation.sh -- scaffold durable root Stryker configs for local and CI use.
# Exit: 0 written/unchanged | 2 usage/discovery/conflict error | 3 toolchain missing
set -uo pipefail

CORE_EXPECTED=100
BOUNDARY_EXPECTED=80
CORE_CONFIG="stryker-config-core.json"
BOUNDARY_CONFIG="stryker-config-boundary.json"

usage() {
  cat <<'EOF'
Usage: configure-mutation.sh --root <dir> [--solution <sln|slnx>]
       [--core-mutate <glob> ... --boundary-mutate <glob> ...] [--force] [--help]

Canonical mode discovers one solution and requires canonical .Domain, .Application,
.API, and .Infrastructure projects. BFF/non-standard mode requires explicit inclusive
globs for BOTH scopes. Existing differing configs are preserved unless --force is used.
EOF
}
fail_usage() { echo "$1" >&2; exit 2; }
require_value() { [ $# -ge 2 ] && [ -n "$2" ] || fail_usage "$1 requires a value"; }
absolute_dir() { (cd "$1" 2>/dev/null && pwd -P); }
canonical_project() {
  local base parent
  base=$(basename "$1" .csproj)
  parent=$(basename "$(dirname "$1")")
  [ "$base" = "$parent" ]
}
find_solution() {
  local matches=() path
  while IFS= read -r path; do
    [ -n "$path" ] && matches+=("$path")
  done < <(find "$ROOT" -maxdepth 2 -type f \( -name '*.sln' -o -name '*.slnx' \) -print | LC_ALL=C sort)
  [ "${#matches[@]}" -eq 1 ] || fail_usage "expected exactly one .sln or .slnx below repository root; found ${#matches[@]}. Pass --solution explicitly"
  printf '%s\n' "${matches[0]}"
}
require_layer() {
  local suffix="$1" count=0 path
  [ -d "$ROOT/src" ] || fail_usage "canonical mutation config requires src/; use explicit --core-mutate and --boundary-mutate for a BFF"
  while IFS= read -r path; do
    [ -n "$path" ] && canonical_project "$path" && count=$((count + 1))
  done < <(find "$ROOT/src" -type f -name "*.$suffix.csproj" -print | LC_ALL=C sort)
  [ "$count" -gt 0 ] || fail_usage "canonical mutation config requires a .$suffix project; use explicit globs for a BFF"
}
init_config() {
  local path="$1" expected="$2" pattern args=()
  for pattern in "${PATTERNS[@]}"; do
    args+=(--mutate "$pattern")
  done
  (
    cd "$ROOT" || exit 2
    dotnet stryker init \
      --config-file "$path" \
      --solution "$SOLUTION_REL" \
      --threshold-high "$expected" \
      --threshold-low "$expected" \
      --break-at "$expected" \
      --reporter json \
      --reporter cleartext \
      --break-on-initial-test-failure \
      "${args[@]}"
  ) >/dev/null
}
install_config() {
  local target="$1" temp="$2"
  if [ -f "$target" ] && cmp -s "$target" "$temp"; then
    rm "$temp"
    printf 'unchanged %s\n' "$target"
  elif [ -f "$target" ] && [ "$FORCE" -ne 1 ]; then
    rm "$temp"
    fail_usage "refusing to overwrite customized config: $target. Re-run with --force after reviewing the diff"
  else
    mv "$temp" "$target"
    printf 'wrote %s\n' "$target"
  fi
}

ROOT=""
SOLUTION=""
FORCE=0
CORE_PATTERNS=()
BOUNDARY_PATTERNS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --root)            require_value "$@"; ROOT="$2"; shift 2 ;;
    --solution)        require_value "$@"; SOLUTION="$2"; shift 2 ;;
    --core-mutate)     require_value "$@"; CORE_PATTERNS+=("$2"); shift 2 ;;
    --boundary-mutate) require_value "$@"; BOUNDARY_PATTERNS+=("$2"); shift 2 ;;
    --force)           FORCE=1; shift ;;
    --expected)        fail_usage "refusing --expected: the bar is not a runtime argument" ;;
    --help|-h)         usage; exit 0 ;;
    *)                 echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[ -n "$ROOT" ] || fail_usage "--root is required"
ROOT=$(absolute_dir "$ROOT") || fail_usage "repository root not found: $ROOT"

if [ -z "$SOLUTION" ]; then
  SOLUTION=$(find_solution) || exit $?
else
  case "$SOLUTION" in /*) ;; *) SOLUTION="$ROOT/$SOLUTION" ;; esac
  [ -f "$SOLUTION" ] || fail_usage "solution not found: $SOLUTION"
  SOLUTION="$(absolute_dir "$(dirname "$SOLUTION")")/$(basename "$SOLUTION")"
fi
case "$SOLUTION" in
  "$ROOT"/*) SOLUTION_REL=${SOLUTION#"$ROOT"/} ;;
  *) fail_usage "solution must be inside repository root: $SOLUTION" ;;
esac

if [ "${#CORE_PATTERNS[@]}" -eq 0 ] && [ "${#BOUNDARY_PATTERNS[@]}" -eq 0 ]; then
  require_layer Domain
  require_layer Application
  require_layer API
  require_layer Infrastructure
  CORE_PATTERNS=("**/*.Domain/**/*.cs" "**/*.Application/**/*.cs")
  BOUNDARY_PATTERNS=("**/*.API/**/*.cs" "**/*.Infrastructure/**/*.cs")
elif [ "${#CORE_PATTERNS[@]}" -eq 0 ] || [ "${#BOUNDARY_PATTERNS[@]}" -eq 0 ]; then
  fail_usage "non-standard mode requires at least one --core-mutate and one --boundary-mutate glob"
fi

EXCLUSIONS=("!**/*Marker.cs" "!**/DependencyInjection.cs" "!**/Program.cs" "!**/obj/**")
command -v dotnet >/dev/null 2>&1 || { echo "dotnet is not on PATH" >&2; exit 3; }
dotnet stryker --version >/dev/null 2>&1 || { echo "dotnet stryker is not available" >&2; exit 3; }

TEMP_DIR=$(mktemp -d "$ROOT/.stryker-config.XXXXXX") || exit 2
CORE_TEMP="$TEMP_DIR/$CORE_CONFIG"
BOUNDARY_TEMP="$TEMP_DIR/$BOUNDARY_CONFIG"
trap 'rm -rf "$TEMP_DIR"' EXIT

PATTERNS=("${CORE_PATTERNS[@]}" "${EXCLUSIONS[@]}")
init_config "$CORE_TEMP" "$CORE_EXPECTED" || { echo "dotnet stryker init failed for core config" >&2; exit 2; }
PATTERNS=("${BOUNDARY_PATTERNS[@]}" "${EXCLUSIONS[@]}")
init_config "$BOUNDARY_TEMP" "$BOUNDARY_EXPECTED" || { echo "dotnet stryker init failed for boundary config" >&2; exit 2; }

install_config "$ROOT/$CORE_CONFIG" "$CORE_TEMP"
install_config "$ROOT/$BOUNDARY_CONFIG" "$BOUNDARY_TEMP"