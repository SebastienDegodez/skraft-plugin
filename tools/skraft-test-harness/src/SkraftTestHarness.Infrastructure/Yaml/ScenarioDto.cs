namespace SkraftTestHarness.Infrastructure.Yaml;

/// <summary>YAML DTO for a single scenario. Infrastructure-only.</summary>
internal sealed class ScenarioDto
{
    public string? Name { get; set; }
    public string? Prompt { get; set; }
    public List<string>? Tags { get; set; }
    public List<AssertionDto>? Assertions { get; set; }
}
