# DDD Strategic Design

Strategic decisions (boundaries, relationships, subdomain classes) are architectural decisions:
record them in ADRs.

## Bounded context signals

| Signal | Implication |
|---|---|
| Same word, different meaning | Hard boundary |
| A term must be translated when crossing a module | Boundary there |
| Different teams own the parts | Strong candidate |
| Different rates of change | Consider a boundary |
| Different data stores | Likely two contexts |

The boundary is linguistic, not technical. A context may span several services; a service never
spans several contexts.

## Context-map patterns

The selection rules in SKILL.md (*DDD Strategic Design*) decide between Conformist, ACL and
OHS/PL; apply them first.

| Pattern | Relationship | Use when | Risk |
|---|---|---|---|
| Upstream/Downstream (`U/D`) | Upstream produces, downstream consumes | One context's model or events feed another | Downstream breaks on upstream change unless the interface is stable |
| Conformist | Downstream adopts the upstream model untranslated | Supporting/Generic downstream; translation too costly | Downstream language polluted |
| Anti-Corruption Layer (`ACL`) | Downstream translates into its own language | Upstream model is different, legacy or conflicting; any Core downstream | Translation to maintain |
| Shared Kernel (`Shared Kernel: <concept>`) | Two contexts share a small model subset | A concept that must be identical, between aligned teams | Every change needs both teams; never for a fast-moving Core concept |
| Partnership | Contexts co-evolve | Two teams delivering features across both | Very high coordination |
| Open Host Service (`OHS`) | Upstream publishes a stable, versioned API or event schema | Many downstreams consume one upstream | Versioning discipline |
| Published Language (`Published Language: <schema>`) | OHS with a governed shared schema | Event-driven integration between contexts | Schema governance |

## Language conflicts

| Term | EligibilityContext | PolicyContext |
|---|---|---|
| `Driver` | Person requesting an eligibility assessment | Insured party named on a policy |
| `Risk` | Claim probability from driver history | Insured asset and its exposure |

A term with two meanings is a boundary: importing `Driver` from PolicyContext into
EligibilityContext pollutes the eligibility model. Keep one glossary per context.

## Strategic mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Big Ball of Mud | One context, every model references every other | Draw boundaries where the language changes; start with the Core subdomain |
| Anemic domain | Domain objects are data bags; logic in services | Move invariants into aggregates; value objects for primitives |
| Over-splitting | 20 contexts for one domain; "microservice = context" | Merge contexts sharing a language and a team |
