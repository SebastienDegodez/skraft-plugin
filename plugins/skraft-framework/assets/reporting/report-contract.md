# Reporting contract

Load when configuring publication, producing/checking forecast or outcome data,
or rendering/publishing a reviewed report. No new agent or review pass.

## Ownership and sources

- Acceptance designer writes forecast data from existing DISTILL Markdown plans
  and approved AC/design sources. Acceptance reviewer checks traceability and
  sourced expected impact in its existing review. Forecast follows approved DISTILL;
  planned tests are not passed tests.
- Software engineer writes outcome data, actual impact, quality evidence, change
  log and frontend manifest, including on blocked delivery. Engineer reviewer keeps
  all four mandatory lenses and owns the persisted verdict. Quality-gates lens
  checks report/evidence consistency; cold-reader receives no producer context.
- Router passes raw returned paths, records the review, binds its persisted
  `reviewRef` into producer data, then invokes the CLI. Never author impact,
  evidence, change logs or a report verdict in the router.
- Reuse source Markdown documents, not a second planning exercise or raw full
  logs. Cite impact sources in `impact` text and limitations; do not add invented
  schema fields. Unknown actual impact stays explicitly unverified; delivered
  never means deployed without proof.
- All report source refs and media paths are repository-root-relative, including
  tracking directories. Use exact returned paths and the resolver's tracking
  root; never guess today's directory, probe alternate layouts or use absolute
  paths, traversal, symlink escapes, URL fragments or credentials in refs.

## Data interfaces (JSON)

Preferences retain these keys, with optional provider scope below. `confirmed`
  must be `true`; `repo` is a provider repository identifier or null;
  `branch` is a string; target numbers are positive integers or null;
  `issue` is `link`, `full` or `none`; booleans are explicit; `maxMedia` is an
  integer >= 0. This example is NOT consent or a default:

```json
{
  "confirmed": true,
  "repo": "owner/repo",
  "branch": "feature/checkout",
  "prNumber": null,
  "issueNumber": 42,
  "destinations": { "pr": true, "issue": "link", "chat": true },
  "maxMedia": 0,
  "allowDraftPr": false
}
```

Optional preferences: `provider` is `github`, `azure-devops` or `gitlab` (omitted
means GitHub); `host` defaults to that provider's public host. GitHub `repo` is
`owner/repo`; GitLab preserves the full nested path, e.g. `group/subgroup/shop`.
Azure requires `organization` and `project`, with repository name or ID in `repo`.
Keep `prNumber`/`issueNumber` and `pr`/`issue` as wire aliases for PR/MR and
issue/work-item destinations. Confirm the full provider/host/repository scope;
never derive it from an editor tab. These options enable reporting only, not
Azure/GitLab support for the entire engineering pipeline.

Renderer data has exactly the fields below: `kind` is `forecast` or `outcome`,
`story` an identifier, `title` a string, `revision` the full 40-hex source commit,
`language` `fr` or `en`, and `impact.expected` a string. `impact.actual` is optional
for forecast; supply observed impact or explicit unknown for outcome. Criteria
carry unique `id`, `description`, `test` strings and optional root-relative
`evidence`. The four `*Ref` fields are optional in the wire schema: supply
`testPlanRef` for forecast; `qualityEvidenceRef`, `changeLogRef` for outcome;
router supplies `reviewRef` only after that review is persisted. `limitations`
is a string array; media entries carry `label` plus optional existing `url` and/or
root-relative `path`. `maxMedia` is the explicitly selected nonnegative integer.
Example outcome (illustrative refs; replace with actual returned paths):

```json
{
  "kind": "outcome",
  "story": "checkout",
  "title": "Checkout validation",
  "revision": "0123456789abcdef0123456789abcdef01234567",
  "language": "en",
  "impact": {
    "expected": "Reject invalid checkout; source: docs/checkout.md",
    "actual": "Observed rejection in AC-1 test; deployment unverified."
  },
  "criteria": [{ "id": "AC-1", "description": "Reject invalid checkout", "test": "Checkout rejects invalid input", "evidence": ".copilot-tracking/skraft-plans/checkout/evidence/2026-09-17/tests.stdout" }],
  "testPlanRef": ".copilot-tracking/skraft-plans/checkout/details/2026-09-17/test-plan-checkout.md",
  "qualityEvidenceRef": ".copilot-tracking/skraft-plans/checkout/evidence/2026-09-17/qg-checkout.json",
  "reviewRef": ".copilot-tracking/skraft-plans/checkout/reviews/2026-09-17/deliver-review-1.md",
  "changeLogRef": ".copilot-tracking/skraft-plans/checkout/changes/2026-09-17/change-log.md",
  "limitations": ["Browser evidence is local-only; no deployment evidence."],
  "media": [{ "label": "Checkout rejection", "path": ".copilot-tracking/skraft-plans/checkout/changes/2026-09-17/evidence/checkout/evidence/screenshots/rejection.png" }],
  "maxMedia": 0
}
```

Missing refs remain missing, never fabricated to satisfy rendering. Keep canonical
[quality evidence](../../skills/quality-gates-evidence-contract/SKILL.md) and
[quality bar](../../skills/skraft-quality-bar/SKILL.md) authoritative: current v3
includes G11; legacy v1/v2 stay readable, missing gates never pass. Renderer local
proof checks are distinct from recorded reviewer verdict, particularly Git checks
G8/G9. A final report has no verdict of its own and cannot overrule review.

## Publication handoff ownership

The CLI owns `userPreferences.reporting`, prepared packets, decisions and publication
receipts; the host supplies observations, not replacement authority. Producers and
reviewers consume the data interfaces above, not transport procedures.

At startup, report boundaries or publication-only resume, the router loads
[host publication lifecycle](mcp-publication.md) for consent, CLI commands,
observation/readback schemas, reconciliation and receipt semantics. When the selected
provider is `github`, also load
[github-search-protocol](../../skills/github-search-protocol/SKILL.md) for its
publication route; do not run issue discovery to publish prepared Markdown.

Publication status is separate from engineering approval. Approved DISTILL supplies
forecast; approved or blocked DELIVER supplies factual outcome and available evidence.
The existing reviewer owns that verdict; a publication receipt is not a new review.

## Media boundary

Use existing verified remote URLs only; flag authentication/expiry limits. Local
paths are local-only, never published attachments. No hosting, binary uploads,
release assets or automatic push to make links work. Any upload mechanism and
authorization require separate agreement. Withhold sensitive screenshots/traces;
never claim arbitrary media is safe. `maxMedia` limits report selection, not local
failure diagnostics, correctness captures, test execution or reviewer inputs.
No media count default is implied. No attachment file-count/byte quota applies to
Markdown; local input and provider comment limits still apply.