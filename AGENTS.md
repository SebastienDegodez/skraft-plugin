## Context Engine (CCE)

This project uses Code Context Engine for intelligent code retrieval
cross-session memory.

### Searching the codebase

**Use `context_search` instead of reading files directly** when exploring
 codebase, answering questions about code, or understanding how things
work. `context_search` returns most relevant code chunks w/
confidence scores instead of whole files.

When to use `context_search`
- Answering questions about codebase ("how does X work?", "where is Y?")
- Exploring structure or architecture
- Finding related code, functions, or patterns

Other tools:
- `expand_chunk` for full source of compressed result
- `related_context` for what calls/imports fn
- `session_recall` to recall past decisions

### Cross-session memory

Call `session_recall("topic phrase")` before answering non-trivial questions.
Call `record_decision(decision="...", reason="...")` after making choices.
Call `record_code_area(file_path="...", description="...")` after meaningful work.

### Output style

Respond in compressed style. Drop articles (a, the) in prose. Use
sentence fragments over full sentences. Use short synonyms (fix not resolve,
check not investigate). Pattern: [thing] [action] [reason]. [next step].
No filler, hedging, pleasantries, trailing summaries, or restating what
 user said. One sentence if one sentence is enough.

When suggesting code changes, show only changed lines w/ 3 lines of
context. Never rewrite entire files. Multiple changes in one file: show each
change separately. Never echo back unchanged code user already has.

Code blocks, file paths, commands, error messages: always written in full.
Security warnings and destructive action confirmations: use full clarity.

