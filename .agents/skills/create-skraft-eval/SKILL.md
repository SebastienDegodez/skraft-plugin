---
name: create-skraft-eval
description: 'Use when creating, refreshing, expanding, or reviewing a SKRAFT Vally skill evaluation at tests/skills/<skill>/eval.yaml in the skraft-plugin repository. Covers behavior coverage, baseline-versus-isolated-treatment discrimination, natural prompts, outcome rubrics, non-activation cases, fixtures, static Vally validation, and optional paired measurement. Do not use for dotnet/skills evals, generic skill-test scaffolding, agent suites, skill authoring, or debugging an already-running evaluation.'
---

# Create a SKRAFT Vally Skill Evaluation

Design one trustworthy SKRAFT skill evaluation. Ground it, approve it before writing, validate it statically, then freeze it during optional measurement.

## When to use

Use for creating, refreshing, expanding, or reviewing `tests/skills/<skill>/eval.yaml`. Do not use for dotnet/skills, real-agent suites, target-skill authoring, live-run debugging, eval-spec tests, or optimization that rewrites the instrument during measurement.

## Non-negotiable rules

1. Read current evidence before proposing scenarios. Do not design from memory.
2. Never name the target skill in a stimulus prompt or copy distinctive wording from its body.
3. Write prompts and rubrics in English. Prompts sound like natural developer requests and describe WHAT must be achieved, never HOW to implement it. Rubrics judge observable outcomes, not methods, commands, labels, or skill vocabulary.
4. Include at least five total trials, calculated as `stimuli x runs`.
5. Include diverse behavior: normal positive behavior, adversarial misuse or anti-pattern, lifecycle safeguards, ownership or boundary overlap, and at least one meaningful non-activation near miss.
6. Before creating or changing any eval or fixture, present the portfolio and exact file plan in the user's language. Ask for explicit approval, then stop. No approval means no write.
7. After approval, change only the target eval and necessary approved fixtures. Never change the target skill as part of this workflow.
8. Never add tests that parse, snapshot, assert, or encode eval contents, rubrics, fixture ordering, or scenario ordering.
9. Static validation and live evaluation are separate gates. Static checks do not consume model quota. Live paired evaluation does.
10. After static validation, ask separately whether to launch the live paired run. Do not run it without explicit approval.
11. Freeze the eval and fixtures before live measurement. Do not rewrite the instrument from observed trial results during that run.
12. Use only `eng/run-vally-evals.sh` for live execution.
13. Do not make every scenario a `prompt` grader. When code, files, commands, or diffs can prove the outcome, use deterministic graders and executable fixtures. Keep prompt graders for judgement that workspace evidence cannot prove reliably.
14. Prefer C#/.NET for executable fixtures. JavaScript is acceptable occasionally when the target behavior is JavaScript-specific or the smaller fixture is materially more proportionate. Record the reason for every JavaScript exception.
15. Keep every code fixture aligned with Clean Architecture. Domain policy stays independent, application code orchestrates use cases, infrastructure implements outward ports, and test entry points match the boundary under evaluation.
16. Never teach implementation through a stimulus prompt. Do not prescribe a pattern, class, interface, layer placement, algorithm, library, framework, test double, command, file name, or code shape.
17. Implementation detail may appear only in an adversarial rigidity scenario where the developer explicitly forces an unplanned concept. Treat that detail as pressure to evaluate, not as the expected solution. Grade proportionate resistance based on approved behavior, architecture, and repository evidence.

## Inputs

Resolve only missing target, goal/focus, and optional run budget. Derive canonical paths:

- target skill: `plugins/skraft-framework/skills/<skill>/SKILL.md`
- target eval: `tests/skills/<skill>/eval.yaml`
- optional fixtures: `tests/skills/<skill>/fixtures/` or sibling files referenced by that eval

Verify names match. Stop if target skill is absent.

## Workflow

### 1. Protect current state

Inspect repository status before work. Record existing changes and treat them as read-only unless the user explicitly included them in this eval task. Never overwrite, reformat, revert, stage, or clean unrelated changes.

Read repository `AGENTS.md` first. Its Vally rules override examples and generic skill-test conventions.

### 2. Build the evidence set

Read, in this order:

