# PR and issue reports

Reporting makes the artifact flow visible: approved DISTILL scenarios and test plan
become a **forecast**; DELIVER code, quality evidence and persisted review become an
**outcome**, including when delivery is blocked. The approved protocol maintains two
stable PR comments per story/report identity, updating them rather than adding one
per retry. Forecast means planned tests and expected impact, not passing tests.
Outcome compares expected and actual impact, with recorded checks, metrics, changes
and limitations. Missing proof is not success; delivery is not deployment.

The approved extraction gives [qa-reporting](skills/qa-reporting/SKILL.md) ownership of
report preparation guidance, the canonical [report data contract](skills/qa-reporting/references/report-contract.md)
and bundled `forecast` / `outcome` Markdown templates.
Scripts render those templates from reviewed inputs; the skill does not run tests,
decide gates or publish comments. Generated data, reports and receipts stay in the
consumer project's resolved tracking directories, never in the installed skill.
No company override, profiles, new configuration key or reporting agent is introduced.
Template integration and default-output parity remain pending validation.

At startup, the user selects full PR reports, issue `link` / `full` / `none`, and
whether to receive a chat summary. PR full + issue link + chat summary is recommended,
not silently enabled. Confirmed repository, branch, targets and `maxMedia` persist
under `userPreferences.reporting` through the state service and survive resume.
`maxMedia` is an explicit non-negative choice, including zero; there is no hard default.
Changed target scope requires renewed confirmation, not inference from the active PR.

No PR/MR yet means pending publication. Draft creation requires explicit user approval
and a suitable operation exposed by the host; any push requires separate scoped consent
and real branch changes. The reporting CLI does neither. Once a PR/MR exists, its
confirmed identity is saved again before publication.

The [reporting CLI](src/cli/report.mjs) renders and validates locally; the orchestrator
owns remote publication through the host. For GitHub, the shipped
[github-publication](skills/github-publication/SKILL.md) is the canonical
transport procedure: MCP first, announced host `gh` fallback only when MCP or a
required capability is unavailable under the skill's policy. No external companion
skill is required. Azure DevOps/GitLab remain MCP-only reporting targets, not a promise
of full engineering-pipeline support. The shared [publication lifecycle](assets/reporting/mcp-publication.md)
owns local command usage, handoff contracts and recovery; GitHub operations stay in
the canonical skill rather than being repeated here.

Publication receipts compare host readback locally; they are **not independent
network verification by scripts**. Provider mappings have local fixture tests only;
live provider availability and end-to-end host integration remain unverified.

A full issue report reuses the rendered body; link mode is prepared only after a
matching PR/MR receipt supplies its returned comment URL. A publication-only failure
retains local Markdown and per-target status, including after `DONE`. Missing URLs
leave issue pointers pending rather than inventing permalinks. Recovery reuses saved
reports without rerunning tests, mutation, capture or review. Abandoning an unresolved
local attempt requires explicit human confirmation and a reason; it preserves receipts
and neither cancels nor undoes a remote write.

Reports are **Markdown comment content**, not uploaded files or hosted reports. For
frontend work, existing producers capture Playwright evidence and reviewers validate
it. Only already remotely accessible evidence is linked; local-only evidence is stated
as unavailable remotely. The selected media cap limits report links, not evidence
retained for review. No automatic upload, hosting or attachment quota is introduced.
Recorded reviewer verdicts remain distinct from the renderer's local proof checks;
the current renderer leaves Git-object verification to the reviewer.

No new reporting agent or review panel is added. Existing specialists own plans,
impact interpretation and evidence; the orchestrator routes local commands and host
calls. Body reuse avoids per-destination synthesis, not transmission or readback work;
no measured token savings or price is claimed. See the maintainer-only
[QA skill Genesis handoff](../../docs/superpowers/plans/2026-09-19-qa-reporting-skill.md)
for definitive reduced scope, interfaces and pending validation; the
[earlier reporting plan](../../docs/superpowers/plans/2026-09-17-pr-markdown-reporting.md)
retains publication history.
