# GitHub prepared-Markdown publication

Load for publishing/updating prepared Markdown in PR conversation or issue comments,
including publication-only retry. `github-search-protocol` owns GitHub transport
mapping and host `gh` fallback; no companion skill or external discovery dependency.
Load [shared publication lifecycle](../../../assets/reporting/mcp-publication.md)
for consent, local prepare/decide/record commands, normalized observations, receipts
and reconciliation; [report contract](../../qa-reporting/references/report-contract.md)
retains producer/reviewer ownership. Apply the
[existing-issue content rule](../SKILL.md#existing-issue-content-is-read-only).
Do not author or regenerate report content here.

## MCP first: discover, bind, probe

Inspect the host's actual tool catalog, including deferred discovery when available.
Identify installed server, exposed names, schemas, operation selectors, exact-body
field and pagination controls. Never construct callable names from provider labels
or assume a namespace grant proves exposure, authentication or write permission.
Map [official GitHub MCP operations](https://github.com/github/github-mcp-server)
below only when discovery returns them; use the installed schema, not guessed args.

| Need | Documented operation to bind |
|---|---|
| Current authenticated identity | `get_me` |
| Confirm PR/head or issue | `pull_request_read` for PR; `issue_read` for issue |
| List conversation comments | Applicable read tool's `get_comments` operation; every page, exact raw body |
| Create conversation comment | `add_issue_comment`; `owner`, `repo`, `issue_number`, `body` when schema matches |
| Update selected conversation comment | `update_issue_comment`; `owner`, `repo`, `comment_id`, `body` when schema matches |
| Fresh readback | Exposed comment read or fresh complete `get_comments` listing, selecting actual returned/decision ID |

Use read-only probes for identity, confirmed host/repository, target number/type and
PR head branch. Reject PRs returned for issue-only targets. Normalize viewer and
comment authors to the same stable GitHub identity, never display names. Retain raw
responses and contributing call/page references under the shared observation contract.
DISCOVER's three-page/20-result caps do not apply: read every relevant comment page,
unfiltered, before claiming completeness. Missing/truncated data stays incomplete.
Inspect create/update support separately; unknown capabilities stay false. Never
probe write access with a throwaway comment or fabricate a successful empty listing.

Send exact saved packet body, including marker/newline, only for local authorized
create/update. Use selected target and comment ID, not latest comment, review-comment
endpoints, replies or issue body edits. Fresh readback must establish body, author,
ID, target/head and returned URL when available; write response is not readback.
Tools that sanitize/truncate bodies cannot establish exact reconciliation: stay pending.
Missing URL stays unavailable, never synthesized; dependent issue pointer waits.

## Conditional host gh fallback

Only absent MCP or an unexposed required capability permits fallback. Announce host
terminal `gh`; retain confirmed consent/target scope and existing tool permissions.
Never bypass denied permissions, read-only policy, human refusal or rate limits.
Failed/ambiguous writes require read-only reconciliation before retry or switching.
Re-probe identity on a switch; require the same authenticated identity as saved
decision/prior attempt or stop for human resolution. Never adopt another author's
marker. No automatic install, login, account switch, token printing or permission
changes. Missing CLI/auth/capabilities leave publication pending. ADO/GitLab stay
MCP-only, no `az`/`glab`. Local report CLI stays local-only; no network adapter/client.

### Probe and retain raw observations

Read installed `gh api --help`; consult [official manual](https://cli.github.com/manual/gh_api)
if syntax needs clarification. This reference supplies publication-specific policy.
Bind `host`, literal owner/repo `repo`, `number` and file paths explicitly from saved
packet and authorized artifact directory. Quote arguments; never use gh's
`{owner}`/`{repo}` placeholders or infer scope from cwd/`GH_REPO`. `comment_id` comes
only from saved decision or actual write result. Raw JSON is local evidence only.

```sh
gh --version
gh api --help
gh auth status --hostname "$host"
gh api --hostname "$host" --method GET user > "$identity_json"
gh api --hostname "$host" --method GET "repos/$repo" > "$repo_json"
```

Never use `--show-token`, `gh auth token` or verbose credential diagnostics. Require
successful probes. For PR use pulls; for issue use issues (only selected type):

```sh
gh api --hostname "$host" --method GET "repos/$repo/pulls/$number" > "$target_json"
gh api --hostname "$host" --method GET "repos/$repo/issues/$number" > "$target_json"
gh api --hostname "$host" --method GET "repos/$repo/issues/$number/comments?per_page=100" --paginate --slurp > "$comments_json"
```

Validate returned host/repository, number/type and PR `head.ref`/`base.repo.full_name`
against packet; reject a PR for issue-only target. Normalize viewer `id` and comment
`user.id` to the same stable identity. Retain every raw page and call/path; flatten
page arrays only in normalized snapshot. Set `complete: true` only after successful
unfiltered pagination. Inspect operation support/access, never infer write permission
from auth alone; unknown capabilities stay false. Run local `decide`.

### Exact body export and authorized write

Use explicit `pending_json` under resolved reporting directory for `{packet, decision}`
and a new authorized `prepared_body` path, never renderer Markdown or reconstructed text.
Export with Node, not shell substitution, `echo`, trimming or manual copying:

```sh
node --input-type=module -e 'import {readFileSync,writeFileSync} from "node:fs"; const [input,output]=process.argv.slice(1); const {packet}=JSON.parse(readFileSync(input,"utf8")); if(packet?.status!=="ready" || typeof packet.body!=="string") throw new Error("Ready packet body required"); writeFileSync(output,packet.body,{encoding:"utf8",flag:"wx"});' "$pending_json" "$prepared_body"
```

Preserve marker/trailing newline exactly. Never modify saved packet/decision; choose
safe new output path inside authorized roots, no symlink escapes. Only saved `create`
authorizes POST; only saved `update` authorizes PATCH to selected ID. `unchanged`
skips write; `pending` stops. Run exactly one selected write, never both:

```sh
gh api --hostname "$host" --method POST "repos/$repo/issues/$number/comments" --field "body=@$prepared_body" > "$write_json"
gh api --hostname "$host" --method PATCH "repos/$repo/issues/comments/$comment_id" --field "body=@$prepared_body" > "$write_json"
```

`--field` is full spelling of `-F`; file input supplies exact prepared Markdown.
Never use `--edit-last`, review-comment endpoints, replies or duplicate-create fallback.
Failed/uncertain write: retain outputs, reconcile identity/target/all comments read-only,
then `decide` afresh; never invent a write-result ID or blindly repeat.

### Fresh readback and CLI transport mapping

Successful write uses returned ID; unchanged uses decision ID. Re-read identity and
target/head, then selected comment; never substitute write response for fresh read:

```sh
gh api --hostname "$host" --method GET "repos/$repo/issues/comments/$comment_id" > "$readback_json"
```

Check `issue_url` binds comment to selected issue/PR. Normalize exact `body`, `id`,
`user.id`, returned `html_url` if present, full target and branch. Retain raw JSON for
identity/target/pages/write/readback; no `--jq` filtering instead of raw retention.
Map snapshot/readback provenance to `{server: 'gh', tool: 'gh api', transport: 'gh-cli'}`.
Run local `record` with normalized readback and actual write-result IDs where required;
shared lifecycle owns remaining schema. CLI receipt uses `host-gh-cli-readback` rather
than MCP's `host-mcp-readback`; both are local host-attestation comparison, not independent
network verification. Missing URL stays unavailable; issue pointer waits for PR URL.
File input may lower repeated body output tokens; probes, reads and context still cost.
No savings or free-operation promise.