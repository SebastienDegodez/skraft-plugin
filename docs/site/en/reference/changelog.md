---
layout: doc
lang: en
title: "Changelog"
---

# Changelog

## v1 — ADR migration (2026-06)

- ADRs move out of `docs/adr/` and are consolidated under `docs/adr/`.
- `scripts/migrate-adr-layout.mjs` renumbers ADR files into a single global sequence (`adr-001-...md`, `adr-002-...md`, etc.) and rewrites reference links.
- Recommended usage:

```bash
node scripts/migrate-adr-layout.mjs \
	--repo /path/to/repo \
	--renumber-global

# apply for real
node scripts/migrate-adr-layout.mjs \
	--repo /path/to/repo \
	--renumber-global \
	--apply
```

- Dry-run is the default; review the summary before adding `--apply`.
- After migration, verify `docs/adr/supersessions.md` and `ADR-*` references in DESIGN artefacts.

## v0 — Bootstrap (2026-05)

- Created the SKRAFT public documentation site.
- Pages: landing, pipeline, architecture, concepts, customisation, agent and skill reference.
- Integrated citation lint.
