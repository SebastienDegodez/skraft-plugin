# Common Evaluation Pitfalls

Load this reference while ranking scenarios and again during final static review.

| Pitfall | Correction |
|---|---|
| Eval gaming or overfitting | Test outcomes skill enables, not headings, phrases, commands, or vocabulary. |
| Sibling-skill ownership leakage | Add boundary case and grade correct handoff or restraint. |
| Trivial non-activation | Use plausible near miss sharing trigger nouns but crossing real ownership boundary. |
| Rubric vocabulary leakage | Rewrite as observable result that multiple valid methods satisfy. |
| Prompt explains how to implement | Keep only desired behavior, business context, approved examples, and immutable constraints; move evaluator mechanics to fixtures and graders. |
| Prompt leaks architecture or oracle | Remove class names, layer placement, commands, hidden inputs, expected diffs, and grader hints. Let repository evidence drive design. |
| Forced concept treated as instruction | Use named implementation detail only in a deliberate rigidity scenario; grade whether evidence-based resistance protects behavior and boundaries. |
| Forced concept always rejected | Do not reward reflexive refusal. Accept concept when repository evidence or an immutable constraint makes it necessary. |
| Every scenario uses `type: prompt` | Classify proof surface; use commands, diffs, and file graders where workspace proves outcome. |
| JavaScript chosen by habit | Start with C#/.NET; use JavaScript only for target-native behavior or documented proportionality exception. |
| Tiny fixture collapses layers | Omit unused layers, but keep Domain policy independent and Application as use-case boundary. |
| Business rule in handler, endpoint, adapter, or helper | Move policy to Domain; keep Application orchestration and Infrastructure adaptation thin. |
| Tests instantiate internals across layers | Enter through boundary owned by test level and observe next boundary or return value. |
| Architecture only described in rubric | Add build and architecture dependency checks where layer drift is deterministically testable. |
| Green visible test can be hardcoded | Add independent input probe or broader immutable acceptance test. |
| Agent edits oracle | Initialize fixture git state and add negative diff checks for approved tests/contracts. |
| Fixture tests assert eval structure | Remove them; fixtures test sample application behavior only. |
| Over-specified static grader | Assert build/runtime/file outcomes, not one class name, algorithm, or internal structure. |
| Baseline already solves every case | Rank for discrimination and replace generic low-signal prompts — but keep one deliberate regression guard, since a slice the baseline passes is the only place skill-induced degradation can show. |
| Regression guard cut for low signal | Exempt it from discrimination ranking and record a tie, not a win, as its expected result. |
| End-to-end stimulus for a single decision | Ask the narrowest task that forces the decision; breadth multiplies agent turns across two arms without adding signal. |
| Trial budget set to the floor | Size for six or more discordant pairs; ties consume pairs, so a five-trial plan cannot reach `p <= 0.05`. |
| Breadth bought with runs | Prefer 3 stimuli x 5 runs to 5 stimuli x 3 runs at equal cost; only the first leaves readable per-scenario cells. |
| Per-scenario cell read as a verdict | Report it as descriptive; the sign test pools trials and no single scenario carries its own power. |
| Power bought after a noisy result | Diagnose the tie cause and re-approve a new design; retroactive runs are the worst-value spend in the protocol. |
| Full portfolio funded in one step | Stage it: harness validation, pilot signal check, then full arm, each separately approved. |
| Harness validated on a tidy stimulus | Validate on the broadest, most destructive one; a well-behaved trial hides tooling damage. |
| Broken toolchain scored as architecture | Add a build-infrastructure sentinel; a wrecked manifest records as an ordinary loss, not an error. |
| Grader fixed by re-running agents | Re-grade recorded trajectories with `vally oracle`; only prompt or fixture changes need fresh trials. |
| Copying sibling YAML blindly | Use siblings as format examples; derive behavior from target skill. |
| Static/live conflation | Label parse/lint/gates static; only paired runs measure value. |
| Quota use without consent | Stop at second hard checkpoint and state trial/cost shape. |
| Changing instrument during autoresearch | Freeze eval/fixtures for entire paired run; revise only in separately approved iteration. |
| Tests assert eval contents | Delete them; use Vally loading/lint and repository gates. |
| Secret collection through chat | Require supported local authentication; never request credentials in chat. |
