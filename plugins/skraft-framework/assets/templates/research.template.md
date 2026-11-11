<!-- markdownlint-disable-file -->
# Research: {{topic}}

## Scope and success criteria
- Scope: {{coverage_and_exclusions}}
- Assumptions: {{assumptions}}
- Success criteria:
  - {{criterion}}

## Research executed
### File analysis
- {{#file:path_from_repository_root}}
  - {{finding}} ({{#file:path_from_repository_root:start-end}})
### Code search / graph
- {{query}} -> {{#file:path_of_each_match}}
### External research
- {{tool}}: {{query_or_url}} -> {{finding}} (Source: {{url}})
### Project conventions
- {{conventions_and_instructions_followed}}
- Stack, test framework, project layout, and the files that declare build/test commands: {{#file:path_of_each_file}}
### Existing tests
| Test file | Test name | Behaviour covered |
|---|---|---|
| {{#file:path_from_repository_root}} | {{test_name}} | {{behaviour}} |

## Product and architecture context
| Source | Kind | Authority | Requirements covered | Consumers of what the story publishes |
|---|---|---|---|---|
| {{#file:path_from_repository_root}} | architecture / PRD | {{rules / outranked by}} | {{requirement_ids}} | {{story_or_requirement_or_extension}} |

## Key discoveries
{{patterns_examples_pitfalls}}

## Evaluated approaches
### {{approach_A}} (recommended)
- Rationale, evidence, references, impact.
### {{approach_B}} (rejected)
- Reason for rejection with evidence.

## Handoff to DESIGN
- Recommended approach + the decisions DESIGN must ratify.
- Existing aggregates, use cases, interfaces and structural patterns DESIGN reuses: {{name}} -> {{#file:path_from_repository_root}}
- Open questions that remain for the architect.
