# CheckoutPricing throughput fixture

Suite-local .NET 10 Clean Architecture application for the Software Engineer throughput
benchmark. Built to be run at two refs through `eng/bench-agent-ab.sh`, never to gate a
merge on its own.

## Fixture states

### `fourteen-scenarios`

Approved DISTILL handoff for a fourteen-scenario `discount` story, close in size to a real
story:

- the `approved-red` solution of `software-engineer-delivery`;
- a `.feature` with fourteen scenarios over three use cases: loyalty discount and promo codes
  (S1–S10), shipping fee (S11–S13), checkout quote (S14);
- two scenarios already covered by earlier ones (S5 by S2 + S4, S8 by S4): their acceptance
  test passes on its first run, the case that blocks a pipeline expecting every scenario red;
- an implementation plan that fixes every boundary signature and test-plan row;
- only S1's acceptance test, compiling and failing on the business assertion.

The boundary signatures are fixed so that the suite's hidden oracle grader can compile
against any delivery and check every example of the `.feature`, whatever tests the agent
wrote.

Prepare with `dotnet restore CheckoutPricing.slnx`. Baseline verification with
`dotnet test CheckoutPricing.slnx --no-restore` must exit `1` and report
`MemberReceivesApprovedDiscountOnCartSubtotal` without compiler errors.
