# DDD Strategic Design Reference

## Overview

DDD Strategic Design defines the large-scale structure of the system: where the boundaries are, how contexts relate, and which parts of the domain deserve the most investment. Strategic design decisions are architectural decisions — they belong in ADRs.

---

## Bounded Context

### Definition

A Bounded Context is an explicit boundary within which a specific domain model is defined and applicable. Within the boundary, every term in the Ubiquitous Language has exactly one meaning. Outside the boundary, the same word may mean something different.

**The boundary is linguistic, not technical.** Two modules using the same technology but applying the word "Customer" with different meanings belong in different bounded contexts.

### Identification Heuristics

| Signal | Implication |
|---|---|
| Same word means different things in two parts of the system | Hard boundary between those parts |
| Different teams own different parts | Strong candidate for separate contexts |
| Different rates of change (one part changes weekly, another yearly) | Consider separate contexts |
| A term would need to be "translated" when crossing a module boundary | There is a context boundary |
| A feature touches two completely different data stores | Likely two different contexts |

### Naming

Name bounded contexts after their Ubiquitous Language, not after technical layers. Use nouns: `EligibilityContext`, `PolicyContext`, `BillingContext` — not `EligibilityService` or `PolicyModule`.

---

## Context Mapping Patterns

### 1. Upstream/Downstream

**Relationship:** One context (upstream) affects another context (downstream). The upstream produces; the downstream consumes.

**When to use:** When one context's model or events feed into another context's process.

**Diagram notation:** Arrow from upstream to downstream with label `U/D`.

**Risk:** Downstream is tightly coupled to upstream changes. Changes in upstream break downstream unless the interface is stable.

---

### 2. Conformist

**Relationship:** Downstream adopts the upstream model without translation. The downstream team conforms to whatever the upstream team publishes.

**When to use:** When the upstream team has no interest in supporting the downstream team and translation is too costly to maintain.

**Risk:** The downstream context is polluted by upstream concepts. Domain language may not match the downstream's business language.

**Auto-insurance example:** A third-party risk-scoring API publishes a model. The eligibility team conforms to that model rather than building an ACL.

---

### 3. Anti-Corruption Layer (ACL)

**Relationship:** Downstream translates the upstream model into its own domain language via a translation layer.

**When to use:** When the upstream uses a different, legacy, or conflicting model that would pollute the downstream if adopted directly.

**When NOT to use:** When the translation cost is higher than the cost of conforming and there is no real model conflict.

**Diagram notation:** Arrow with label `ACL` pointing from upstream to downstream.

**Auto-insurance example:** A legacy policy administration system exposes a `Contract` object. The eligibility context translates it into `EligibilityRequest` via an ACL rather than importing `Contract` into the domain.

---

### 4. Shared Kernel

**Relationship:** Two contexts share a small subset of the domain model. Changes to the shared kernel require agreement from both teams.

**When to use:** When two closely related contexts share a concept that must be identical — e.g., a `Money` value object used by both `PolicyContext` and `BillingContext`.

**Risk:** High coordination overhead. Any change to the shared kernel may break both contexts. Avoid if teams are not well-aligned.

---

### 5. Partnership

**Relationship:** Two contexts co-evolve together. Both teams commit to aligning their interfaces.

**When to use:** Two teams that work in close collaboration on features that span both contexts simultaneously.

**Risk:** High coordination overhead. Works only when teams have strong communication and shared timelines.

---

### 6. Open Host Service (OHS)

**Relationship:** Upstream publishes a stable, versioned API or event schema that multiple downstreams can consume.

**When to use:** When many downstreams need to consume from the same upstream. The upstream invests in maintaining a clean, versioned public interface.

**Example:** `EligibilityContext` publishes an Open Host Service exposing `EligibilityChecked` events that `PolicyContext`, `NotificationContext`, and `AuditContext` all consume.

---

### 7. Published Language

**Relationship:** OHS uses a well-defined shared language (e.g., a JSON schema, Avro schema, CloudEvents format) that all consumers understand.

**When to use:** Combined with Open Host Service when the contract must be explicitly versioned and governed. Commonly used with event-driven integration.

