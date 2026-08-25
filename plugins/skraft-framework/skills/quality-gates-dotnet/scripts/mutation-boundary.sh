#!/usr/bin/env bash
#
# mutation-boundary.sh -- run the mutation gate on the BOUNDARY (API, Infrastructure).
#
# The bar for this scope is 90 (see skraft-quality-bar/SKILL.md "The bar").
# The value below is a checked restatement of that table: tests/dashboard/
# quality-bar-parity.unit.test.mjs fails if the two ever diverge.
#
# The comparison is NOT made here and NOT made by reading the report. Stryker's
# --break-at exits non-zero below the bar; that exit code IS the verdict.
#
# Usage:
#   mutation-core.sh --prod <csproj> --test <csproj> --evidence <dir> [--help]
#
# Stdout: one JSON object (the verdict). Stderr: diagnostics.
# Exit:   0 gate passed | 1 gate failed | 2 usage error | 3 toolchain missing
set -uo pipefail

EXPECTED=90
SCOPE="API,Infrastructure"
PREFIX="qg-mutation-boundary"

usage() { sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; }

PROD=""; TEST=""; EV=""
while [ $# -gt 0 ]; do
  case "$1" in
    --prod)     PROD="${2:-}"; shift 2 ;;
    --test)     TEST="${2:-}"; shift 2 ;;
    --evidence) EV="${2:-}"; shift 2 ;;
    --expected) echo "refusing --expected: the bar is not a runtime argument" >&2; exit 2 ;;
    --help|-h)  usage; exit 0 ;;
    *)          echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[ -n "$PROD" ] && [ -n "$TEST" ] && [ -n "$EV" ] || { echo "--prod, --test and --evidence are required" >&2; exit 2; }
[ -f "$PROD" ] || { echo "production project not found: $PROD" >&2; exit 2; }
[ -f "$TEST" ] || { echo "test project not found: $TEST" >&2; exit 2; }
command -v dotnet >/dev/null 2>&1 || { echo "dotnet is not on PATH" >&2; exit 3; }

mkdir -p "$EV"

dotnet stryker \
  --project "$PROD" \
  -tp "$TEST" \
  --mutate "**/*.cs" \
  --mutate "!**/*Marker.cs" \
  --mutate "!**/DependencyInjection.cs" \
  --mutate "!**/obj/**" \
  --break-at "$EXPECTED" \
  --reporter json --reporter cleartext \
  --output "$EV/stryker" \
  > "$EV/$PREFIX.stdout" 2>&1
STATUS=$?

echo "$STATUS" > "$EV/$PREFIX.exit"
shasum -a 256 "$EV/$PREFIX.stdout" | awk '{print $1}' > "$EV/$PREFIX.stdout.sha256"
[ -f "$EV/stryker/reports/mutation-report.json" ] && cp "$EV/stryker/reports/mutation-report.json" "$EV/$PREFIX.json"

# Reported for the record only. The verdict is STATUS, never this number.
SCORE=$(grep -Eo 'mutation score[^0-9]*[0-9]+(\.[0-9]+)?' "$EV/$PREFIX.stdout" | tail -1 | grep -Eo '[0-9]+(\.[0-9]+)?' | tail -1)

printf '{"gate":"mutation","scope":"%s","expected":%s,"measured":%s,"passed":%s,"evidence":"%s","exit":%s}\n' \
  "$SCOPE" "$EXPECTED" "${SCORE:-null}" "$([ "$STATUS" -eq 0 ] && echo true || echo false)" "$EV/$PREFIX.json" "$STATUS"

[ "$STATUS" -eq 0 ] || exit 1
