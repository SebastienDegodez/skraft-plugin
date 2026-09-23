Plan — Retrait des instructions runtime et état portable
Objectif
Retirer les deux fichiers d’instructions distribués avec le plugin sans perdre leurs apports, tout en conservant la compatibilité Copilot CLI et Claude Code.

Répartir leurs responsabilités entre :

Orchestrateur : protocole essentiel intégré directement dans son corps.
JSON Schemas : définition formelle des structures de données.
CLI et services : validation, transitions, persistance et projection déterministes.
Adaptateurs clients : publication des tâches avec les outils du client actif.
Références occasionnelles : récupération après incident et documentation détaillée.
Aucun nouveau skill, aucun nouvel agent, aucun contrat principal externe à charger.

1. Décisions retenues
Périmètre limité aux deux règles runtime du plugin.
Refonte élargie : automatisation du protocole d’état et de la projection, pas simple changement de nom.
Protocole court intégré directement dans les deux descripteurs d’orchestrateur, synchronisés par le mécanisme existant.
JSON Schema formel pour l’état persistant et pour la projection retournée par la CLI.
État durable toujours autoritaire ; tâches natives jetables.
Si les tâches natives sont indisponibles : avertissement et fonctionnement avec la projection JSON, sans affaiblir les garde-fous.
Aucun utilisateur actuel : bascule directe, sans couche de compatibilité historique.
Aucun effacement automatique des données locales existantes.
Pas de nouvelle infrastructure MCP ni d’appel modèle supplémentaire pour gérer l’état.
2. Périmètre
Inclus
Reprise et initialisation du pipeline.
Structure, validation et mutations de l’état.
Projection des phases en tâches.
Ratification ADR, transitions et retries.
Cohérence entre CLI, état persistant et contrôles de dispatch.
Adaptation aux deux clients.
Retrait du chargement des anciennes règles.
Packaging, tests et documentation liés.
Exclus
Conversion des instructions contributeur du dépôt.
Suppression des overrides fournis par les projets clients.
Refonte des agents métier et des reviewers.
Modification des exigences de qualité.
Refonte fonctionnelle du reporting.
Support d’autres clients.
Migration automatique des anciens pipelines.
Exécution simultanée de deux orchestrateurs métier sur le même projet.
3. Architecture cible
Orchestrateur
Conserve les responsabilités de coordination :

Reprendre ou initialiser le projet via la CLI.
Consulter la projection retournée.
Présenter les tâches avec les capacités disponibles.
Dispatcher le spécialiste ou reviewer attendu.
Enregistrer le résultat via une commande dédiée.
Actualiser les tâches après confirmation de l’écriture.
Demander les décisions humaines nécessaires.
Ne doit plus :

Modifier directement l’état.
Recalculer statuts et dépendances en prose.
Déduire de mémoire la légalité d’une transition.
Charger systématiquement les mécanismes des deux clients.
CLI et services
Portent les opérations déterministes :

Validation des données.
Calcul de la projection.
Vérification des transitions.
Enregistrement des résultats et métadonnées.
Protection contre les opérations répétées.
Persistance atomique et sauvegardes.
Diagnostic et récupération.
Adaptateurs clients
Traduisent une projection commune vers les outils de tâches réellement exposés par Copilot CLI ou Claude Code.

Ils ne contiennent aucune seconde implémentation des règles de progression.

La CLI ne prétend pas appeler les outils internes du client : l’orchestrateur effectue cet appel avec les paramètres appropriés.

4. Livrables
4.1. Protocole intégré aux orchestrateurs
Consolider les consignes essentielles dans les deux descripteurs existants :

Reprise via la CLI.
Interdiction des éditions directes.
Écriture durable avant actualisation des tâches.
Respect des refus de transition.
Conservation des décisions humaines.
Reprise après perte de contexte.
Fonctionnement dégradé sans tâches natives.
Éliminer les répétitions au lieu de recopier intégralement les anciennes règles.