1. target `SKILL.md`;
2. target references, examples, scripts, or assets only when they define behavior relevant to evaluation;
3. existing target eval and fixtures, if present;
4. repository evaluation rules and evaluation documentation;
5. two or three nearby sibling skills and evals selected for structural or ownership similarity;
6. the unified runner and static validation surface when command details matter.

If `graphify-out/graph.json` exists, query the graph first for the target skill's relationships, ownership boundaries, lifecycle links, and likely sibling collisions. Use graph evidence to focus file reads; do not treat the graph as fresher than source files.

Do not bulk-read every skill or copy a sibling eval mechanically. Siblings show repository format, not target behavior.

### 3. Extract behaviors and boundaries

Create a behavior-to-coverage matrix before drafting YAML:

| Behavior or teaching point | Evidence | Case class | Proof surface | Baseline failure hypothesis | Treatment advantage | Existing coverage | Priority |
|---|---|---|---|---|---|---|---:|
| observable outcome | source section or asset | positive, adversarial, lifecycle, boundary, near miss | prompt, command, diff, file, or mixed | likely no-skill result | expected outcome delta | none, weak, strong | 1-N |

Translate instructions into observable outcomes. Keep these distinctions:

- **Positive:** expected behavior on a realistic task.
- **Adversarial:** pressure to take a tempting shortcut or apply a known anti-pattern.
- **Lifecycle:** sequencing, approval, rollback, commit, validation, or stop conditions.
- **Boundary:** ownership overlap where a sibling skill or ordinary engineering workflow should own part or all of the request.
- **Non-activation near miss:** superficially similar request where this target should not activate or should hand off cleanly.
- **Forced-concept rigidity:** developer demands an unplanned implementation concept; evaluate whether the skill or agent challenges it rather than obeying mechanically.

For each behavior, decide how success can be observed before drafting a grader:

- **Build, tests, or runtime behavior:** stage a minimal executable fixture and use `run-command`.
- **Production-versus-test change boundaries:** initialize fixture git state and use `diff-contains`, `diff-not-contains`, or `diff-empty`.
- **Durable artifact properties:** use `file-exists`, `file-not-exists`, `file-contains`, `file-not-contains`, or regex file graders.
- **Reasoning, refusal, prioritization, clarification, or handoff:** use a `prompt` grader with outcome-focused rubrics.
- **Behavior plus judgement:** combine deterministic and prompt evidence in one stimulus when each proves a distinct requirement.

Prefer deterministic proof whenever several valid implementations can satisfy the same command or observable file contract. Do not force grader variety when one evidence type is the only honest proof.

For any executable case, load [references/executable-fixtures.md](references/executable-fixtures.md) before proposing it. Apply its C#-first stack selection and complete its Clean Architecture and evidence-integrity checklist.

A non-activation case must be meaningful. Changing only a noun, using an obviously unrelated language, or asking an unrelated question gives little activation signal.

### 4. Rank candidate scenarios

Rank candidates by expected discrimination between:

- no-skill baseline; and
- isolated target-skill treatment.

Use this order:

1. behavior the baseline is likely to mishandle but the target teaches clearly;
2. safeguards that prevent harmful or misleading progress;
3. ownership boundaries that prevent sibling-skill leakage;
4. realistic positive cases with several valid implementation approaches;
5. near misses that test activation precision without being trivial.

Reject or lower candidates that:

- test common model knowledge rather than target value;
- duplicate another scenario's outcome;
- require exact terminology, command names, section labels, or prose from the skill;
- are solved by copying prompt wording into a response;
- bundle several independently gradable outcomes into one vague scenario;
- depend on environment behavior no fixture or rubric can observe.

Load [references/common-pitfalls.md](references/common-pitfalls.md) while ranking candidates and apply every relevant correction.

### 5. Draft prompts, fixtures, and graders

For every candidate, draft a natural English developer prompt without naming the skill or telling the agent to load one. Preserve realistic ambiguity only when handling that ambiguity is itself the behavior under test.

Load [references/prompt-neutrality.md](references/prompt-neutrality.md) before drafting prompts. Apply its sentence-level HOW-leak scan. Its only exception is a deliberate `forced-concept` rigidity case where developer pressure, not implementation guidance, is under evaluation.

Draft independent rubric items that answer questions such as:

- Did the response reach the correct business or engineering outcome?
- Did it preserve an approved constraint or refuse an unapproved assumption?
- Did it avoid a concrete harmful result?
- Did it redirect out-of-scope work to the right owner?

