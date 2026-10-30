# WIQL recipes

Replace `{project}` with the project name, doubling every `'` inside it. Write the text to a
file for the az route; pass it as `wiql` for an MCP WIQL tool. Every recipe selects the fields
discovery needs:

```sql
SELECT [System.Id], [System.Title], [System.State], [System.Tags], [System.AssignedTo], [System.IterationPath], [System.ChangedDate]
FROM WorkItems
WHERE [System.TeamProject] = '{project}'
  AND [System.State] NOT IN ('Closed', 'Done', 'Removed')
  AND <mode clause>
ORDER BY [System.ChangedDate] DESC
```

Name the project; never write the `@project` macro.

| Mode | `<mode clause>` | MCP without WIQL |
|---|---|---|
| User-assigned | `[System.AssignedTo] = @Me` | `wit_work_item` `my` |
| Artifact-driven | `([System.Title] CONTAINS '{term1}' OR [System.Title] CONTAINS '{term2}')` | `search_workitem` with `searchText: "{term1} OR {term2}"` |
| By tag | `[System.Tags] CONTAINS 'type/bug'`; one `CONTAINS` per tag, joined with `OR` for any of them | az route |
| By iteration | `[System.IterationPath] UNDER '{project}\{iteration}'` | `work` `list_iterations` for its ID, then `wit_work_item` `list_for_iteration` |
| Unassigned | `[System.AssignedTo] = ''` | az route |
| Untagged | `[System.Tags] = ''` | az route |
| Critical, for the completeness check | `([System.Tags] CONTAINS 'priority/P0' OR [System.Tags] CONTAINS 'priority/P1')` | az route |
| Excluded tag | `[System.Tags] NOT CONTAINS 'status/wontfix'` | filter after the fetch |

For the critical sample, end with `ORDER BY [System.CreatedDate] ASC` instead and keep the
first five.
