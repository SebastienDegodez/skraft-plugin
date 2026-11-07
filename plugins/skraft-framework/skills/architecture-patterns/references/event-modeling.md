# Event Modeling

## Procedure

1. **Brainstorm events.** "What facts must the business record?" Past tense, capture everything
   first.
2. **Group by aggregate and context.** Events that must be atomic together belong to the same
   aggregate.
3. **Commands.** For each event: "What action triggered this fact?" One command may produce several
   events; two commands producing the same event are modelled separately. A command comes from a
   user, another system, a timer or a saga, and targets one aggregate.
4. **Read models.** For each command: "What did the user need to see before acting?" Place it
   before the command it informs.
5. **Slices.** One command + its events + the read model returning the result.

## Slice completeness

- A user can perform the action without another slice → complete.
- The result directly satisfies an acceptance criterion → complete.
- It needs another slice first → record the dependency.

Good size: one story, one command, one to three events, one read model.

## Gherkin mapping

| Event model | Gherkin |
|---|---|
| Prior events / state | `Given` |
| Command | `When` |
| Domain event outcome | `Then` |
| Read model content | `And` |

One scenario per success path per slice; further scenarios for rejection paths and boundaries.

## Example

| Step | Kind | Name | Fields |
|---|---|---|---|
| Trigger | Command | `CheckEligibility` | `DriverId: DriverId`, `RequestedOn: date` |
| State change | Domain Event | `EligibilityChecked` | `DriverId: DriverId`, `ValidUntil: date` |
| State change | Domain Event | `EligibilityDenied` | `DriverId: DriverId`, `RejectionReason: text` |
| Outcome | Read Model | `EligibilityResult` | `Eligible: yes/no`, `ValidUntil: date?`, `RejectionReason: text?` |

Observed: `EligibilityResult.Eligible`, `EligibilityResult.ValidUntil`, `EligibilityResult.RejectionReason`.

A field's type is in business terms: a value object of the tactical design, or a plain kind. No
signature, no type of the language, no validation rule: the scenarios hold the rules.

Several contexts in one timeline: draw one swimlane (`subgraph`) per context, with the upstream
event pointing to the downstream command.

## Mistakes

| Symptom | Fix |
|---|---|
| Events like `SaveToDatabase`, `CallExternalAPI` | Name the business fact |
| A command with no preceding view | Add the read model the user needed |
| 15 aggregates of 1–2 events for 5 stories | Merge aggregates whose events must stay consistent together |
| Every command has exactly one success event | Add the rejection event |
| `UserCreatedSuccessfully` raised from a service | Raise facts from aggregates; no "Successfully" |
| 30 slices for 3 stories | Model only what the current stories require |
