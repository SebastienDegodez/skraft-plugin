# language: fr
Feature: Fondation hexagonale Clean Architecture

  En tant que mainteneur du framework
  Je veux un socle hexagonal (domain pur → application → ports → adapters)
  Afin de construire des garde-fous testables boundary-to-boundary, sans dépendance

  @ac1 @happy-path
  Scenario: La suite node --test s'exécute sans dépendance runtime
    Given le projet est initialisé avec le squelette hexagonal
    When "node --test" est exécuté sur la suite de tests
    Then la suite s'exécute sans erreur
    And "package.json" ne déclare aucune dépendance runtime

  @ac2 @happy-path
  Scenario: Le domain est pur — aucun import du protocole hook
    Given les fichiers sous "domain/" existent
    When on inspecte tous les imports dans "domain/**/*.mjs"
    Then aucun import ne référence "adapters/drivers/hooks"
    And aucun import ne référence "ports/driver"

  @ac3 @happy-path
  Scenario: L'audit writer écrit en JSONL append-only
    Given un "jsonl-audit-writer" initialisé sur un fichier temporaire
    When on appelle "write" avec une première entrée
    And on appelle "write" avec une deuxième entrée
    Then le fichier contient exactement deux lignes JSON valides
    And le fichier n'a pas été tronqué entre les deux appels

  @ac3 @happy-path
  Scenario: Le null-audit-writer existe et respecte le contrat
    Given un "null-audit-writer" instancié
    When on appelle "write" avec une entrée quelconque
    Then aucune erreur n'est levée
    And aucun fichier n'est créé

  @ac4 @happy-path
  Scenario: payload.mjs normalise les trois formats de clés
    Given "payload.mjs" est importé
    When on normalise "{ toolName: 'bash' }" en camelCase
    Then le résultat contient la clé "toolName" avec la valeur "bash"

  @ac4 @edge-case
  Scenario: payload.mjs normalise les clés PascalCase
    Given "payload.mjs" est importé
    When on normalise "{ ToolName: 'bash' }" en PascalCase
    Then le résultat contient la clé "toolName" avec la valeur "bash"

  @ac4 @edge-case
  Scenario: payload.mjs normalise les clés snake_case
    Given "payload.mjs" est importé
    When on normalise "{ tool_name: 'bash' }" en snake_case
    Then le résultat contient la clé "toolName" avec la valeur "bash"
