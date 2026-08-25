<!-- markdownlint-disable-file -->

# Refined stories — milestone 1

**Date:** 2026-08-12
**Author:** product

## Story 1 — Instant quote for a new driver

As a prospective driver, I want an instant quote so that I can compare cover
before I commit.

### Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | An applicant aged 18 or over receives a quote |
| AC-2 | An applicant under 18 is refused, and told that cover starts at 18 |
| AC-3 | A quote stays valid for 30 days from the day it is issued |

### Business examples

| Example | Applicant | Age | Expected outcome |
|---|---|---|---|
| E-1 | Tom | 24 | Quote issued |
| E-2 | Maya | 17 | Quote issued, with the young-driver loading applied |
| E-3 | Priya | 44 | Quote issued |

### Notes

The young-driver loading is a fixed percentage held by pricing; this story does
not change it.
