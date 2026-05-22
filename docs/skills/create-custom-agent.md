# Skill `create-custom-agent`

**Statut :** ✅ Implémenté
**Source :** [`.agents/skills/create-custom-agent/SKILL.md`](../../.agents/skills/create-custom-agent/SKILL.md)

> ⚠️ Ce skill vit dans `.agents/skills/` (et **pas** dans
> `plugins/skills/`) : c'est un skill **méta**, utilisé pour *créer ou
> maintenir* des agents — pas un skill opérationnel chargé par les
> agents distribués du plugin.

---

## Quand l'utiliser

- Créer un nouveau custom agent VS Code from scratch.
- Scaffolder un fichier `.agent.md` avec un frontmatter correct.
- Mettre en place des **handoffs** d'agent à agent pour des workflows
  multi-étapes.
- Configurer des restrictions d'outils pour des rôles spécialisés
  (planner, reviewer, etc.).
- Créer un agent partagé en workspace ou en profil utilisateur.

## Quand ne pas l'utiliser

- Créer un fichier d'instructions → utiliser `.instructions.md`.
- Créer un prompt réutilisable → utiliser `.prompt.md`.
- Modifier un agent existant → éditer le fichier directement.

---

## Résumé

Ce skill produit des fichiers `.agent.md` conformes aux conventions
VS Code Custom Agents : frontmatter (`name`, `description`, `model`,
`tools`, `metadata`), persona, workflow, contraintes, et
éventuellement chaînage via handoffs.

Pour l'anatomie générale d'un fichier d'agent (et la distinction
`plugins/agents/` vs `.agents/`), voir
[`architecture.md` §3](../architecture.md#3-anatomie-dun-agent).

---

## Consommé par

- Mainteneur du plugin lors de l'**ajout d'un nouvel agent** ou de la
  maintenance des agents existants dans `plugins/agents/`.
