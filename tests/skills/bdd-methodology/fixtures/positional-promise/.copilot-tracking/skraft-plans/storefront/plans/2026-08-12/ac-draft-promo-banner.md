<!-- markdownlint-disable-file -->
# Acceptance criteria — promo-banner

Agreed with the product owner on 2026-08-11. Both criteria are settled.

## AC-1 — The shopper can read the active promotion code

Given a promotion is running with the code SPRING25
When a shopper opens the storefront page
Then the banner states the promotion code SPRING25

## AC-2 — The banner spans the storefront page and sits above the products

Given a promotion is running with the code SPRING25
When a shopper opens the storefront page
Then the banner covers the full width of the storefront page
And the banner sits above the first row of products

## Ubiquitous language

- **Promotion banner** — the strip a shopper reads at the top of the storefront page.
- **Active promotion** — the promotion the business is currently running.
- **First row of products** — the first products a shopper reads under the banner.
