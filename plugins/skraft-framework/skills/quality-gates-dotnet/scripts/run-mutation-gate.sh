#!/usr/bin/env bash
# Internal runner used by mutation-core.sh and mutation-boundary.sh.
# Stdout: one JSON verdict. Stderr: diagnostics.
# Exit: 0 gate passed | 1 gate/report failed | 2 usage/config error | 3 toolchain missing
set -uo pipefail

usage() {
  cat <<EOF
Usage: $(basename "$0") --root <dir> --evidence <dir> [--config <json>] [--help]

Runs one Stryker.NET solution-context mutation gate from a checked-in root config.
EOF
}
fail_usage() { echo "$1" >&2; exit 2; }
require_value() { [ $# -ge 2 ] && [ -n "$2" ] || fail_usage "$1 requires a value"; }
absolute_dir() { (cd "$1" 2>/dev/null && pwd -P); }
absolute_file() {
  local path="$1"
  case "$path" in /*) ;; *) path="$ROOT/$path" ;; esac
  [ -f "$path" ] || return 1
  printf '%s/%s\n' "$(absolute_dir "$(dirname "$path")")" "$(basename "$path")"
}
json_escape() {
  local value="$1"
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}
  value=${value//$'\r'/\\r}
  value=${value//$'\t'/\\t}
  printf '%s' "$value"
}
sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

: "${EXPECTED:?EXPECTED is required}"
: "${SCOPE:?SCOPE is required}"
: "${PREFIX:?PREFIX is required}"
: "${CONFIG_NAME:?CONFIG_NAME is required}"
: "${REPORT_NAME:?REPORT_NAME is required}"

ROOT=""
EV=""
CONFIG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --root)     require_value "$@"; ROOT="$2"; shift 2 ;;
    --evidence) require_value "$@"; EV="$2"; shift 2 ;;
    --config)   require_value "$@"; CONFIG="$2"; shift 2 ;;
    --expected) fail_usage "refusing --expected: the bar is not a runtime argument" ;;
    --help|-h)  usage; exit 0 ;;
    *)          echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[ -n "$ROOT" ] || fail_usage "--root is required"
ROOT=$(absolute_dir "$ROOT") || fail_usage "repository root not found: $ROOT"
[ -n "$EV" ] || fail_usage "--evidence is required"
case "$EV" in /*) ;; *) EV="$ROOT/$EV" ;; esac
[ -n "$CONFIG" ] || CONFIG="$CONFIG_NAME"
CONFIG=$(absolute_file "$CONFIG") || fail_usage "mutation config not found: $CONFIG. Run configure-mutation.sh first"

command -v node >/dev/null 2>&1 || { echo "node is not on PATH" >&2; exit 3; }
command -v dotnet >/dev/null 2>&1 || { echo "dotnet is not on PATH" >&2; exit 3; }
dotnet stryker --version >/dev/null 2>&1 || { echo "dotnet stryker is not available" >&2; exit 3; }

SOLUTION=$(node - "$CONFIG" "$EXPECTED" "$REPORT_NAME" "$ROOT" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const [configPath, expectedText, reportName, root] = process.argv.slice(2)
let config
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'))['stryker-config']
} catch (error) {
  console.error(`invalid mutation config ${configPath}: ${error.message}`)
  process.exit(2)
}
const expected = Number(expectedText)
if (!config || typeof config !== 'object') {
  console.error(`${configPath} must contain a stryker-config object`)
  process.exit(2)
}
if (config.thresholds?.break !== expected || config.thresholds?.low !== expected || config.thresholds?.high !== expected) {
  console.error(`${configPath} must keep thresholds high/low/break at ${expected}`)
  process.exit(2)
}
if (config['report-file-name'] !== reportName) {
  console.error(`${configPath} must keep report-file-name ${reportName}`)
  process.exit(2)
}
if (!Array.isArray(config.reporters) || !config.reporters.map(String).some((x) => x.toLowerCase() === 'json')) {
  console.error(`${configPath} must enable the json reporter`)
  process.exit(2)
}
if (!Array.isArray(config.mutate) || !config.mutate.some((x) => typeof x === 'string' && !x.startsWith('!'))) {
  console.error(`${configPath} must contain at least one inclusive mutate glob`)
  process.exit(2)
}
if (typeof config.solution !== 'string' || config.solution.length === 0) {
  console.error(`${configPath} must select a solution`)
  process.exit(2)
}
const solution = path.resolve(root, config.solution)
if (!fs.existsSync(solution)) {
  console.error(`solution from ${configPath} does not exist: ${solution}`)
  process.exit(2)
}
process.stdout.write(solution)
NODE
)
CONFIG_STATUS=$?
[ "$CONFIG_STATUS" -eq 0 ] || exit "$CONFIG_STATUS"

RUN_DIR="$EV/$PREFIX-stryker"
STDOUT="$EV/$PREFIX.stdout"
REPORT="$EV/$PREFIX-report.json"
MANIFEST="$EV/$PREFIX.json"
rm -rf "$RUN_DIR"
mkdir -p "$RUN_DIR" "$EV"

(
  cd "$ROOT" || exit 2
  dotnet stryker --config-file "$CONFIG" --output "$RUN_DIR"
) > "$STDOUT" 2>&1
STATUS=$?

NATIVE_REPORT="$RUN_DIR/reports/$REPORT_NAME.json"
if [ -f "$NATIVE_REPORT" ]; then
  cp "$NATIVE_REPORT" "$REPORT"
  node - "$REPORT" <<'NODE'
const fs = require('node:fs')
const reportPath = process.argv[2]
let report
try {
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
} catch (error) {
  console.error(`invalid native mutation report ${reportPath}: ${error.message}`)
  process.exit(1)
}
const files = report.files && typeof report.files === 'object' ? Object.values(report.files) : []
const mutants = files.flatMap((file) => Array.isArray(file?.mutants) ? file.mutants : [])
if (mutants.length === 0) {
  console.error(`native mutation report contains no mutants: ${reportPath}`)
  process.exit(1)
}
NODE
  REPORT_STATUS=$?
  [ "$REPORT_STATUS" -eq 0 ] || STATUS=1
else
  echo "native mutation report missing: $NATIVE_REPORT" >&2
  STATUS=1
fi

printf '%s\n' "$STATUS" > "$EV/$PREFIX.exit"
sha256 "$STDOUT" > "$EV/$PREFIX.stdout.sha256"
printf '{"gate":"mutation","scope":"%s","expected":%s,"solution":"%s","config":"%s","report":"%s","passed":%s,"exit":%s}\n' \
  "$SCOPE" "$EXPECTED" "$(json_escape "$SOLUTION")" "$(json_escape "$CONFIG")" \
  "$(json_escape "$REPORT")" "$([ "$STATUS" -eq 0 ] && echo true || echo false)" "$STATUS" > "$MANIFEST"
cat "$MANIFEST"

[ "$STATUS" -eq 0 ] || exit 1