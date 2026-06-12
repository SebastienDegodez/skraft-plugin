namespace SkraftTestHarness.Infrastructure.Yaml;

/// <summary>YAML DTO for a single scenario. Infrastructure-only.</summary>
internal sealed class ScenarioDto
{
    public string? Name { get; set; }
    public string? Prompt { get; set; }
    public List<string>? Tags { get; set; }
    public WorkspaceDto? Workspace { get; set; }
    public List<AssertionDto>? Assertions { get; set; }
}

/// <summary>YAML DTO for a scenario's workspace declaration.</summary>
internal sealed class WorkspaceDto
{
    public string? Fixture { get; set; }
    public string? Checkpoint { get; set; }
}
