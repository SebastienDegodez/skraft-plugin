# Orders service

Single bounded context, repository root is component root. Java 21, Maven,
Spring Boot. Production modules: orders-domain, orders-application,
orders-infrastructure, orders-api. Packages start with com.example.orders.
Two test modules already exist: orders-unit-test and orders-integration-test.
The former exercises use cases without starting Spring; the latter exercises
the composed service and guards module dependencies.

The team has chosen Cucumber-JVM with JUnit Platform for executable business
examples for place_order and cancel_order. Neither feature has been added yet.
The integration suite remains ordinary JUnit tests. The product team also keeps
some future ideas as Gherkin documents that will not be executed.

No BDD folders or selectors have been agreed yet. We need paths relative to
this repository, and enough wiring detail to avoid a build that runs zero
scenarios. Do not redesign the production modules or add a third test module.
