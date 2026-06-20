<!-- markdownlint-disable-file -->
# ADR-003 — Config Loader Cascade (project > global > env)

**Date:** 2026-06-20
**Status:** Accepted
**Deciders:** Solution Architect (US1)

## Context
Framework config must support: project-local overrides > user-global defaults > environment variable fallback. No external config library allowed (zero runtime deps).

## Decision
`application/config-loader.mjs` implements a three-level cascade:
1. Project-local: `.skraftrc.json` or `skraft.config.mjs` in CWD
2. Global: `~/.skraft/config.json`
3. Environment: `SKRAFT_*` env vars

Later levels fill in keys not set by earlier ones. Pure Node.js `fs`, `path`, `os` (all built-in).

## Consequences
- **Positive**: Zero runtime deps
- **Positive**: Fully testable via in-memory filesystem adapter
- **Constraint**: Only Node.js built-in modules used