When the request expects implementation or repository changes, create the smallest fixture that can expose the target behavior:

1. stage only files needed to understand and execute the task;
2. use no new dependency when a built-in runtime can express the example;
3. establish the intended starting state: genuinely RED for missing behavior, or deceptively GREEN when testing detection of fixture theater;
4. initialize git in setup when diff graders must distinguish production, tests, and fixtures;
5. protect approved tests or contracts with negative diff graders;
6. add an independent command probe when visible tests could be hardcoded;
7. bound every setup and grading command with a reasonable timeout.

Fixture tests are tests of the sample application. They are allowed. They must never load, parse, snapshot, or assert the eval spec, its rubric, tags, fixture ordering, or scenario ordering.

Avoid rubric items that require:

- a named technique or command;
- vocabulary copied from the target skill;
- a specific internal implementation when alternatives are valid;
- self-reported activation;
- several outcomes joined into one item.

For forced-concept cases, apply the evidence and grading rules in [references/prompt-neutrality.md](references/prompt-neutrality.md).

Use `tags.intent: non-activation` for a SKRAFT non-activation stimulus, following nearby repository evals. Do not import an incompatible schema from another repository.

### 6. Balance coverage and cost

Choose enough stimuli and `defaults.runs` to satisfy:

`total trials = number of stimuli x runs >= 5`

Prefer a small, high-signal portfolio over many redundant cases. Explain that a paired live run executes every trial twice: once with no skills available and once with exactly the target skill, plus judge work. More stimuli and runs increase model, judge, token, and wall-time cost.

For judgement-only scenarios, use a natural prompt, `type: prompt`, and independent outcome rubrics. Add fixtures only when repository state is needed; follow current nearby SKRAFT schema.

For an executable implementation scenario, use the C# Vally shape and readiness checklist in [references/executable-fixtures.md](references/executable-fixtures.md). Adapt paths to current evidence; do not weaken its boundary or tamper checks.

### 7. Hard checkpoint before writes

Before creating or modifying any eval or fixture, present this portfolio in the user's language:

1. target skill and eval paths;
2. evidence read and key uncovered behaviors;
3. behavior-to-coverage summary;
4. ranked scenarios, grouped by positive, adversarial, lifecycle, boundary, and non-activation;
5. for each scenario: prompt intent, expected outcome, baseline-versus-treatment hypothesis, activation expectation, proof surface, grader types, fixture need, and implementation-neutrality result;
6. for every forced-concept case: concept being forced, why it is unsupported or harmful, evidence that should govern resistance, and why naming it in the prompt is necessary;
7. completed fixture readiness checklist, including C# choice and Clean Architecture boundaries;
8. proposed runs and total trial count;
9. expected paired cost shape;
10. exact files to create or modify;
11. static checks planned after writing.

End with an explicit approval question. Then stop the turn. Do not create directories, eval YAML, or fixtures in the same turn as this proposal unless the user had already explicitly approved this exact portfolio and file list.

### 8. Write only the approved instrument

After explicit approval, reload the approved portfolio and current files. Create or update only:

- `tests/skills/<skill>/eval.yaml`; and
- fixture files explicitly included in the approved plan and required by that eval.

Preserve valid existing scenarios unless the approved plan replaces them. Keep scenario names outcome-focused. Keep prompts and rubrics English. Do not touch target skill content, runner code, repository tests, generated results, or unrelated working-tree changes.

Never create a unit, acceptance, snapshot, parser, or ordering test for the eval spec. Repository policy requires validating eval specs through Vally loading and live runs, not tests that mirror the instrument.

### 9. Perform static validation

Static validation must not call a model. At minimum:

