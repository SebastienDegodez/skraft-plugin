<!-- markdownlint-disable-file -->
# ADR decision index (append-only digest)

| ADR | Title | Status | Chosen | Decision (1 line) | Ratified by | Date |
|---|---|---|---|---|---|---|
| 001 | Hexagonal layering for the quoting platform | Accepted | Ports and adapters | Rating and eligibility live in a domain layer reached only through ports | priya 2026-02-10 | 2026-02-10 |
| 002 | Result type for expected domain errors | Accepted | Result return value | Expected declines are returned as values; exceptions stay for faults | marc 2026-03-24 | 2026-03-24 |
| 003 | Single model for quote reads and writes | Accepted | One shared model | Quote screens read the same model the pricing path writes | priya 2026-05-12 | 2026-05-12 |
