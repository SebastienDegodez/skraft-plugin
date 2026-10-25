# Compose a brownfield PRD

Map the characterization artifacts into a 17-section PRD at `docs/prds/<kebab-case-name>.md` that
backlog tooling can consume directly. Works on artifacts from this run or from an earlier one.

**Boundary.** Read the persisted artifacts; never re-scan the repository. Never create issues.
Never edit code.

## The 17 sections, in this order

1. Executive Summary (goals with Goal IDs) · 2. Problem · 3. Users & Personas · 4. Scope &
Constraints · 5. Product Overview · 6. Functional Requirements · 7. Non-Functional Requirements ·
8. Data & Analytics · 9. Dependencies · 10. Risks & Mitigations · 11. Privacy & Security ·
12. Operational Considerations · 13. Rollout & Launch Plan · 14. Open Questions · 15. Changelog ·
16. References & Provenance · 17. Appendices.

Every header is present; a section with no evidence says `Not applicable: <reason>`.

## Inputs

- Path to characterization artifacts (`index.md` + siblings from `characterize-brownfield`).
- Product name (used for the kebab-case filename); not given: take the manifest's package name.
- Goals (optional — if the human states explicit modernization goals, fold them into Section 1;
  otherwise derive draft goals from the "Modernization Opportunities" signal in tech-debt.md).

## Mapping table (characterization -> PRD section)

| Characterization source | PRD section |
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

1. **Reload** all characterization artifacts from disk; never draft from memory of the scan.
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
6. **Draft Sections 8-13** (Data & Analytics only if integration.md shows events or analytics;
   Dependencies from integration.md; Risks from tech-debt.md 3x3 scores mapped to Severity;
   Privacy & Security from any auth or PII signal; Operational Considerations always, for a
   running system; Rollout only if modernization goals were stated). A section without evidence
   keeps its header with `Not applicable: <reason>`.
7. **Draft Section 14** (Open Questions) — every Low-confidence claim and every NONE-coverage
   Core feature becomes one row, `Owner: TBD`.
8. **Draft Sections 15-17** (Changelog: one entry, `v0.1 — initial brownfield extraction`;
   References & Provenance: cite every characterization file as a Ref; Appendices only if a
   glossary is warranted).
9. **Schema gate** before writing: all 17 section headers present in order, every FR/NFR has a
   unique ID, every FR links to a Goal ID, no YAML frontmatter, markers present. A failed check is
   fixed before the file is written; report the gate verdict (PASS or FAIL with the failed checks).

## Output contract (verify before writing)

- Path: `docs/prds/<kebab-case-product-name>.md`.
- File starts with `<!-- markdownlint-disable-file -->` then `<!-- markdown-table-prettify-ignore-start -->`.
- File ends with `<!-- markdown-table-prettify-ignore-end -->`.
- No YAML frontmatter.
- IDs: `FR-001`, `NFR-001`, Risk IDs in the Risks table.
- State file: `.copilot-tracking/prd-sessions/<kebab-case-product-name>.state.json` recording
  `currentPhase: "brownfield-extraction"`, `sourceCharacterization: <path>`, `qualityChecks`.

## Handoff

Report the PRD path, the schema gate verdict and the count of Open Questions. Never invoke backlog
tooling: the human decides when and which.
