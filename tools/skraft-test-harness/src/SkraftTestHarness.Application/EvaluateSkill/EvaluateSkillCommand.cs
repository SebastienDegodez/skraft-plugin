using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Domain.Skills;

namespace SkraftTestHarness.Application.EvaluateSkill;

public sealed record EvaluateSkillCommand(SkillReference Skill, Scenarios Scenarios);