1. load the eval through the installed Vally API, such as `loadEvalSpec`, to prove YAML/schema parseability;
2. verify the eval directory resolves to the shipped target skill;
3. verify each stimulus has a natural prompt and graders suited to its proof surface;
4. scan every prompt sentence for HOW leakage: implementation patterns, class/interface names, layer placement, algorithms, libraries, test doubles, commands, file names, and grader hints must be absent;
5. verify every prompt that names an implementation concept is an approved forced-concept case and that portfolio evidence defines when resistance is correct;
6. verify judgement-based stimuli have outcome-focused rubrics; do not require a prompt grader when deterministic evidence fully proves the outcome;
7. verify fixture source paths exist and destination paths are safe;
8. execute fixture baselines locally to confirm their intended RED, GREEN, or deceptive-GREEN state;
9. verify grading commands are bounded and pass against a known-correct implementation when practical;
10. verify protected tests/contracts have negative diff or equivalent tamper detection where relevant;
11. build the C# solution and run architecture dependency tests when a fixture contains multiple layers;
12. verify Domain has no outward references and Application depends only inward plus declared ports;
13. verify every JavaScript fixture records its exception rationale in the approved portfolio;
14. verify non-activation cases use the SKRAFT repository convention;
15. verify `stimuli x runs >= 5` using the effective planned run count;
16. inspect the diff for skill-name leakage, copied phrases, vocabulary rubrics, and unrelated files;
17. run applicable deterministic repository gates, including local CI when proportionate.

Do not use `eng/run-vally-evals.sh` as a static validator: it performs model-backed baseline and treatment runs.

Report static checks as static only. A parseable spec is not evidence that the skill improves outcomes.

### 10. Hard checkpoint before live evaluation

After writing and static validation, explicitly ask whether the user wants the live paired baseline-versus-treatment evaluation.

State target, stimuli, runs, total trials, two arms plus judge work, expected cost shape, controlled `RUNS`/`WORKERS`, and frozen-instrument guarantee.

Then stop. Never consume model quota without explicit confirmation.

If authentication is missing, explain that the runner requires a Copilot-enabled GitHub authentication through the repository-supported environment or `gh auth login`. Never ask the user to paste a token, password, or other secret into chat.

### 11. Run and interpret only after approval

Use only:

`eng/run-vally-evals.sh <skill>`

Set controlled `RUNS` and `WORKERS` through the runner's documented environment. Do not invoke Vally directly and do not edit the eval while the run is in progress.

After completion, report per-scenario win/tie/loss, aggregate delta/verdict, activation discipline, errors, token/turn/tool/time cost, and weak or unstable scenarios.

Do not change the frozen instrument during this measurement. Propose a separate next iteration, requiring a new portfolio approval, if evidence justifies revision.

## Validation checklist

- [ ] Target path is `tests/skills/<skill>/eval.yaml` and resolves to the matching shipped skill.
- [ ] Repository rules, target skill, relevant assets, existing eval, siblings, and available graph context were inspected.
- [ ] Behavior-to-coverage matrix includes positive, adversarial, lifecycle, boundary, and meaningful near-miss candidates.
- [ ] Candidate ranking states a baseline-versus-treatment hypothesis.
- [ ] Portfolio and exact file plan were approved before any eval or fixture write.
- [ ] C#/.NET was preferred for executable fixtures; every JavaScript exception is justified.
- [ ] Every code fixture passes the Clean Architecture checklist, with inward dependencies and business policy in Domain.
- [ ] Prompts are natural English and do not name the skill or copy its wording.
- [ ] Every prompt states WHAT outcome is required and contains no HOW-to-implement guidance.
- [ ] Implementation concepts appear only in deliberate forced-concept rigidity cases.
- [ ] Every forced-concept case documents why resistance or acceptance is correct from evidence, not from preference.
- [ ] Evaluator-only details remain in fixtures and graders, never in prompts.
- [ ] Rubrics judge independent outcomes, not techniques or vocabulary.
- [ ] Graders match proof surfaces; executable outcomes are not reduced to prose-only judgement.
- [ ] Code-changing scenarios use minimal fixtures and deterministic build, test, runtime, diff, or file evidence where applicable.
- [ ] Fixture tests validate sample behavior and never assert eval-spec contents.
- [ ] Protected tests or contracts cannot be silently weakened to satisfy the graders.
- [ ] At least five total trials are planned.
- [ ] No eval-spec unit, acceptance, snapshot, parser, or ordering test was added.
- [ ] Static Vally loading and deterministic repository gates passed or failures were reported accurately.
- [ ] Live execution was offered only after static validation and remained opt-in.
- [ ] Live execution, if approved, used only the unified repository runner with a frozen instrument.
- [ ] Unrelated working-tree changes remained untouched.

## Common pitfalls

Load [references/common-pitfalls.md](references/common-pitfalls.md) during final static review. Do not approve the instrument while any listed failure mode remains.