Maintenir le même corps fonctionnel sur les deux clients, avec leurs en-têtes propres.

4.2. Deux JSON Schemas formels
Schéma de l’état persistant
Décrire :

Identité du projet et version du format.
Phase courante et phases terminées.
Progression au sein d’une phase.
Verdicts et compteurs.
Références aux artefacts.
Provenance du handoff.
Ratification ADR.
Métadonnées autorisées.
Révision et reçu de mutation.
Schéma de la projection
Décrire :

Identité du projet et révision source.
Ordre des phases.
Tâches avec identifiants stables.
Statuts et dépendances.
Blocages.
Prochaine action.
Résumé de reprise.
Règles communes
Utiliser JSON Schema Draft 2020-12.
Embarquer les références nécessaires dans le plugin.
Exiger une version du format.
Refuser les champs de contrôle inconnus.
Prévoir un espace d’extension explicite si nécessaire.
Ne pas convertir silencieusement une donnée invalide en valeur vide.
Conserver la configuration comme autorité de l’ordre des phases.
Dériver documentation et inventaires depuis les schémas plutôt que recopier leurs contraintes.
Les JSON Schemas deviennent l’autorité structurelle. Les métadonnées de propriété des champs restent distinctes.

4.3. Validation exécutée
Brancher un validateur standard :

À la lecture et à la reprise.
Sur les entrées des commandes.
Sur l’état candidat avant sauvegarde.
Sur la projection avant émission.
Retourner des erreurs structurées : code, chemin du champ et message.

Une validation refusée ne doit pas modifier l’état existant.

Privilégier des validateurs générés et livrés avec le plugin pour éviter une installation de dépendances chez l’utilisateur. Vérifier leur fraîcheur et leurs dépendances réelles.

4.4. Projection déterministe
Calculer depuis l’état validé et la configuration :

Une tâche par phase.
Statuts cohérents.
Dépendances ordonnées.
Blocages humains.
Prochaine action autorisée.
Résumé des retries et reworks.
Contraintes :

Au maximum une phase en cours.
Aucune phase en cours à DONE.
Une ratification en attente maintient DESIGN ouverte.
Aucun succès inventé pour une phase sautée.
Identifiants de tâches isolés par projet.
Aucun scalaire métier caché dans le texte des tâches.
4.5. Commandes typées
Étendre la CLI existante pour couvrir :

Reprise validée.
Reconstruction de la projection.
Enregistrement des sorties d’un spécialiste.
Enregistrement du handoff.
Enregistrement de la ratification ADR.
Mise à jour des métadonnées autorisées.
Récupération contrôlée.
Pas de commande de modification arbitraire de tout l’état.

Les préférences de reporting restent gérées par leur interface dédiée.

4.6. Références occasionnelles
Conserver hors du corps principal uniquement :

Procédures détaillées de récupération.
Référence du format et des commandes.
Mécanismes propres à chaque client.
Ces ressources doivent être accessibles depuis le plugin installé, sans dépendre du checkout du dépôt SKRAFT.

5. Plan d’implémentation
Phase A — Vérifier le socle et figer les contrats
Revalider les constats sur la branche courante.
L’audit initial date du 19 septembre ; tenir compte des changements intervenus depuis.

Établir la matrice de conservation.
Pour chaque obligation des deux règles : destination, propriétaire et preuve attendue.

Définir les deux JSON Schemas.
Fixer champs, types, erreurs, version et politique d’extension.

Écrire les premiers tests d’acceptation en échec.
Entrer par la CLI ou les services applicatifs, pas uniquement par des fonctions isolées.

Sortie vérifiable : contrat explicite et tests démontrant les écarts à corriger.

Phase B — Aligner état, progression et projection
Dépend de la phase A.

Unifier l’ordre des phases.
Utiliser la configuration publiée pour initialisation, transitions et projection.

Aligner les nouveaux projets sur le pipeline engineering.
RESEARCH → DESIGN → DISTILL → DELIVER.

