---
name: clean-architecture-java
description: Use when laying out or extending a Java service built with Maven, on Spring Boot or Quarkus — which module a class belongs in, which module may depend on which, and how an endpoint reaches a use case.
---

# Clean Architecture — Java (Spring Boot or Quarkus)

The layer rules are those of `architecture-patterns`. This skill maps them onto Maven, Spring Boot and Quarkus.

## One Maven module per layer

| Module | Holds | Only `<dependency>` on |
|---|---|---|
| `<context>-domain` | aggregates, value objects, domain events | nothing |
| `<context>-application` | use cases and the interfaces they call | `<context>-domain` |
| `<context>-infrastructure` | implementations of those interfaces (JPA/Panache, HTTP clients, files) | `<context>-application` |
| entry point: `<context>-api` (Spring Boot) or `<context>-app` (Quarkus) | the framework build plugin (`spring-boot-maven-plugin` / `quarkus-maven-plugin`), `@SpringBootApplication`, controllers or REST resources, wiring | `<context>-infrastructure` |

- Import types reached transitively; never add a `<dependency>` to reach them.
- Spring, Quarkus, Jakarta and JPA dependencies appear only in the infrastructure and entry-point poms.
- Tests follow the Maven convention of `clean-architecture-testing`: in each module's `src/test`, `*Test` (Surefire) for unit, `*IT` (Failsafe) for integration; a test that starts the application is an `*IT` in the entry-point module.

## Use cases

- A use case is a `final` class named after the action (`BorrowBook`). The controller or resource calls it directly: no interface in front of it, no `*Service` implementation.
- A command method returns `void`; the caller creates the new id and passes it in. A query returns a `*ViewModel` record built in Application, never a domain object.
- Application declares an interface only where it calls out (repository, gateway). A repository interface sits in Domain when it persists an aggregate, in Application otherwise.
- Who may *read* a resource is checked in the use case. Who may *change* it is an aggregate rule: the mutation method takes the caller's id and throws.
- Domain and Application classes carry no framework annotation. Wire every class in the entry-point module:
  - Spring Boot: `@Bean` methods of a `@Configuration` class.
  - Quarkus: `@Produces @Singleton` methods of a CDI class (`@Singleton`, never `@ApplicationScoped`: a `final` use case cannot be proxied).
- One transaction per use-case call, opened in the entry-point module: Spring Boot `TransactionTemplate` around the call or `@Transactional` on the controller method; Quarkus `@Transactional` on the resource method or `QuarkusTransaction.requiringNew().run(...)`. Never add an interface to a use case to decorate it.
- Inside each module, one package per feature (`…application.loan`, `…infrastructure.loan`), never a technical one (`repository`, `service`, `persistence`). A use case imports no other feature's package; what two features use moves to a `shared` package of that module.
- No `port`, `adapter`, `in` or `out` packages, and no "port" in type names or comments.

## Domain

- An aggregate is created through a static factory over a `private` constructor, and identified by a typed id record (`OrderId`), never a raw `String` or `UUID`.

## Guard

The module graph and the framework-free core are enforced by the pom and ArchUnit tests of the `clean-architecture-testing` skill (its `references/examples-java.md`).
