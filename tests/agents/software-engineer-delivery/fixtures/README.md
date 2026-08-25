# CheckoutPricing delivery fixture

Suite-local .NET 10 Clean Architecture application for the Software Engineer delivery evaluation.

## Fixture states

### `approved-loyalty-discount-red`

Approved DISTILL handoff for the `loyalty-discount` story:

- four production projects under `src/`;
- exactly two xUnit projects under `tests/`;
- `NetArchTest.Rules` dependency checks;
- immutable outer acceptance test compiling and failing only on loyalty-discount behavior;
- approved feature and implementation-plan artifacts.

Prepare with `dotnet restore CheckoutPricing.slnx`. Baseline verification with
`dotnet test CheckoutPricing.slnx --no-restore` must exit `1` and report
`MemberReceivesApprovedDiscountOnCartSubtotal` without compiler errors.

The eval stages explicit files from this state. This prevents ignored local build outputs
from becoming hidden fixture inputs.