Brancher validation et projection.
Produire une réponse compacte utilisable par l’orchestrateur.

Raccorder les contrôles de dispatch au même état durable.
Dériver leur vue depuis le snapshot, sans fichier d’état parallèle.

Enregistrer explicitement la progression intra-phase.
Distinguer sortie du spécialiste, revue et rework ; ne pas réutiliser un verdict d’une itération précédente.

Sortie vérifiable : initialisation réelle → reprise → dispatch correct → résultat enregistré → projection actualisée.

Phase C — Sécuriser mutations et décisions
Dépend de la phase B.

Remplacer toutes les éditions directes par des commandes typées.

Centraliser les conditions de sortie de DESIGN.

Verdict approuvé.
Checkpoint de ratification résolu.
Aucune décision encore en attente.
Décision humaine conservée comme telle, jamais déduite d’une simple conformité JSON.
Appliquer ces conditions à toutes les voies d’avancement.

Transition normale.
Clôture de phase.
Dispatch de la phase suivante.
Prévenir les doubles mutations.

Identifiant d’opération.
Révision attendue.
Reçu enregistré avec l’état.
Refus d’un rejeu incompatible ou périmé.
Protéger les écritures concurrentes accidentelles.

Verrou court autour de lecture, validation et écriture.
Même protection pour tous les chemins modifiant le snapshot.
Aucun verrou pendant un appel modèle.
Diagnostic explicite des verrous abandonnés.
Conserver une récupération prudente.

Réutiliser diagnostic et sauvegardes.
Faire confirmer les opérations de reconstruction.
Ne jamais considérer la présence d’un dossier comme preuve d’approbation.
Sortie vérifiable : aucune voie d’avancement ne contourne les décisions requises ; aucune répétition immédiate ne double une mutation.

Phase D — Intégrer le protocole et les adaptateurs
Préparation possible après A ; raccordement final après C.

Intégrer le protocole court aux orchestrateurs.
Aucun contrat principal externe à charger.

Ajouter les deux adaptateurs de tâches.

Vérifier les outils et leurs schémas réels.
Publier la projection sans recalcul métier.
Préserver les tâches étrangères à SKRAFT.
Ne charger que l’adaptateur du client actif.
Implémenter le fonctionnement dégradé.

Échec de publication : avertissement.
État durable conservé.
Projection JSON utilisable.
Nouvelle publication sans répéter la mutation.
Corriger le raccordement du handoff produit.
Préserver provenance et artefacts sans réintroduire les phases produit dans le pipeline engineering ni transformer un handoff en approbation d’un gate.

Sortie vérifiable : même protocole métier sur les deux clients, avec ou sans tâches natives.

Phase E — Retirer l’ancien mécanisme
Dépend des phases C et D.

Supprimer les deux règles runtime.

Retirer leurs dépendances techniques.

Déclarations metadata.instructions.
Configuration agentInstructions.
Lecteur spécialisé.
Injection des anciennes règles dans SubagentStart.
Référence correspondante du manifeste Claude.
Préserver les mécanismes indépendants.

Chargement des skills.
Résolution des identités d’agents.
Contrôles de dispatch.
Protection des écritures.
Enregistrement des agents.
Synchroniser et régénérer les surfaces distribuées.
Livrer descripteurs, configuration et baseline cohérents dans le même changement.

Sortie vérifiable : aucun runtime ne dépend des deux fichiers retirés ; aucun ancien mécanisme de secours ne masque un défaut de raccordement.

Phase F — Documentation et qualification
Dépend de la phase E.

Actualiser documentation d’architecture et d’utilisation.

Mettre à jour les pages FR/EN concernées sans réécrire les ADR historiques.

Tester le plugin installé dans un dépôt consommateur vierge sur les deux clients.

Exécuter les vérifications de synchronisation, configuration, tests, couverture et mutation applicables.

Produire un compte rendu distinguant :

