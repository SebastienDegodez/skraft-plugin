# CheckoutPricing throughput fixture

Suite-local .NET 10 Clean Architecture application for the Software Engineer throughput
benchmark. Built to be run at two refs through `eng/bench-agent-ab.sh`, never to gate a
merge on its own.

## Fixture states

### `fourteen-scenarios`

Approved DISTILL handoff for a fourteen-scenario `discount` story, close in size to a real
story:

- the `approved-red` solution of `software-engineer-delivery`, with the skeleton of every
  boundary the plan fixes (`CalculateLoyaltyDiscount`, `CalculateShippingFee`, `QuoteCheckout`);
- a `.feature` with fourteen scenarios over three use cases: loyalty discount and promo codes
  (S1–S10), shipping fee (S11–S13), checkout quote (S14);
- DISTILL's acceptance test of every scenario, each committed separately by the spec's setup;
  S2 to S14 carry `[Trait("Scenario", "S<n>")]` so each delivery brief's test command leaves
  out the scenarios not delivered yet, as the engine's one-oracle-per-pass order does;
- two scenarios already covered by earlier ones (S5 by S2 + S4, S8 by S4): green before their
  pass starts.

The hidden oracle grader of the suite compiles against the fixed boundary signatures and
checks every example of the `.feature`, whatever tests the agent wrote.

Prepare with `dotnet restore CheckoutPricing.slnx`. Baseline verification with
`dotnet test CheckoutPricing.slnx --no-restore` must exit `1` without compiler errors.
