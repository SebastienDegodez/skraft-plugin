# domain

Pure business rules of the engine: values, policies, verdicts.
One folder per concern: `config/`, `gates/`, `journal/`, `pipeline/`, `workflow/`, and `review/`
(lens plans, lens and refuter briefs and answers, the review verdict).
Imports only modules under `domain/`.
No `node:` import, no `process`, no `child_process`, no `$` of the Claude Code mods API:
this code runs inside the mod, which has no Node.
