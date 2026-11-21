# CheckoutPricing delivery fixture

Suite-local .NET 10 Clean Architecture application for the Software Engineer delivery evaluation.

## Fixture states

### `approved-red`

Approved DISTILL handoff for the `discount` story:

- four production projects under `src/`;
- exactly two xUnit projects under `tests/`;
- `NetArchTest.Rules` dependency checks;
- immutable outer acceptance test compiling and failing only on discount behavior;
- approved feature and implementation-plan artifacts.

Prepare with `dotnet restore CheckoutPricing.slnx`. Baseline verification with
`dotnet test CheckoutPricing.slnx --no-restore` must exit `1` and report
`MemberReceivesApprovedDiscountOnCartSubtotal` without compiler errors.

The eval stages explicit files from this state. This prevents ignored local build outputs
from becoming hidden fixture inputs.
### `rates-elsewhere`

The `approved-red` solution with a second component, `loyalty-rates` (root `rates`), the
class library whose `LoyaltyRateTable` gives each tier's rate and that
`CheckoutPricing.Application` references. The use case already applies the rate; the table has
no Gold rate, so the outer acceptance test fails on its Gold row only. Delivering the story
(one group, one dispatch) takes one green that changes the other component.
