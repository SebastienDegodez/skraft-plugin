<!-- markdownlint-disable-file -->
# Vérification d'hôte Copilot — index d'évidence

Ce que le pilote Copilot suppose de l'hôte, mesuré par `eng/host-probe/copilot-probe.mjs` (hôte SDK headless, aucun appel de modèle) — [ADR-002](../adr/adr-002-copilot-host-driver-contract.md), issue #251. Chaque passage de la sonde ajoute sa section en tête, avec les versions mesurées.

## Mesures

Aucune mesure enregistrée pour l'instant.

## Non vérifié

- Tout ce que liste la sonde, tant qu'aucune section ci-dessus ne le mesure.
- L'app Copilot (canvas, élicitation, réponse sans personne), une session CLI interactive, Windows.
- Le comportement des sous-agents lancés par `ctx.agent` : noms acceptés par l'option `model`, texte d'un refus de modèle (`rejectsModel`), effet de `maxConcurrentSubagents`, coût d'un run.
