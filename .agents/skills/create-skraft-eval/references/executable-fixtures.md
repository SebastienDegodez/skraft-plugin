# Executable Fixture Checklist

Load this reference when at least one proposed evaluation scenario expects code, file, command, build, test, or diff changes.

## Stack selection

Choose stack in this order:

1. C#/.NET when target skill is language-neutral or relevant to .NET delivery.
2. Target-native stack when behavior specifically concerns another language or runtime.
3. JavaScript for an occasional dependency-free micro-fixture only when it preserves behavioral fidelity at substantially lower setup cost.

Do not choose JavaScript merely because it is faster to author. Record target-native or proportionality reason in portfolio before approval.

## Default C# fixture shape

- SDK-style projects and repository-supported target framework.
- One solution containing only layers required by scenario.
- Domain project with pure business rules and no outer-layer dependency.
- Application project with use-case boundaries and inward Domain dependency.
- Infrastructure project only when adapter is part of scenario.
- Test projects separated by responsibility: application/acceptance, domain when complexity warrants it, integration for real adapters, and architecture dependency tests when multiple layers exist.
- Centralized package/config files only when they reduce duplication without hiding behavior.

Clean Architecture remains mandatory for tiny fixtures. A smaller fixture may omit an unused layer, but may not merge domain policy into transport, persistence, test helpers, or orchestration.

## Authoring checklist

### Prompt neutrality

- [ ] Prompt states observable outcome and approved constraints, never implementation method.
- [ ] Project layout, class names, commands, hidden probes, and grader expectations remain in fixture/eval machinery, not prompt prose.
- [ ] Any implementation concept named by prompt is deliberate developer pressure in a forced-concept rigidity scenario.
- [ ] Forced-concept expected response is grounded in current architecture and approved behavior, not automatic refusal.

### Stack

- [ ] C#/.NET was considered first.
- [ ] Target framework and SDK are supported by current repository/toolchain evidence.
- [ ] JavaScript, if selected, has recorded target-native or proportionality reason.
- [ ] Fixture adds no unnecessary package or external service.

### Clean Architecture

- [ ] Domain contains business policy only and references no Application, Infrastructure, API, UI, filesystem, database, network, or test project.
- [ ] Application exposes use-case input boundary and depends inward on Domain.
- [ ] Infrastructure, when present, implements outward contracts and does not own business policy.
- [ ] Transport or UI, when present, delegates to Application instead of implementing rules.
- [ ] Production code never depends on test fixtures or test projects.
- [ ] Acceptance tests enter through application/use-case boundary and observe return value or outward port.
- [ ] Domain tests exist only for pure, complex, reusable rules or meaningful edge matrices.
- [ ] Integration tests own real adapter behavior and do not replace application acceptance coverage.
- [ ] Architecture dependency tests exist when fixture has enough layers for dependency drift to be plausible.

### Evidence integrity

- [ ] Baseline is intentionally RED, intentionally deceptive-GREEN, or explicitly non-activation.
- [ ] Complete solution/project build and tests are gradable with bounded `run-command` checks.
- [ ] Independent probe prevents hardcoding to visible example when relevant.
- [ ] Approved outer tests/contracts are protected from silent edits.
- [ ] Diff graders distinguish production from test-only or fixture-only changes.
- [ ] File graders assert durable outcomes without prescribing internal implementation.
- [ ] Fixture tests exercise sample application behavior only, never eval-spec structure.

## C# Vally shape

```yaml
- name: <observable implementation outcome>
  prompt: |
    <natural English request stating behavior and constraints, never implementation method>
  environment:
    files:
      - src: fixtures/<case>/Feature.slnx
        dest: Feature.slnx
      - src: fixtures/<case>/src/Feature.Domain/Feature.Domain.csproj
        dest: src/Feature.Domain/Feature.Domain.csproj
      - src: fixtures/<case>/src/Feature.Application/Feature.Application.csproj
        dest: src/Feature.Application/Feature.Application.csproj
      - src: fixtures/<case>/tests/Feature.UnitTests/Feature.UnitTests.csproj
        dest: tests/Feature.UnitTests/Feature.UnitTests.csproj
    commands:
      - 'dotnet restore Feature.slnx'
      - 'git init --quiet'
      - 'git add .'
      - 'git commit --quiet -m "test: fixture baseline"'
  graders:
    - type: run-command
      name: Observable behavior is GREEN
      config:
        command: dotnet
        args: [test, Feature.slnx, --no-restore]
        expected_exit_code: 0
        timeout: 1m
    - type: diff-contains
      name: Production behavior changed
      config:
        pattern: 'src/Feature\.(?:Domain|Application)/.*\.cs'
    - type: diff-not-contains
      name: Approved test stayed intact
      config:
        pattern: 'tests/Feature\.UnitTests/.*AcceptanceTests\.cs'
```

Adapt paths and commands to current repository evidence. Grade externally visible outcomes, not one preferred implementation.

## Static validation

- Load eval through installed Vally API.
- Verify every fixture source path and safe destination.
- Restore/build C# solution.
- Confirm intended RED or deceptive-GREEN baseline.
- Validate known-correct implementation against all deterministic graders when practical.
- Run architecture dependency tests.
- Inspect project references: Domain points nowhere outward; Application points inward plus declared ports.
- Confirm approved tests/contracts have tamper detection.
- Confirm every command has bounded timeout.
