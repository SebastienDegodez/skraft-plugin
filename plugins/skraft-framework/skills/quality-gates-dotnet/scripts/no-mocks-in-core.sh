#!/usr/bin/env bash
# G7 — no mocking framework in the Domain/Application core or in its unit tests.
# Scans every *.Domain and *.Application project (any depth: nested bounded contexts
# included) and the *.Domain.*Tests, *.Application.*Tests and *.UnitTests projects;
# integration tests are out of scope (in-process doubles are allowed there).
# Evidence: qg-mocks.stdout (one "path:line:text" per hit, empty on pass), .exit, .sha256.
# Exit: 0 pass | 1 hits found | 2 usage or layout error
set -uo pipefail

usage() { echo "Usage: $(basename "$0") --root <dir> --evidence <dir>"; }
ROOT=""
EV=""
while [ $# -gt 0 ]; do
  case "$1" in
    --root)     [ $# -ge 2 ] || { usage >&2; exit 2; }; ROOT="$2"; shift 2 ;;
    --evidence) [ $# -ge 2 ] || { usage >&2; exit 2; }; EV="$2"; shift 2 ;;
    --help|-h)  usage; exit 0 ;;
    *)          echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done
[ -n "$ROOT" ] && [ -n "$EV" ] || { usage >&2; exit 2; }
ROOT=$(cd "$ROOT" 2>/dev/null && pwd -P) || { echo "repository root not found" >&2; exit 2; }
case "$EV" in /*|[A-Za-z]:[\\/]*) ;; *) EV="$ROOT/$EV" ;; esac
mkdir -p "$EV" || exit 2

sha256() { if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'; else sha256sum "$1" | awk '{print $1}'; fi; }
# Directories matching the given -name tests, build output and dependencies pruned.
project_dirs() {
  (cd "$ROOT" && find . \( -name bin -o -name obj -o -name node_modules -o -name .git \) -prune -o -type d \( "$@" \) -print) | sed 's|^\./||' | sort
}

CORE=$(project_dirs -name '*.Domain' -o -name '*.Application')
[ -n "$CORE" ] || { echo "no *.Domain or *.Application project under $ROOT" >&2; exit 2; }
DIRS=$(project_dirs -name '*.Domain' -o -name '*.Application' -o -name '*.Domain.*Tests' -o -name '*.Application.*Tests' -o -name '*.UnitTests')

PATTERN='using[[:space:]]+(Moq|FakeItEasy|NSubstitute|AutoFixture\.AutoMoq)[[:space:]]*;|(^|[^A-Za-z0-9_])new[[:space:]]+Mock<|Substitute\.For<|A\.Fake<'
STDOUT="$EV/qg-mocks.stdout"
(
  cd "$ROOT" || exit 2
  printf '%s\n' "$DIRS" | while IFS= read -r dir; do
    [ -n "$dir" ] || continue
    grep -rnE --include='*.cs' --exclude-dir=bin --exclude-dir=obj "$PATTERN" "$dir"
  done
  exit 0
) > "$STDOUT" 2>/dev/null

if [ -s "$STDOUT" ]; then STATUS=1; else STATUS=0; fi
printf '%s\n' "$STATUS" > "$EV/qg-mocks.exit"
sha256 "$STDOUT" > "$EV/qg-mocks.stdout.sha256"
exit "$STATUS"
