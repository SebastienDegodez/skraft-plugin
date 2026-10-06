---
name: clean-architecture-java
description: Use when laying out or extending a Java / Spring Boot service built with Maven — which module a class belongs in, which module may depend on which, and how an endpoint reaches a use case.
---

# Clean Architecture — Java / Spring Boot

The layer rules are those of `architecture-patterns`. This skill maps them onto Maven and Spring.

## One Maven module per layer

| Module | Holds | Only `<dependency>` on |
|---|---|---|
| `<context>-domain` | aggregates, value objects, domain events | nothing |
| `<context>-application` | use cases and the interfaces they call | `<context>-domain` |
| `<context>-infrastructure` | implementations of those interfaces (JPA, HTTP clients, files) | `<context>-application` |
| `<context>-api` | `@SpringBootApplication`, controllers, `@Configuration` wiring | `<context>-infrastructure` |

- Import types reached transitively; never add a `<dependency>` to reach them.
- Spring, Jakarta and JPA dependencies appear only in the `-infrastructure` and `-api` poms.
- Tests live in the two test modules `clean-architecture-testing` defines, never in a layer module.

## Use cases

- A use case is a `final` class named after the action (`BorrowBook`). The controller calls it directly: no interface in front of it, no `*Service` implementation.
- Application declares an interface only where it calls out (repository, gateway). A repository interface sits in Domain when it persists an aggregate, in Application otherwise.
- Wire every class with `@Bean` methods in `-api`; Domain and Application classes carry no Spring annotation.
- One transaction per use-case call, opened in `-api` (`TransactionTemplate` around the call, or `@Transactional` on the controller method). Never add an interface to a use case to decorate it.
- Name packages by feature inside each module (`…application.loan`). No `port`, `adapter`, `in` or `out` packages, and no "port" in type names or comments.

## Guard

The module graph and the Spring-free core are enforced by the pom and ArchUnit tests in `clean-architecture-testing` — [examples-java.md](../clean-architecture-testing/references/examples-java.md).