**Auto-insurance example:** The `EligibilityChecked` event is published with a versioned JSON schema. All consuming contexts rely on this Published Language rather than on implementation details.

---

### Summary Table

| Pattern | Power balance | Translation? | Coordination |
|---|---|---|---|
| Upstream/Downstream | Upstream has power | No | Low |
| Conformist | Upstream has power | No | Very low |
| Anti-Corruption Layer | Downstream protects itself | Yes — downstream translates | Medium |
| Shared Kernel | Equal | No — shared model | High |
| Partnership | Equal | No — co-evolve | Very high |
| Open Host Service | Upstream serves all | No — upstream publishes clean API | Low (stable API) |
| Published Language | Upstream governs | No — shared schema | Medium (schema governance) |

---

## Subdomain Classification

| Subdomain type | Definition | Investment level | Auto-insurance examples |
|---|---|---|---|
| **Core** | The competitive differentiation of the business. Without it, the business has no advantage. | Invest deeply: DDD tactical, dedicated team, high test coverage | Eligibility engine, risk scoring, fraud detection |
| **Supporting** | Necessary for the business to operate, but not differentiating. A competitor likely has something similar. | Build with standard patterns, don't over-invest | Document management, notification service, audit logging |
| **Generic** | Commodity functionality. Available off-the-shelf or as a cloud service. | Buy, use a SaaS, or use an open-source solution | Authentication (Entra ID), payment processing (Stripe), email delivery (SendGrid) |

---

## Ubiquitous Language

### Rules

1. **Per-context:** The language is defined within a bounded context. The same word can mean different things in different contexts — this is expected and correct.
2. **No leakage:** Do not import terms from one context into another. If you need a concept from another context, translate it at the boundary.
3. **In code:** Class names, method names, and variable names in the domain model use the Ubiquitous Language directly. No translation inside a context.
4. **Glossary:** Each bounded context maintains a glossary of its Ubiquitous Language. Store it in `.skraft/sdlc/design/glossary-{context}.md`.

### Common Language Conflicts in Auto Insurance

| Term | EligibilityContext meaning | PolicyContext meaning |
|---|---|---|
| `Driver` | A person requesting eligibility assessment | An insured party named on a policy |
| `Risk` | The probability of a claim based on driver history | The insured asset (vehicle) and its exposure |
| `Coverage` | Not used — eligibility only checks entitlement | The specific protections a policy provides |

These differences justify separate bounded contexts. Importing `Driver` from `PolicyContext` into `EligibilityContext` would pollute the eligibility model with policy concerns.

---

## Context Map Notation

### Mermaid Examples

```
graph LR
    EligibilityContext -->|ACL| PolicyContext
    PolicyContext -->|Conformist| BillingContext
    EligibilityContext -->|Published Language - EligibilityChecked| NotificationContext
    PolicyContext -->|OHS| AuditContext
```

**Label conventions:**
- `ACL` — Anti-Corruption Layer (downstream translates)
- `Conformist` — downstream adopts upstream model
- `Shared Kernel: {concept}` — shared concept named
- `Partnership` — co-evolution relationship
- `OHS` — Open Host Service
- `Published Language: {schema}` — Published Language with schema name

---

## Common Strategic Mistakes

### Big Ball of Mud

**Symptom:** One bounded context for everything. All domain models in one project. Every aggregate knows about every other aggregate.

**Root cause:** Strategic design was skipped. The team modelled the database schema, not the domain.

**Fix:** Identify language boundaries. Where the same word means different things, draw a boundary. Start with the Core subdomain and define its language first.

---

### Anemic Domain

**Symptom:** Domain objects are pure data structures. All business logic lives in application services or managers.

**Root cause:** The team was unfamiliar with DDD tactical patterns, or the domain model was designed data-first.

**Fix:** Move invariant enforcement back into aggregates. Introduce value objects to replace primitive obsession. Replace getter/setter patterns with expressive domain methods.

---

### Over-Splitting

**Symptom:** 20 bounded contexts for what is effectively one domain. Every feature is its own context with its own service.

**Root cause:** Misapplication of "microservices = bounded contexts." They are not the same thing.

**Fix:** Merge contexts that share the same language and are owned by the same team. A bounded context can span multiple microservices. A microservice should not span multiple bounded contexts.
