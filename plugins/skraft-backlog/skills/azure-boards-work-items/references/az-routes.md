# az routes

Load when no Azure DevOps MCP tool serves the operation. `{skill}` is the folder that holds the
`azure-boards-work-items` SKILL.md; `{work}` is the working folder your caller names
(`.copilot-tracking/…`), never `{skill}`. Run every command from the repository root.

- One command per call, as `az <group> <command> --option value`: no pipe, no redirection, no
  environment variable, no heredoc.
- Quote every value that holds a path, a project, a title, a tag list or a space.
- Data goes through files written first with your file tool. A file argument is written
  `"@<path>"`, quotes included: `az` loads the file content, and PowerShell reads an unquoted
  `@word` as something else.
- Pass `--org https://dev.azure.com/{org}` to every command, `--project "{project}"` where the
  command takes it, and `--output json`.

## Check the CLI once per run

1. `az version` fails → stop, the write stays pending: `az` is not installed.
2. `az extension show --name azure-devops` fails → stop: tell the developer to run
   `az extension add --name azure-devops`.
3. The first read below answers that you must sign in → stop: tell the developer to run
   `az login` (or `az devops login` with a personal access token).

## Read

| Need | Command |
|---|---|
| One work item, fields and links | `az boards work-item show --id {id} --org {org-url} --output json` |
| WIQL | write the recipe to `{work}/query.wiql`, then `az boards query --wiql "@{work}/query.wiql" --project "{project}" --org {org-url} --output json` |
| Comments, first page | `az devops invoke --area wit --resource comments --route-parameters "project={project}" "workItemId={id}" --api-version 7.2-preview.4 --org {org-url} --output json` |
| Comments, next page | the same, with `--query-parameters "continuationToken={token}"` from the previous page, until none comes back |
| Iterations | `az boards iteration project list --project "{project}" --depth 3 --org {org-url} --output json` |
| Link names | `az boards work-item relation list-type --org {org-url} --output json` |

`az boards query` returns at most 1000 items with the fields of the `SELECT`: keep the cap of
20 after ranking.

## Write

| Need | Commands |
|---|---|
| Comment | 1. `node {skill}/scripts/comment-request.mjs --in "{work}/comment.md" --out "{work}/comment.json"` 2. `az devops invoke --area wit --resource comments --route-parameters "project={project}" "workItemId={id}" --query-parameters "format=0" --http-method POST --in-file "{work}/comment.json" --api-version 7.2-preview.4 --org {org-url} --output json` |
| Tags | `az boards work-item update --id {id} --fields "System.Tags={a; b; c}" --org {org-url} --output json` |
| Iteration | `az boards work-item update --id {id} --iteration "{iteration path}" --org {org-url} --output json` |
| Child of a split story | 1. write the description to `{work}/child-{n}.html` 2. `az boards work-item create --type "{parent type}" --title "{title}" --description "@{work}/child-{n}.html" --iteration "{iteration path}" --fields "System.Tags={tags}" --project "{project}" --org {org-url} --output json` 3. `az boards work-item relation add --id {child id} --relation-type Parent --target-id {parent id} --org {org-url} --output json` |
| Work item the developer named | step 1 and 2 of the child row, without step 3 |
| Duplicate | `az boards work-item relation add --id {newer id} --relation-type "Duplicate Of" --target-id {original id} --org {org-url} --output json` |
| Related | the same with `--relation-type Related` |

- Tags have no revision check over `az`: read the item (`System.Rev`, `System.Tags`) right
  before the update, and again after it. `System.Rev` grew by more than one → another write
  landed in between and its tags may be lost: re-add yours from the fresh read once, and name the
  item in your report.
- The comments resource, `format=0` (Markdown) and API version `7.2-preview.4` are those the
  MCP server 2.11.0 sends; through `az devops invoke` they are not measured on a real
  organization. The call fails → the comment stays pending.
- `az` stores a description as HTML: write the description file in HTML (`<p>`, `<ul><li>`,
  `<pre>`), never in Markdown.
- A relation name absent from the link names of the organization → report the link as pending.
- `comment-request.mjs` refuses to overwrite `{work}/comment.json`: delete the old file first or
  pick a new name.
