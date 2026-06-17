---
layout: doc
lang: fr
title: "contract-fidelity-lens"
description: "Reviewer lens: audits provider-side contract tests — baseline WAF+HttpClient always present, Microcks layer matches opt-in, TestResult not suppressed, response contract asserted, no real downstream call."
persona: software-engineer
---

# contract-fidelity-lens

> Lentille de revue conditionnelle : audite les tests de contrat côté fournisseur selon cinq gates de fidélité — activée uniquement quand le diff touche un contrat, un appel `VerifyAsync`, ou un scaffold de test de contrat fournisseur.

## Quand elle s'active

Activée par `software-engineer-reviewer` uniquement quand le diff examiné touche :
- Un fichier de contrat OpenAPI / AsyncAPI
- Un appel `VerifyAsync` ou `TestEndpointAsync`
- Un scaffold de test de contrat fournisseur (ex. une classe avec `TestEndpointAsync`)

Ce n'est pas une des lentilles de revue CORE. Elle rejoint le panel adverse conditionnellement, en tant que lentille de capacité.

## Entrées

- Code et tests du diff examiné
- Flag opt-in Microcks résolu (depuis le prompt ou `skraft.instructions.md`)

## Sortie

```json
{
  "lens": "contract-fidelity",
  "verdict": "pass | fail",
  "defects": [{ "id": "D<N>", "gate": "K<N>", "severity": "blocker | high", "location": "fichier:ligne", "description": "...", "suggestion": "..." }]
}
```

## Gates

| Gate | Vérification | Sévérité |
|------|------------|----------|
| K1 | Baseline `WebApplicationFactory` + `HttpClient` présent | blocker |
| K2 | Couche Microcks correspond à l'opt-in | high |
| K3 | `TestResult.Success` non supprimé quand opt-in activé | blocker |
| K4 | Contrat de réponse asserté (code de statut, content type, forme `ProblemDetails`) | high |
| K5 | Pas de fuite d'appel aval réel | blocker |

**Note K3** : `VerifyAsync` est une assertion côté consommateur (mock appelé) et ne remplace PAS l'assertion du résultat `TestEndpointAsync`.

## Invariants

- **Lecture seule** — ne modifie jamais le code ou les tests
- **Chaque constat nomme la gate** (K1–K5) et une localisation concrète `fichier:ligne`
- **Pas de journal, pas de checklist** — indépendance A7 : rapporte les constats sans contexte préalable

## Pourquoi cette forme

Un test de contrat fournisseur qui n'affirme pas son résultat donne une fausse confiance. Chaque gate ferme un mode de défaillance courant silencieusement introduit sous pression temporelle.

> « Replace a component that the SUT depends on with a test-specific equivalent. »
> — Meszaros, G., *xUnit Test Patterns*, 2007.

## Voir aussi

- [contract-testing-worker]({{ "/fr/reference/workers/contract-testing-worker" | relative_url }}) — Worker qui produit le test de contrat que cette lentille audite
- [contract-testing-dotnet]({{ "/fr/reference/skills/contract-testing-dotnet" | relative_url }}) — Adaptateur .NET dont cette lentille vérifie la sortie
- [contract-testing]({{ "/fr/reference/skills/contract-testing" | relative_url }}) — Skill d'authoring générique de contrats
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent DELIVER dont le panel de revue active cette lentille
