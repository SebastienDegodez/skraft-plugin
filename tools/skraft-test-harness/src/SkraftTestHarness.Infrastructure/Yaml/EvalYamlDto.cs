namespace SkraftTestHarness.Infrastructure.Yaml;

/// <summary>Root YAML DTO for an <c>eval.yaml</c> file. Infrastructure-only.</summary>
internal sealed class EvalYamlDto
{
    public List<ScenarioDto>? Scenarios { get; set; }
}
