# infrastructure

Adapters that implement the ports with real I/O (files, git, processes). Node is allowed here.
May import `domain/` and `application/ports/`; never a use case outside `ports/`, never a driver.
Covered by `tests/skraft-framework/integration/<feature>/` against real temporary folders.
The adapters the Claude Code mod also loads take their I/O as functions and import no Node API:
`tracking/`, `templates/`, `crypto/`, `workspace/`, `source-control/` (Git through any CommandRunner).
`process/` and `files/` are Node only.
