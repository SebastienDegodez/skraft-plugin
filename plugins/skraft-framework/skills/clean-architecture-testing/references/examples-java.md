# Clean Architecture Testing — Java / Spring Boot (Maven)

Same roles and doubles as [examples-dotnet.md](examples-dotnet.md). This file covers what a Maven build changes: the module layout and the architecture guard.

## Module layout

One module per layer, and exactly two test modules per bounded context.

| Module | Internal dependency | Holds |
|---|---|---|
| `orders-domain` | none | Aggregates, value objects, extracted policies |
| `orders-application` | `orders-domain` | Use cases, output ports |
| `orders-infrastructure` | `orders-application` | Adapters: persistence, HTTP clients, messaging |
| `orders-api` | `orders-infrastructure` | `@SpringBootApplication`, controllers, wiring |
| `orders-unit-test` | `orders-application` | Application acceptance tests, rare Domain tests. No container, no Spring context |
| `orders-integration-test` | `orders-infrastructure` or `orders-api` | Adapter integration tests, API end-to-end tests, the architecture guard |

A dedicated `orders-architecture-test` module is the third test project the skill forbids. The guard goes into `orders-integration-test`, which must reach every layer it scans on its classpath.

## Architecture guard

```xml
<!-- orders-integration-test/pom.xml -->
<dependency>
  <groupId>com.tngtech.archunit</groupId>
  <artifactId>archunit-junit5</artifactId>
  <version>1.4.0</version>
  <scope>test</scope>
</dependency>
```

```java
package com.example.orders.integrationtest.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static org.assertj.core.api.Assertions.assertThat;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.w3c.dom.Element;

class LayerDependencyTest {

    private static final String ROOT_PACKAGE = "com.example.orders";

    // The JDK core, without I/O, network or persistence: those are technical details too.
    private static final String[] JDK_CORE = {"java.lang..", "java.util..", "java.time..", "java.math.."};

    private static final JavaClasses PRODUCTION = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages(ROOT_PACKAGE);

    // The module graph is the rule; types reached transitively may be imported.
    @ParameterizedTest
    @CsvSource({
        "orders-domain,",
        "orders-application, orders-domain",
        "orders-infrastructure, orders-application",
        "orders-api, orders-infrastructure",
    })
    void each_module_references_only_its_inner_neighbour(String module, String allowed) throws Exception {
        var pom = DocumentBuilderFactory.newInstance().newDocumentBuilder()
                .parse(repositoryRoot().resolve(module).resolve("pom.xml").toFile());
        var dependencies = pom.getElementsByTagName("dependency");
        var internal = IntStream.range(0, dependencies.getLength())
                .mapToObj(i -> (Element) dependencies.item(i))
                .filter(dependency -> ROOT_PACKAGE.equals(text(dependency, "groupId")))
                .map(dependency -> text(dependency, "artifactId"))
                .toList();

        assertThat(internal).containsExactlyInAnyOrderElementsOf(allowed == null ? List.of() : List.of(allowed));
    }

    // Allow-list, not deny-list: a deny-list only catches the frameworks someone thought to name.
    @Test
    void domain_depends_only_on_itself_and_the_jdk() {
        classes().that().resideInAPackage(ROOT_PACKAGE + ".domain..")
                .should().onlyDependOnClassesThat().resideInAnyPackage(allowed(ROOT_PACKAGE + ".domain.."))
                .check(PRODUCTION);
    }

    @Test
    void application_depends_only_on_inner_layers_and_the_jdk() {
        classes().that().resideInAPackage(ROOT_PACKAGE + ".application..")
                .should().onlyDependOnClassesThat()
                .resideInAnyPackage(allowed(ROOT_PACKAGE + ".application..", ROOT_PACKAGE + ".domain.."))
                .check(PRODUCTION);
    }

    private static String[] allowed(String... layers) {
        return Stream.concat(Arrays.stream(layers), Arrays.stream(JDK_CORE)).toArray(String[]::new);
    }

    private static String text(Element parent, String tag) {
        var nodes = parent.getElementsByTagName(tag);
        return nodes.getLength() == 0 ? null : nodes.item(0).getTextContent().trim();
    }

    private static Path repositoryRoot() {
        var directory = Path.of("").toAbsolutePath();
        while (!Files.exists(directory.resolve("orders-domain"))) directory = directory.getParent();
        return directory;
    }
}
```

Fails the build when:

- a module references anything but its inner neighbour (`orders-api` → `orders-application`);
- Domain or Application imports a framework (`org.springframework..`, `jakarta.persistence..`, `com.fasterxml.jackson..`);
- Domain or Application reaches JDK I/O, network or persistence (`java.net.http.HttpClient`, `java.nio.file.Files`, `java.sql..`).

Stays green when Infrastructure imports the Domain types an Application port exposes, and when Api imports Application use cases through its Infrastructure reference.

A guard limited to the project's own layers — `layeredArchitecture().consideringOnlyDependenciesInLayers()` — lets both leaks above through, framework and JDK alike. Use it only in addition to the allow-list.
