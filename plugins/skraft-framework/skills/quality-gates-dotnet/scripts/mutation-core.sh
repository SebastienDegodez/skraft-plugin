#!/usr/bin/env bash
# mutation-core.sh -- run checked-in core Stryker config against the whole solution.
set -uo pipefail

EXPECTED=100
SCOPE="Domain,Application"
PREFIX="qg-mutation"
CONFIG_NAME="stryker-config-core.json"
REPORT_NAME="mutation-report"

for argument in "$@"; do
  [ "$argument" != "--expected" ] || {
    echo "refusing --expected: the bar is not a runtime argument" >&2
    exit 2
  }
done

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
export EXPECTED SCOPE PREFIX CONFIG_NAME REPORT_NAME
exec bash "$SCRIPT_DIR/run-mutation-gate.sh" "$@"