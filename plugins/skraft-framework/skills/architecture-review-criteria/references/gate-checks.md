# Gate Checks

Each gate: what to check, one failing case (✗), one passing case (✓).

## G1 — Every structural commitment has an ADR

List every aggregate, bounded context, pattern (CQRS, Event Sourcing, Saga) and context-map
relationship in the diagrams, plus every commitment the structural scan detects in existing code.
Index the ADRs by topic. Each element needs an `Accepted` ADR or a `Proposed` ADR of this pass;
code carrying a pattern no ADR covers needs a back-fill ADR.

- ✗ The diagram shows Event Sourcing on `EligibilityAggregate`; no ADR evaluates it.
- ✓ ADR-003 accepts the ACL between the two contexts and says why Conformist was rejected.

## G2 — No contradicting ADRs

Two ADRs with the same scope and incompatible decisions, neither superseding the other, are a
finding. For every row of `docs/adr/supersessions.md`, the named new ADR carries
`**Supersedes:** ADR-MMM`.

- ✗ ADR-001 prescribes CQRS for eligibility; ADR-005 prescribes a single model for the same scope.
- ✓ ADR-001 covers eligibility, ADR-005 policy renewal: different scopes.

## G3 — Dependency rule

Assign each interface and type of the tactical design to its layer. Domain and Application name no
Infrastructure or API type (`SqlConnection`, `DbContext`, a concrete repository, `HttpContext`);
no diagram arrow points outward. `CancellationToken` in a handler signature is not a finding.

- ✗ `CheckEligibilityHandler` (Application) instantiates `EligibilityDbContext`.

## G4 — Interfaces in an inner layer

Every `I*` interface of the tactical design sits under Domain or Application; a repository sits in the
layer its aggregate's ADR records (Domain for an aggregate, Application for a CRUD entity or a
read model); every other interface sits in Application. An interface under Infrastructure, a
repository whose layer differs from its ADR, or an aggregate ADR recording no layer is a finding.

- ✗ `IEventPublisher` is "defined in the messaging Infrastructure project".
- ✓ `IEligibilityRepository` under Domain as its ADR records; `IEventPublisher` under Application.

## G5 — Invariants stay inside one aggregate

No aggregate holds another aggregate root (only its ID); no aggregate method takes another root
as a parameter; no handler or domain service loads two aggregates to enforce one invariant. An
invariant spanning two aggregates is a process rule: a saga reacting to both aggregates' events.

- ✗ `EligibilityAggregate.Check(policy: PolicyAggregate)`.
- ✓ `EligibilityAggregate` holds `DriverHistory` and a `PolicyId`.

## G6 — Context map complete and admissible

Every arrow between contexts in `context-map.md` carries one pattern (ACL, Conformist, Shared
Kernel, Partnership, Open Host Service, Published Language), and every dependency between contexts
in a diagram appears on the map. Cross-check each `Conformist` against the subdomain table and the
ADR text:

- A Core downstream is never Conformist (V-DDD-09).
- A published contract (ViewModel, event, DTO) consumed with a local copy or translation is OHS/PL
  upstream + ACL downstream, however trivial the translation (V-DDD-10).

- ✗ `EligibilityContext → PolicyContext` unlabelled; or a Core `SubscriptionContext` labelled
  Conformist while its ADR describes a local copy of `EligibilityViewModel`.

## G7 — Every story has a trigger

Every story ID in the stories file maps to at least one Command or Query in an event model; a
pure-read story uses a Query.

- ✗ US-03 (renew eligibility) has no `RenewEligibility` command anywhere.

## G8 — No dangling command

Every Command of a business bounded context has at least one domain event for its successful outcome. Queries are exempt. A front-end or UI component is exempt: it declares no Command of its own and only triggers a Command of a business context.

- ✓ `CheckEligibility` → `EligibilityChecked` + `EligibilityDenied`.
- ✓ The front component `eligibility-web` triggers `CheckEligibility` of the Eligibility context and declares no event: exempt.

## G9 — Nothing unjustified

Apply the questions in SKILL.md (*Fitness judgements*) to every aggregate, context, Event Sourcing
adoption, saga and ACL.

