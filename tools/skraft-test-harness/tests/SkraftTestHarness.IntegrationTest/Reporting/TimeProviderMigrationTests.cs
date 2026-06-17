using SkraftTestHarness.Infrastructure.Reporting;
using TUnit.Core;

namespace SkraftTestHarness.IntegrationTest.Reporting;

/// <summary>
/// RED: asserts that reporters accept <see cref="TimeProvider"/> as their clock dependency.
/// These tests FAIL while production code still uses IClock; they will pass after GREEN migration.
/// </summary>
public sealed class TimeProviderMigrationTests
{
    [Test]
    public async Task JsonReporter_ClockParameter_ShouldBeTimeProvider()
    {
        var ctor = typeof(JsonReporter).GetConstructors().First();
        var clockParam = ctor.GetParameters().FirstOrDefault(p => p.Name == "clock");
        await Assert.That(clockParam?.ParameterType).IsEqualTo(typeof(TimeProvider));
    }

    [Test]
    public async Task JUnitReporter_ClockParameter_ShouldBeTimeProvider()
    {
        var ctor = typeof(JUnitReporter).GetConstructors().First();
        var clockParam = ctor.GetParameters().FirstOrDefault(p => p.Name == "clock");
        await Assert.That(clockParam?.ParameterType).IsEqualTo(typeof(TimeProvider));
    }

    [Test]
    public async Task MarkdownReporter_ClockParameter_ShouldBeTimeProvider()
    {
        var ctor = typeof(MarkdownReporter).GetConstructors().First();
        var clockParam = ctor.GetParameters().FirstOrDefault(p => p.Name == "clock");
        await Assert.That(clockParam?.ParameterType).IsEqualTo(typeof(TimeProvider));
    }
}
