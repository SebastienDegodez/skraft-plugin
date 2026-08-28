#!/usr/bin/env bash
set -u

[ "${1:-}" = "stryker" ] || exit 90
[ "${2:-}" = "--version" ] && { echo "4.8.0"; exit 0; }

if [ "${2:-}" = "init" ]; then
  printf '%s\n' "$*" >> "$FAKE_DOTNET_INIT_LOG"
  shift 2
  config=""
  solution=""
  threshold_high=""
  threshold_low=""
  threshold_break=""
  break_on_initial_test_failure=false
  reporters=()
  mutate=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --config-file) config="${2:-}"; shift 2 ;;
      --solution) solution="${2:-}"; shift 2 ;;
      --threshold-high) threshold_high="${2:-}"; shift 2 ;;
      --threshold-low) threshold_low="${2:-}"; shift 2 ;;
      --break-at) threshold_break="${2:-}"; shift 2 ;;
      --reporter) reporters+=("${2:-}"); shift 2 ;;
      --mutate) mutate+=("${2:-}"); shift 2 ;;
      --break-on-initial-test-failure) break_on_initial_test_failure=true; shift ;;
      *) shift ;;
    esac
  done

  mkdir -p "$(dirname "$config")"
  {
    printf '{\n  "stryker-config": {\n'
    printf '    "solution": "%s",\n' "$solution"
    printf '    "mutate": ['
    for index in "${!mutate[@]}"; do
      [ "$index" -eq 0 ] || printf ','
      printf '\n      "%s"' "${mutate[$index]}"
    done
    printf '\n    ],\n'
    printf '    "thresholds": { "high": %s, "low": %s, "break": %s },\n' "$threshold_high" "$threshold_low" "$threshold_break"
    printf '    "reporters": ['
    for index in "${!reporters[@]}"; do
      [ "$index" -eq 0 ] || printf ', '
      printf '"%s"' "${reporters[$index]}"
    done
    printf '],\n'
    printf '    "report-file-name": "mutation-report",\n'
    printf '    "break-on-initial-test-failure": %s\n' "$break_on_initial_test_failure"
    printf '  }\n}\n'
  } > "$config"
  exit 0
fi

config=""
output=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --config-file) config="${2:-}"; shift 2 ;;
    --output) output="${2:-}"; shift 2 ;;
    *) shift ;;
  esac
done
printf '%s\t%s\t%s\n' "$PWD" "$config" "$output" >> "$FAKE_DOTNET_LOG"
report_name=$(sed -n 's/.*"report-file-name": "\([^"]*\)".*/\1/p' "$config")
mkdir -p "$output/reports"
if [ "$(basename "$config")" != "${FAKE_DOTNET_NO_REPORT_CONFIG:-}" ]; then
  if [ "$(basename "$config")" = "${FAKE_DOTNET_EMPTY_REPORT_CONFIG:-}" ]; then
    node -e 'const fs = require("node:fs"); const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); report.files = {}; fs.writeFileSync(process.argv[2], JSON.stringify(report));' "$FAKE_DOTNET_REPORT_FIXTURE" "$output/reports/$report_name.json"
  else
    cp "$FAKE_DOTNET_REPORT_FIXTURE" "$output/reports/$report_name.json"
  fi
fi
[ "$(basename "$config")" != "${FAKE_DOTNET_FAIL_CONFIG:-}" ]
