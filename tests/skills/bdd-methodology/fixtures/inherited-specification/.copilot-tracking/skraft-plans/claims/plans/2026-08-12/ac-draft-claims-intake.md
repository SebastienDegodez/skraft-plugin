<!-- markdownlint-disable-file -->
# Acceptance criteria — claims-intake

Agreed with the claims manager on 2026-08-05. Every amount, delay and reason below is settled.
Nothing on this page is open for discussion.

## AC-1 — A claim reported inside the notification window is registered

Given a policyholder with an active motor policy
When the policyholder reports an incident that happened 5 days ago
Then the claim is registered
And the acknowledgement states that the assessment takes 30 days

## AC-2 — A claim reported outside the notification window is refused

Given a policyholder with an active motor policy
When the policyholder reports an incident that happened 45 days ago
Then the claim is refused with the reason "outside the notification window"

## AC-3 — An approved claim is settled for the agreed amount

Given an approved claim of 1200.00 EUR
When the settlement is released
Then the policyholder is paid 1200.00 EUR

## AC-4 — A first claim does not cost the no-claims discount

Given a policyholder with a clean driving record
When the policyholder reports a first incident costing 300.00 EUR
Then the no-claims discount is kept for the current year

## Ubiquitous language

- **Notification window** — the period during which an incident can still be reported.
- **Settlement** — the amount the insurer pays for an approved claim.
- **No-claims discount** — the reduction a policyholder keeps while no claim has been settled.
- **Clean driving record** — a policyholder standing with no settled claim.