- ✗ `FraudDetectionContext` appears; no story in scope involves fraud.

## G10 — Reconciliation journal

In each consistency matrix, every reconciliation rewrite (a `LABEL_DRIFT` or
`CLASSIFICATION_DRIFT` aligned on its ADR) has a journal entry naming the rewritten artefact and
the cause. A change answering a review finding is not a reconciliation rewrite and needs no entry.

## G11 — Complexity-adding pattern justified

For each ADR adopting CQRS, Event Sourcing, a saga, eventual consistency, a service split or an
ACL: an admissible force in its Context (SKILL.md) and a "do without the pattern" row in
`Alternatives Rejected`.

- ✗ "We use CQRS to stay consistent with the rest of the codebase."
- ✗ Event Sourcing ADR whose only rejected alternative is state-based persistence.

## G12 — Planned supersessions realised

For each row of each `supersession-plan-{story}.md`: the new ADR exists and carries the
`**Supersedes:**` line, and no event model or diagram still cites the superseded ADR as
its current source of truth. A historical mention in prose is not a finding.

- ✗ `diagrams-US-03.md` still says "per ADR-003" for a relationship ADR-007 now governs.

## G14 — Rejected ADRs

A `Status: Rejected` ADR (a Decision reading "We will not adopt …") stands only when a story or
measurable force of this batch raised the question and its Alternatives section names the option
adopted instead. One rejecting a pattern nobody asked about, which the structural scan does not
detect either, is a finding.

## G15 — No baseline ADR

See the baseline list in SKILL.md (*Fitness judgements*).

## G17 — Eligible subject

An ADR decides a layer boundary, an aggregate boundary, a bounded context, a pattern adding complexity or a cross-cutting concern, and weighs a real trade-off. Any other subject is `ADR-INFLATION`; no alternative genuinely weighed is `NON-DECISION`.

- ✗ "ADR-012: Mount `PaymentBanner` in the checkout layout."
- ✓ "ADR-013: Route loaders fetch data before render, so pages hold no fetch logic."

## G18 — Decision level

One decision per ADR, at decision level. Independent decisions in one body, a full signature (a contract sketch of up to 5 lines is fine), enum values, a Value Object inventory, a route tree, or a traceability reference (a user story, PRD or requirement id), the story that triggered the ADR included, is each a finding at its line. A quality attribute stated with its measure as a force of the decision (`p95 ≤ 300 ms`, NFR id beside it or not) is no finding.

- ✗ "ADR-004's Decision lists `OrderStatus { Draft, Placed, Paid }` and `src/Domain/Order.cs`."
- ✗ "ADR-005's Context opens with `Raised by US-07, AC-2; see src/Domain/Order.cs:42`."
- ✓ "ADR-004: We will model order status as a state machine inside the Order aggregate." The values, the files and the story stay out of the ADR.

## G16 — Comparable contracts share a convention

Group the interfaces and hooks of the tactical design under review and of the accepted ones by
consumer category (hooks wrapping a query, repositories of sibling aggregates, controllers with the
same CRUD shape). Within a group, compare the state/return shape, the error convention (throw vs
`Result` vs status flag) and the exposed field names. A difference with no ADR justifying it is a
finding naming both members.

- ✗ `useDriverEligibility` returns `{ data, error, loading }`, `useDriverHistory`
  `{ result, isError, pending }`.
- ✓ `useDriverHistory` returns `{ pages, error, loading }` and ADR-011 justifies pagination.

## C1 — Same names everywhere

Every context, aggregate, command, event and field is spelled the same in the context map,
diagrams and event model, and matches the research or story it comes from. The fields are the
ones the event model's tables give each Command, Query, Domain Event and Read Model; a value
object they name is the one the tactical design defines.

- ✗ The event model gives `CheckEligibility` the field `DriverId: DriverId`; the tactical design
  names the value object `DriverIdentifier`.

## F1 — Quality attributes answered

Every quality attribute the story or research states (performance, availability, security,
audit) is named by an ADR, the event model or a diagram element.
