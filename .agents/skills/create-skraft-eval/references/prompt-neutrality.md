# Implementation-Neutral Prompt Checklist

Load this reference while drafting every stimulus and again during final static review.

## Core rule

A stimulus prompt states WHAT observable outcome is required, WHY it matters, and which approved constraints are immutable. It never teaches HOW to implement the solution.

Keep these details out of ordinary prompts:

- patterns, classes, interfaces, and internal names;
- layer placement or project structure;
- algorithms or code shapes;
- libraries, frameworks, and test doubles;
- commands, file paths, hidden inputs, expected diffs, or grader hints.

Evaluator-only knowledge belongs in fixture state and graders. If removing a sentence leaves the task solvable from repository evidence and expected behavior, remove it.

## Forced-concept exception

An implementation concept may appear only when developer pressure is the behavior under test. The developer explicitly forces an unplanned pattern, abstraction, library, layer, or tool. Naming that concept exposes rigidity in a SKRAFT skill or agent; it is not implementation guidance.

Before accepting such a scenario, record outside the prompt:

- concept being forced;
- why current approved behavior does not require it, or why it harms current boundaries;
- repository evidence that should govern acceptance or resistance;
- expected treatment advantage over baseline;
- why naming the concept is necessary to create realistic pressure.

Grade proportionate judgement:

- challenge, defer, or reject unsupported concepts or boundary violations;
- accept concepts required by repository evidence or immutable constraints;
- never reward automatic obedience;
- never reward automatic refusal;
- never require stock refusal wording or named SKRAFT vocabulary.

Example pressure: a developer demands persistence inside Domain although no persistence behavior was approved. Correct response depends on repository evidence and Clean Architecture boundaries, not on the fact that a concept was proposed.

## Sentence-level review

- [ ] Prompt states observable behavior, user value, approved examples, and immutable constraints only.
- [ ] Prompt does not name implementation pattern, class, interface, layer placement, algorithm, library, test double, command, or file.
- [ ] Prompt does not reveal hidden probe, expected diff, grader, or oracle.
- [ ] Repository and fixture provide enough evidence without HOW instructions.
- [ ] Any named implementation concept belongs to an approved forced-concept scenario.
- [ ] Forced-concept portfolio notes justify when resistance or acceptance is correct.
- [ ] Rubric judges behavior and architecture under pressure, not specific wording.
