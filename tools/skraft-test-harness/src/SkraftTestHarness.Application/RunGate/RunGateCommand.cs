using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Domain.Skills;

namespace SkraftTestHarness.Application.RunGate;

/// <summary>Input of the <see cref="RunGateHandler"/>: the target under test and its gate scenarios.</summary>
public sealed record RunGateCommand(SkillReference Skill, Scenarios Scenarios);
