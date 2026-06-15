namespace SkraftTestHarness.Infrastructure.Yaml;

/// <summary>
/// YAML DTO for a single assertion, modelled as a one-key dictionary
/// (e.g. <c>{ output_contains: "hi" }</c>). Infrastructure-only.
/// </summary>
internal sealed class AssertionDto : Dictionary<string, object>;
