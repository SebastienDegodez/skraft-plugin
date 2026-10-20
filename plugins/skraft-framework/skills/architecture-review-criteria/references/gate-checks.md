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
`**Supersedes:** ADR-MMM`. The superseded ADR's file is never edited: report an edit to it, never
ask for one.

- ✗ ADR-001 prescribes CQRS for eligibility; ADR-005 prescribes a single model for the same scope.
- ✓ ADR-001 covers eligibility, ADR-005 policy renewal: different scopes.

## G3 — Dependency rule

Assign each interface and type in the contracts to its layer. Domain and Application name no
Infrastructure or API type (`SqlConnection`, `DbContext`, a concrete repository, `HttpContext`);
no diagram arrow points outward. `CancellationToken` in a handler signature is not a finding.

- ✗ `CheckEligibilityHandler` (Application) instantiates `EligibilityDbContext`.

## G4 — Interfaces in an inner layer

Every `I*` interface in the contracts sits under Domain or Application; a repository sits in the
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

Every story ID in the stories file maps to at least one Command or Query in an event model or
contract; a pure-read story uses a Query.

- ✗ US-03 (renew eligibility) has no `RenewEligibility` command anywhere.

## G8 — No dangling command

Every Command has at least one domain event for its successful outcome. Queries are exempt.

- ✓ `CheckEligibility` → `EligibilityChecked` + `EligibilityDenied`.

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
`**Supersedes:**` line, and no event model, diagram or contract still cites the superseded ADR as
its current source of truth. A historical mention in prose is not a finding.

- ✗ `diagrams-US-03.md` still says "per ADR-003" for a relationship ADR-007 now governs.

## G14 — Rejected ADRs

A `Status: Rejected` ADR (a Decision reading "We will not adopt …") stands only when a story or
measurable force of this batch raised the question and its Alternatives section names the option
adopted instead. One rejecting a pattern nobody asked about, which the structural scan does not
detect either, is a finding.

## G15 — No baseline ADR

See the baseline list in SKILL.md (*Fitness judgements*).

## G16 — Comparable contracts share a convention

Group the interfaces and hooks of the contracts under review and of earlier accepted contracts by
consumer category (hooks wrapping a query, repositories of sibling aggregates, controllers with the
same CRUD shape). Within a group, compare the state/return shape, the error convention (throw vs
`Result` vs status flag) and the exposed field names. A difference with no ADR justifying it is a
finding naming both members.

- ✗ `useDriverEligibility` returns `{ data, error, loading }`, `useDriverHistory`
  `{ result, isError, pending }`.
- ✓ `useDriverHistory` returns `{ pages, error, loading }` and ADR-011 justifies pagination.

## C1 — Same names everywhere

Every context, aggregate, command, event and field is spelled the same in the context map,
diagrams, contracts and event model, and matches the research or story it comes from.

## F1 — Quality attributes answered

Every quality attribute the story or research states (performance, availability, security,
audit) is named by an ADR, a contract or a diagram element.
