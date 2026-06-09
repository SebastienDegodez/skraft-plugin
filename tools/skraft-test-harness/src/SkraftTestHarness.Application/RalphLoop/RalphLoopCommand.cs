using SkraftTestHarness.Domain.Skills;

namespace SkraftTestHarness.Application.RalphLoop;

public sealed record RalphLoopCommand(
    SkillReference Skill,
    string TestsDir,
    int Runs,
    double? Threshold,
    string? ReportDir);
