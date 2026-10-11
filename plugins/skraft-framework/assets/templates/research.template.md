<!-- markdownlint-disable-file -->
# Research: {{topic}}

## Scope and success criteria
- Scope: {{coverage_and_exclusions}}
- Assumptions: {{assumptions}}
- Success criteria:
  - {{criterion}}

## Research executed
### File analysis
- {{workspace_relative_path}}
  - {{findings_with_line_numbers}}
### Code search / graph
- {{query}} -> {{matches_with_paths}}
### External research
- {{tool}}: {{query_or_url}} -> {{finding}} (Source: {{url}})
### Project conventions
- {{conventions_and_instructions_followed}}
- Stack, test framework, project layout, and the files that declare build/test commands: {{paths}}

## Key discoveries
{{patterns_examples_pitfalls}}

## Evaluated approaches
### {{approach_A}} (recommended)
- Rationale, evidence, references, impact.
### {{approach_B}} (rejected)
- Reason for rejection with evidence.

## Handoff to DESIGN
- Recommended approach + the decisions DESIGN must ratify.
- Existing aggregates, use cases, interfaces and structural patterns DESIGN reuses: {{name}} -> {{path}}
- Open questions that remain for the architect.