Vérifications exécutées.
Résultats observés.
Limites restantes.
Vérifications bloquées.
6. Matrice de conservation
Apport actuel	Destination
Protocole de reprise	Corps de l’orchestrateur + commande de reprise
État durable autoritaire	Services de persistance
Structure des données	JSON Schema d’état
Ordre des phases	Configuration publiée
Statuts et dépendances	Projection déterministe
Structure de la projection	JSON Schema de projection
Exceptions d’édition directe	Commandes typées
Ratification humaine	Orchestrateur + garde métier partagé
Retries et reworks	Machine d’état
Sauvegardes et récupération	Services existants + référence occasionnelle
Tâches Copilot et Claude	Adaptateurs clients
Conventions d’artefacts	Protocole et contexte de dispatch
Reporting	Interface dédiée conservée
7. Fichiers centraux
Orchestration
Orchestrateur Copilot.
Orchestrateur Claude.
Routage du point d’entrée.
État et contrôles
CLI d’état.
Service d’état.
Machine de transitions.
Validation et métadonnées actuelles.
Politique de dispatch.
Service de récupération.
Écriture atomique.
Chargement et packaging
Chargement des sous-agents.
Composition des hooks.
Génération de configuration.
Manifeste Claude.
Configuration distribuée.
Baseline de synchronisation.
Règles à retirer
Règle d’état.
Règle de synchronisation des tâches.
8. Vérification
Contrats JSON
Refus des champs obligatoires absents.
Refus des types, statuts et compteurs invalides.
Refus des fautes de frappe dans les champs contrôlés.
Validation des structures imbriquées.
Concordance avec la configuration des phases.
Aucun téléchargement requis pour valider.
Pipeline
Initialisation en RESEARCH.
RESEARCH reste sans reviewer.
Artefact manquant ne vaut pas succès.
Rework invalide la progression nécessaire.
Ratification ouverte bloque transition, clôture et dispatch suivant.
DONE reste terminal pour l’exécution engineering.
Persistance
Mutation refusée : état inchangé.
Mutation répétée : aucun double incrément.
Révision périmée : conflit explicite.
Échec d’écriture : aucun faux succès.
Sauvegarde saine restaurable.
Champs non concernés préservés.
Données locales incompatibles signalées, jamais supprimées automatiquement.
Clients
Installation hors du dépôt source.
Démarrage direct et invocation comme sous-agent.
Reprise du même projet sur l’autre client.
Projection métier équivalente.
Conservation des tâches non SKRAFT.
Mode JSON explicite si tâches natives absentes ou en échec.
Non-régression
Skills toujours chargés selon leur politique.
Identités et namespaces d’agents préservés.
Agents produit autonomes non bloqués par l’absence d’un pipeline engineering.
Reporting et consentement inchangés, y compris après DONE.
Aucune dépendance résiduelle aux deux règles supprimées.
9. Coût et complexité
Aucun nouvel agent.
Aucun nouveau skill de découverte.
Aucun appel modèle dédié à la projection.
Protocole principal chargé avec l’orchestrateur, sans lecture supplémentaire.
Références détaillées chargées seulement au besoin.
Réponses CLI compactes plutôt que snapshot complet à chaque mutation.
Schémas consommés par le code, pas systématiquement par le modèle.
Les gains de tokens devront être mesurés ; aucune économie chiffrée n’est présumée.

10. Conditions de livraison
Le chantier est terminé lorsque :

Les deux règles runtime sont supprimées.
Chaque obligation conservée possède une destination et une preuve.
Le protocole essentiel est intégré aux deux orchestrateurs.
Les schémas valident réellement état et projection.
Les décisions sensibles restent protégées par le code métier.
CLI et hooks utilisent le même état durable.
Copilot CLI et Claude Code sont qualifiés sur une installation réelle.
Le fonctionnement dégradé conserve tous les garde-fous.
Documentation et configuration distribuée reflètent l’implémentation.
Les vérifications non exécutées sont signalées, jamais présentées comme réussies.
Statut : plan de réalisation uniquement. Aucune implémentation effectuée dans cette conversation.