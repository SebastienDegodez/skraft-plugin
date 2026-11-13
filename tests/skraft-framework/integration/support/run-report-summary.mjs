/** Removes the run diagnostic block when a scenario asserts the surrounding question text. */
export const withoutReportSummary = (text) => text.replace(
  /\n(?:Scenario in progress: [^\n]+\n)?Commits: [^\n]*\nStep verdicts: [^\n]*\nRefusals: [^\n]*\nOpen findings: [^\n]*\nIncidents: [^\n]*(?=\nThe run so far)/,
  '',
)
