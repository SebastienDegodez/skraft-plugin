---
layout: default
lang: en
title: "Clean Architecture — Details"
persona: tech-lead
---

# Clean Architecture

Clean Architecture, popularised by Robert C. Martin (Uncle Bob), is at the heart of the SKRAFT approach during the DESIGN and DELIVER phases. It guarantees that the application's business core stays independent of frameworks, user interfaces, and databases.

## Goal

The primary goal is to reduce cognitive load and to make sure infrastructure and delivery logic are mere implementation details (architectural "plugins").

## The 4 Main Layers

SKRAFT names its layers **Domain → Application → Infrastructure → API**, from the business core out to the outside world. This is the vocabulary the `clean-architecture-testing` skill uses to decide what to test and at which level.

1. **Domain**
   The business core: entities, value objects, domain events, policies, and specifications. It encapsulates the fundamental business rules (for example, in our SKRAFT context, a `Story` or an `Agent`) and depends on **no** other layer.

2. **Application**
   Orchestrates use cases through command/query handlers (e.g. `PlaceOrderCommandHandler`). This layer drives the Domain and expresses its external needs as **output ports** (repository, dispatcher, external-service interfaces) without knowing their implementation.

3. **Infrastructure**
   The concrete adapters that implement the Application's ports: repositories, message brokers, external-service clients. This is where the real I/O lives (database, network).

4. **API**
   The external entry point: HTTP endpoints and application composition (the app host). It translates external requests into Application commands/queries.

> Two cross-cutting layers complete the picture: an optional **SharedKernel** (interfaces and base classes, no logic) and an **Architecture** layer — static tests that verify, as a CI gate, that the dependency rule is never violated.

## The Dependency Rule

> **Source code can only depend on what is further inside.**

Dependencies always point inward: `API → Application → Domain` and `Infrastructure → Application → Domain`. No inner layer knows an outer one — for example, an Application handler must never import an API endpoint or a concrete Infrastructure repository; it depends only on the port it declares.

## In the SKRAFT cycle

- During the **DESIGN** phase, the `solution-architect` defines the interfaces and boundaries of this architecture.
- The Outside-In TDD approach in the **DELIVER** phase forces the team to define the external behaviour first (acceptance tests) before implementing the inner layers, thereby guaranteeing strict adherence to Clean Architecture.

This paradigm, while requiring a heavier up-front investment, delivers unmatched maintainability and testability over the long term.
