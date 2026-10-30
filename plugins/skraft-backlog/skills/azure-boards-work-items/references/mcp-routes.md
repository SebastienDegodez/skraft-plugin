# MCP routes

Load when the host exposes Azure DevOps MCP tools. The names below are those of
`@azure-devops/mcp` 2.11.0 (local server) and of the remote server at
`https://mcp.dev.azure.com/{org}`. Call a tool only when the host catalog lists it, with the
schema the catalog gives; the host prefixes the name with the server (`mcp__ado__wit_work_item`
in Claude Code, `ado/wit_work_item` in Copilot). Pass `project` in every call that takes it: a
call without it asks the human to pick a project.

## Read

| Need | Tool | Arguments |
|---|---|---|
| One work item, with its links | `wit_work_item` | `action: "get"`, `id`, `project`, `expand: "Relations"` |
| Several work items | `wit_work_item` | `action: "get_batch"`, `ids`, `project`, `fields` (`System.Id`, `System.Title`, `System.State`, `System.Tags`, `System.AssignedTo`, `System.IterationPath`, `System.ChangedDate`) |
| Comments, every page | `wit_work_item` | `action: "list_comments"`, `workItemId`, `project`, then `continuationToken` from the previous page until none comes back |
| Assigned to you | `wit_work_item` | `action: "my"`, `project`, `type: "assignedtome"`; then `get_batch` on the IDs |
| WIQL | `wit_query` with `action: "wiql"`, `wiql`, `project`, `top: 1000` (local server; `top` defaults to 50); `wit_query_by_wiql` (remote server, Insiders only) | the WIQL text of the recipe |
| Text search | `search_workitem` | `searchText`, `project: ["{project}"]`, `top: 20`, `skip` |
| Iterations | `work` | `action: "list_iterations"`, `project` |

A WIQL tool absent from the catalog → use `search_workitem` for terms, `my` for the assigned
mode, and take the az route for a tag or iteration query.

## Write

| Need | Tool | Arguments |
|---|---|---|
| Comment | `wit_work_item_comment_write` | `action: "add"`, `project`, `workItemId`, `text` (the file content), `format: "Markdown"` |
| Tags or iteration | `wit_work_item_write` | `action: "update"`, `project`, `id`, `updates`: first `{ "op": "test", "path": "/rev", "value": <rev of your read> }`, then `{ "op": "add", "path": "/fields/System.Tags", "value": "a; b; c" }` and/or `{ "op": "add", "path": "/fields/System.IterationPath", "value": "{iteration path}" }` |
| Child of a split story | `wit_work_item_write` | `action: "add_child"`, `project`, `parentId`, `workItemType` (the parent's), `items: [{ "title", "description", "format": "Markdown", "iterationPath" }]`; then tag each child with an `update` |
| Work item the developer named | `wit_work_item_write` | `action: "create"`, `project`, `workItemType`, `fields: [{ "name": "System.Title", "value" }, { "name": "System.Description", "value", "format": "Markdown" }, { "name": "System.Tags", "value" }]` |
| Link | `wit_work_item_link_write` | `action: "link"`, `project`, `updates: [{ "id", "linkToId", "type" }]`; `type` is `duplicate of` (on the newer item, towards the original), `related`, `parent` or `child` |

- A `test` on `/rev` that fails means someone changed the item: read it again and rebuild the
  tag list before retrying.
- Send the `<sub>…</sub>` marker line as written. The server rewrites `<`, `>` and `&` in a
  Markdown comment (2.11.0); how Azure Boards then shows that line is not measured.
- Never call `wit_work_item_comment_write` with `action: "update"` on a comment you did not
  write in this run, nor `wit_work_item_link_write` with `action: "unlink"`.
