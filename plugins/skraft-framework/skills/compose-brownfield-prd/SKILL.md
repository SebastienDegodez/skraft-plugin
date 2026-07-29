---
name: compose-brownfield-prd
description: "Use to compose an HVE-format PRD (17 sections, docs/prds/<name>.md) from brownfield characterization artifacts produced by characterize-brownfield. Maps as-is features, constraints, integrations, coverage and tech debt into HVE PRD sections with FR/NFR IDs and full traceability. Activate on 'write the PRD', 'compose PRD from characterization', 'produce an HVE PRD for this system'."
disable-model-invocation: true
---

# Compose Brownfield PRD

Maps `characterize-brownfield` output into a PRD matching the exact HVE format so downstream
HVE agents (GitHub Backlog Manager, `ado-prd-to-wit`, `jira-prd-to-wit`) can consume it directly.
Loaded internally by `brownfield-analyst` after characterization completes — not designed for
standalone dispatch (hence `disable-model-invocation`), but callable directly if characterization
artifacts already exist from a prior run.

**Boundary.** Consumes characterization artifacts; never re-scans the repo itself (reload the
persisted artifacts — B4 — rather than re-deriving). Never creates issues. Never edits code.

## Inputs

- Path to characterization artifacts (`index.md` + siblings from `characterize-brownfield`).
- Product name (used for the kebab-case filename).
- Goals (optional — if the human states explicit modernization goals, fold them into Section 1;
  otherwise derive draft goals from the "Modernization Opportunities" signal in tech-debt.md).

## Mapping table (characterization -> HVE PRD section)

| Characterization source | HVE section |
|---|---|
| structure.md, index.md summary | S5 Product Overview, S1 context |
| features.md (Core/Secondary) | S6 Functional Requirements (`FR-NNN`) |
| features.md (Legacy-unused) + coverage.md gaps | S2 Problem (current situation), S4 Constraints |
| integration.md | S9 Dependencies, S7 NFR (reliability/performance), S11 Privacy/Security |
| contracts.md (if not `none-found`) | S6/S7 (API-shaped FR/NFR), S9 Dependencies, S11 |
| coverage.md (traceability) | confidence carried into S14 Open Questions; NONE-coverage Core features -> explicit open question |
| tech-debt.md (3x3 risk scores) | S10 Risks & Mitigations (`Risk ID`, Severity from P0-P3 band) |
| tech-debt.md P0/P1 items evidencing NFR gaps | S7 Non-Functional Requirements, using Status/Threshold/Actual/Evidence shape (PASS/CONCERNS/FAIL per NFR) |
| Modernization signals | S1 Goals, S13 Rollout & Launch Plan |
| Any Low-confidence claim | S14 Open Questions (one row per claim) |

## Procedure

1. **Reload** all characterization artifacts (B4 — do not rely on the loading agent's recall).
2. **Draft Sections 1-4** (Executive Summary, Problem, Users & Personas, Scope) from structure.md
   + features.md + the human-provided product name/goals. Users & Personas: if characterization
   found no evidence of end users (e.g. an internal library), state this explicitly rather than
   inventing personas.
3. **Draft Section 5** (Product Overview) from structure.md + index.md summary — "as-is" framing.
4. **Draft Section 6** (Functional Requirements) — one `FR-NNN` row per Core/Secondary feature.
   Every FR links back to a Goal ID from Section 1 (traceability requirement).
5. **Draft Section 7** (NFR) — one `NFR-NNN` row per NFR category with evidence from
   integration.md/tech-debt.md. Use the Status/Threshold/Actual/Evidence shape; default `CONCERNS`
   when no measured evidence exists for a category (never fabricate a PASS).
6. **Draft Sections 8-13** as applicable (Data & Analytics only if integration.md shows
   events/analytics; Dependencies from integration.md; Risks from tech-debt.md 3x3 scores mapped
   to Severity; Privacy/Security from any auth/PII signal found; Operational Considerations always
   included for a running system; Rollout only if modernization goals were stated).
7. **Draft Section 14** (Open Questions) — every Low-confidence claim and every NONE-coverage
   Core feature becomes one row, `Owner: TBD`.
8. **Draft Sections 15-17** (Changelog: one entry, `v0.1 — initial brownfield extraction`;
   References & Provenance: cite every characterization file as a Ref; Appendices only if a
   glossary is warranted).
9. **Schema gate (S4)** before writing: verify all 17 section headers present in order, every
   FR/NFR has a unique ID, every FR links to a Goal ID, no YAML frontmatter, markers present.

## Output contract (non-negotiable — verify before writing)

- Path: `docs/prds/<kebab-case-product-name>.md`.
- File starts with `<!-- markdownlint-disable-file -->` then `<!-- markdown-table-prettify-ignore-start -->`.
- File ends with `<!-- markdown-table-prettify-ignore-end -->`.
- **No YAML frontmatter** (unlike BRD — this is a PRD-specific rule).
- IDs: `FR-001`, `NFR-001`, Risk IDs in the Risks table.
- State file: `.copilot-tracking/prd-sessions/<kebab-case-product-name>.state.json` recording
  `currentPhase: "brownfield-extraction"`, `sourceCharacterization: <path>`, `qualityChecks`.

## Handoff

Report to the human: the PRD path, the gate verdict, and the count of Open Questions. The human
decides when to hand the PRD to an HVE agent (GitHub Backlog Manager for artifact-driven issue
discovery, or `ado-prd-to-wit` / `jira-prd-to-wit` for a full work-item hierarchy) — this skill
does not invoke them.
