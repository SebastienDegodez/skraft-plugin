#!/usr/bin/env bash
# G11 — line coverage of the Domain and Application core meets the bar (100%).
# Runs the solution's tests once with the XPlat collector, then sums the Cobertura line
# counts of every *.Domain and *.Application package (nested bounded contexts included).
# Evidence: qg-coverage.stdout (test output + summary line), .exit, .stdout.sha256, .json.
# Exit: 0 pass | 1 below the bar, tests failed or nothing measured | 2 usage error | 3 toolchain missing
set -uo pipefail

EXPECTED=100
usage() { echo "Usage: $(basename "$0") --root <dir> --evidence <dir> [--solution <sln>]"; }
ROOT=""
EV=""
SOLUTION=""
while [ $# -gt 0 ]; do
  case "$1" in
    --root)      [ $# -ge 2 ] || { usage >&2; exit 2; }; ROOT="$2"; shift 2 ;;
    --evidence)  [ $# -ge 2 ] || { usage >&2; exit 2; }; EV="$2"; shift 2 ;;
    --solution)  [ $# -ge 2 ] || { usage >&2; exit 2; }; SOLUTION="$2"; shift 2 ;;
    --threshold) echo "refusing --threshold: the bar is not a runtime argument" >&2; exit 2 ;;
    --help|-h)   usage; exit 0 ;;
    *)           echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done
[ -n "$ROOT" ] && [ -n "$EV" ] || { usage >&2; exit 2; }
ROOT=$(cd "$ROOT" 2>/dev/null && pwd -P) || { echo "repository root not found" >&2; exit 2; }
case "$EV" in /*|[A-Za-z]:[\\/]*) ;; *) EV="$ROOT/$EV" ;; esac
if [ -z "$SOLUTION" ]; then
  SOLUTION=$(cd "$ROOT" && ls -1 ./*.sln ./*.slnx 2>/dev/null)
  [ "$(printf '%s\n' "$SOLUTION" | grep -c .)" -eq 1 ] || { echo "select one solution with --solution" >&2; exit 2; }
fi
command -v node >/dev/null 2>&1 || { echo "node is not on PATH" >&2; exit 3; }
command -v dotnet >/dev/null 2>&1 || { echo "dotnet is not on PATH" >&2; exit 3; }
mkdir -p "$EV" || exit 2

sha256() { if command -v shasum >/dev/null 2>&1; then shasum -a 256 < "$1" | awk '{print $1}'; else sha256sum < "$1" | awk '{print $1}'; fi; }
RESULTS=$(mktemp -d "${TMPDIR:-/tmp}/skraft-coverage.XXXXXX") || exit 2
trap 'rm -rf "$RESULTS"' EXIT

STDOUT="$EV/qg-coverage.stdout"
( cd "$ROOT" && dotnet test "$SOLUTION" --nologo --collect:"XPlat Code Coverage" --results-directory "$RESULTS" ) > "$STDOUT" 2>&1
TEST_STATUS=$?

node - "$RESULTS" "$EXPECTED" "$TEST_STATUS" "$STDOUT" "$EV/qg-coverage.json" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const [results, expectedText, testStatusText, stdoutPath, manifestPath] = process.argv.slice(2)
const expected = Number(expectedText)
const reports = []
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name === 'coverage.cobertura.xml') reports.push(full)
  }
}
walk(results)
// Cobertura lists a line under its method and again under its class: count each
// source line once, covered when any entry hit it.
const lines = new Map()
for (const report of reports) {
  const xml = fs.readFileSync(report, 'utf8')
  for (const [, name, body] of xml.matchAll(/<package\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/package>/g)) {
    if (!/(^|\.)(Domain|Application)$/.test(name)) continue
    for (const [, file, classBody] of body.matchAll(/<class\b[^>]*\bfilename="([^"]*)"[^>]*>([\s\S]*?)<\/class>/g)) {
      for (const [, number, hits] of classBody.matchAll(/<line\b[^>]*\bnumber="(\d+)"[^>]*\bhits="(\d+)"/g)) {
        const key = `${name}|${file}:${number}`
        lines.set(key, (lines.get(key) ?? false) || Number(hits) > 0)
      }
    }
  }
}
const valid = lines.size
const covered = [...lines.values()].filter(Boolean).length
const percent = valid ? Math.floor((covered * 10000) / valid) / 100 : 0
const testsPassed = Number(testStatusText) === 0
const passed = testsPassed && valid > 0 && covered * 100 >= expected * valid
const summary = valid === 0
  ? 'Line coverage (Domain, Application): no Domain or Application package was measured'
  : `Line coverage (Domain, Application): ${covered}/${valid} = ${percent}% (bar ${expected}%)`
fs.appendFileSync(stdoutPath, `${summary}\n`)
const exit = passed ? 0 : 1
fs.writeFileSync(manifestPath, `${JSON.stringify({ gate: 'coverage', expected, covered, valid, percent, passed, exit })}\n`)
process.exit(exit)
NODE
STATUS=$?
printf '%s\n' "$STATUS" > "$EV/qg-coverage.exit"
sha256 "$STDOUT" > "$EV/qg-coverage.stdout.sha256"
exit "$STATUS"
