# CheckoutPricing throughput fixture

Suite-local .NET 10 Clean Architecture application for the Software Engineer throughput
benchmark. Built to be run at two refs through `eng/bench-agent-ab.sh`, never to gate a
merge on its own.

## Fixture states

### `five-scenarios`

Approved DISTILL handoff for a five-scenario `discount` story (about 25 inner cycles):

- the `approved-red` solution of `software-engineer-delivery`, unchanged;
- a `.feature` with five scenario outlines (S1 tier discount, S2 cap, S3 minimum
  subtotal, S4 promo code, S5 shipping fee);
- an implementation plan that fixes every scenario's boundary signature and test-plan row;
- only S1's acceptance test, compiling and failing on the business assertion.

The boundary signatures are fixed so that the suite's hidden oracle grader can compile
against any delivery and check every example of the `.feature`, whatever tests the agent
wrote.

Prepare with `dotnet restore CheckoutPricing.slnx`. Baseline verification with
`dotnet test CheckoutPricing.slnx --no-restore` must exit `1` and report
`MemberReceivesApprovedDiscountOnCartSubtotal` without compiler errors.
