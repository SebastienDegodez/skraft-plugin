---
name: acceptance-review-business-alignment
description: "Use when reviewing DISTILL artefacts as the business-alignment-lens, or self-checking them before the review: gates G3, G4, B1. Checks that DISTILL scenarios speak the business vocabulary, carry no technical jargon and stay inside the story."
---

# Business-alignment lens — gates

Gates G3, G4, B1 of the DISTILL review, the gates the `business-alignment-lens` judges by. A finding's `gate` names one row below; its severities and fields are in `acceptance-review-criteria`. Read [the examples](references/examples.md) only for a gate whose criterion leaves you undecided.

| Gate | ID | Definition | Pass condition | Fail severity |
|---|---|---|---|---|
| Business vocabulary | G3 | All nouns, verbs, and adjectives in Given/When/Then steps appear in the domain vocabulary of the stories or the business lexicon. No class names, method names, HTTP verbs, or framework names. | Zero technical identifiers in `.feature` files. | HIGH |
| No technical jargon | G4 | Given/When/Then steps contain zero implementation details: no HTTP status codes, no ORM terms, no database language, no DI container references. | Zero implementation leaks. | BLOCKER |
| Story scope | B1 | Every scenario expresses an outcome the story asks for; none describes behaviour the story does not ask for. A value the story leaves open (a format, a limit) fixed by a scenario is behaviour the story does not ask for, unless a DESIGN document decides it. | Every scenario traces to a statement of the story or a DESIGN decision. | HIGH |

**G4 red flags (auto-fail):**
- `POST`, `GET`, `HTTP 200`, `HTTP 422`
- `Repository`, `Service`, `Handler`, `Controller`, `UseCase`
- `null`, `true`, `false` as business values (unless they are genuine domain terms)
- A technical input case in a step or an Examples cell (`NaN`, `Infinity`, `undefined`, a quoted number), even reworded ("an endless amount"): the finding asks to move it to the test plan as an inner-loop unit case, never to reword it
- SQL, JSON, XML, YAML in scenario text
- Class names (Pascal case identifiers)
