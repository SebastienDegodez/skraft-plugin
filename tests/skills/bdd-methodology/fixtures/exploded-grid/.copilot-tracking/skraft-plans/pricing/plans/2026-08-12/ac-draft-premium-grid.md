<!-- markdownlint-disable-file -->
# Acceptance criteria — premium-grid

Agreed with the claims manager on 2026-08-04. The yearly premium depends on the region the
driver lives in and on the category of the insured vehicle. Eleven combinations are agreed.

## AC-1 — The yearly premium follows the agreed grid

Given a driver living in one of the agreed regions
When the yearly premium is calculated for the insured vehicle category
Then the yearly premium is the agreed amount for that combination

| Region | Vehicle category | Yearly premium (EUR) |
|---|---|---|
| North | City car | 480 |
| North | Estate | 520 |
| North | Van | 610 |
| South | City car | 450 |
| South | Estate | 495 |
| South | Van | 575 |
| East | City car | 505 |
| East | Estate | 545 |
| East | Van | 640 |
| West | City car | 470 |
| West | Estate | 515 |

## Not decided

- West / Van: the business has not agreed a yearly premium. No amount exists for it.

## Ubiquitous language

- **Region** — the part of the country the driver lives in.
- **Vehicle category** — the family the insured vehicle belongs to.
- **Yearly premium** — the amount the driver pays for one year of cover.
