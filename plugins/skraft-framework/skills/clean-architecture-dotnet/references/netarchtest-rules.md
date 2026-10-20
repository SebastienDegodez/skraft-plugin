# NetArchTest rules

`templates/IntegrationTests/ArchitectureTests.cs` is the starting class; it lives in the
integration test project `clean-architecture-testing` defines. Load assemblies through the marker
interfaces (`typeof(IDomainMarker).Assembly`, `IApplicationMarker`, `IInfrastructureMarker`,
`IApiMarker`), never through a business type.

| Rule | Assertion |
|---|---|
| Domain is framework-free | Domain types have no dependency on the Application, Infrastructure or Api namespaces, nor on `Microsoft.EntityFrameworkCore`, `Microsoft.AspNetCore`, `System.Net.Http` |
| Application stays inside | No dependency on the Infrastructure or Api namespaces, nor on EF Core or ASP.NET Core |
| Infrastructure ignores Api | No dependency on the Api namespace |
| Domain classes are sealed | Non-abstract Domain classes are `sealed` |

Each assertion reports `result.FailingTypeNames` in its message. Add a rule when a constraint of
SKILL.md can be expressed as a type dependency; never weaken an existing one to make a change pass.
