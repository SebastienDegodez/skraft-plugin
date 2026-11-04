import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_WORKFLOW, InMemoryCodeHost, ScriptedMachine } from '../support/in-memory-host.mjs'
import { edit } from '../workflow/support.mjs'
import { agent, finding, lenses, nominal, prWriter, PROSE_TEMPLATE_FR, refutes, REFS_42, says, scripted, SLUG, tddCycle } from '../support/pipeline-host.mjs'
import { opening, section } from '../support/description.mjs'
import { answerYaml } from '../support/answer-yaml.mjs'

const CONSENTED = { publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } }
const FRENCH_ISSUE = { title: 'Payer par carte', body: 'En tant que client, je veux payer par carte pour que la commande soit validée sans passer par la livraison.' }
const FRENCH = { story: { issue: 42, title: FRENCH_ISSUE.title } }
/** A forge whose issue 42 is the French story. */
const french = (more = {}) => new InMemoryCodeHost({ issues: { 42: FRENCH_ISSUE }, ...more })
const PRUNE = 'Pour trouver les tests qui ne tuent aucun mutant à eux seuls, le développeur lance `/skraft:prune-tests` sur un composant ; la commande propose, le développeur décide de chaque test.'
const CUT = '[coupé : la description dépasse ce qu\'une pull request accepte ; lisez-la en entier dans le dossier de suivi, pull-request.md]'
const writes = (host) => host.agentRunner.dispatches.filter(({ agent: id }) => id === 'pr-writer')
const bodyOf = (host) => host.tracking.read(SLUG, 'pull-request-body.md')

test('a French story\'s pull request is in French: the pr-writer fills a French template it is told to write in French, and every heading and fixed text the engine writes is French', async () => {
  const host = scripted({ config: CONSENTED, codeHost: french() }, (it) => nominal(it, REFS_42))
  const seen = []
  host.prWriters.push((it) => async (dispatch) => {
    seen.push(await it.tracking.read(SLUG, `details/2026-10-11/pull-request-prose-${SLUG}.md`))
    return prWriter({ summary: 'Payer par carte au passage en caisse', what: 'La caisse accepte la carte.', why: 'Les clients veulent payer par carte.', limitations: 'Les remboursements sont hors périmètre.' })(it)(dispatch)
  })

  assert.equal((await host.start(FRENCH)).status, 'done')

  assert.deepEqual(seen, [PROSE_TEMPLATE_FR])
  assert.ok(writes(host)[0].prompt.startsWith('## Skraft dispatch: pr-writer (PUBLISH)\n- Story: #42 — Payer par carte\n- Write in French, the story\'s language.\n'), writes(host)[0].prompt)
  assert.ok(host.codeHost.calls.includes('create main <- checkout (draft): Payer par carte au passage en caisse'), host.codeHost.calls.join('\n'))
  assert.equal(await bodyOf(host), [
    'Closes #42',
    '',
    '## Ce qui change',
    '',
    'La caisse accepte la carte.',
    '',
    '## Pourquoi',
    '',
    'Les clients veulent payer par carte.',
    '',
    '## Décisions appliquées',
    '',
    'Aucune consignée : aucun ADR n\'a été ratifié et aucune porte verrouillée n\'a été déverrouillée dans ce run.',
    '',
    '<details><summary>Matrice de cohérence</summary>',
    '',
    'Depuis `details/2026-10-11/consistency-matrix-checkout.md` dans le dossier de suivi :',
    '',
    '| ADR | Verdict |',
    '- docs-relied-on: docs/architecture/context-map.md',
    '- consistency-gate: PASS',
    '',
    '</details>',
    '',
    '<details><summary>Tests</summary>',
    '',
    'Depuis `details/2026-10-11/test-plan-checkout.md` dans le dossier de suivi :',
    '',
    'Findings for distill.',
    '',
    '</details>',
    '',
    '<details><summary>Preuves RED: 2 commits red</summary>',
    '',
    '| Commit | Sujet | Code de sortie du rejeu |',
    '| --- | --- | ---: |',
    '| `root-2` | test(checkout): acceptance of the card payment | 1 |',
    '| `root-3` | test(checkout): Checkout pays by card | 1 |',
    '',
    'Les extraits de sortie des rejeux ne sont pas encore consignés.',
    '',
    '</details>',
    '',
    '<details><summary>Portes de qualité: 3 réussies</summary>',
    '',
    '| Composant | Porte | Commande | Résultat | Durée | Preuve |',
    '| --- | --- | --- | --- | ---: | --- |',
    '| api | build | `dotnet build` | pass | 0 s | `gates/api/build-1.log` |',
    '| api | test | `dotnet test` | pass | 0 s | `gates/api/test-1.log` |',
    '| api | mutation | `dotnet stryker` | pass | 0 s | `gates/api/mutation-1.log` |',
    '',
    '</details>',
    '',
    '<details><summary>Revue</summary>',
    '',
    'Chaque lentille de la dernière passe de chaque revue est passée sans constat.',
    '',
    '</details>',
    '',
    '<details><summary>Captures d\'écran</summary>',
    '',
    'Aucune consignée : ce run n\'a pris aucune capture d\'écran (pas d\'étape visuals, ou pas de front end dans skraft-config.json).',
    '',
    '</details>',
    '',
    '## Hors périmètre et limites',
    '',
    'Les remboursements sont hors périmètre.',
    '',
    '<details><summary>Résumé du run</summary>',
    '',
    'en cours',
    '',
    '| Étape | Phase | Visites | Tentatives | Reprises | Durée | Coût | Résultat |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
    '| publish_consent | RESEARCH | 1 | 1 | 0 | 0 s | - | skipped |',
    '| visuals_consent | RESEARCH | 1 | 1 | 0 | 0 s | - | skipped |',
    '| research | RESEARCH | 1 | 1 | 0 | 0 s | - | done |',
    '| design | DESIGN | 1 | 1 | 0 | 0 s | - | done |',
    '| design_review | DESIGN | 1 | 1 | 0 | 0 s | - | approved |',
    '| adr | DESIGN | 1 | 1 | 0 | 0 s | - | skipped |',
    '| distill | DISTILL | 1 | 1 | 0 | 0 s | - | done |',
    '| distill_review | DISTILL | 1 | 1 | 0 | 0 s | - | approved |',
    '| deliver | DELIVER | 1 | 1 | 0 | 0 s | - | done |',
    '| gates | DELIVER | 1 | 1 | 0 | 0 s | - | pass |',
    '| deliver_review | DELIVER | 1 | 1 | 0 | 0 s | - | approved |',
    '| mutation | DELIVER | 1 | 1 | 0 | 0 s | - | pass |',
    '| visuals | DELIVER | 1 | 1 | 0 | 0 s | - | skipped |',
    '| pr_writer | PUBLISH | 1 | 1 | 0 | 0 s | - | done |',
    '| publish | PUBLISH | 1 | 1 | 0 | 0 s | - | en cours |',
    '| Total | | | 15 | 0 | 0 s | - | |',
    '',
    PRUNE,
    '',
    '</details>',
    '',
    '<details><summary>Mention de l\'IA</summary>',
    '',
    'Cette pull request a été préparée par skraft avec des agents IA sur les familles de modèles economy, implementer, planner, researcher, reviewer (l\'hôte n\'a nommé aucun modèle). Ce qui change, Pourquoi et Hors périmètre ont été rédigés par l\'agent pr-writer ; toutes les autres sections sont rendues par le moteur à partir du journal du run. Un humain la relit avant sa fusion.',
    '',
    '</details>',
    '',
  ].join('\n'))

  assert.equal((await host.publish()).ok, true)
  assert.ok(section(await bodyOf(host), 'Résumé du run').startsWith('terminé: PUBLISH closed\n'), section(await bodyOf(host), 'Résumé du run'))
})

const FR_HEADER = '| Statut | Sévérité | Lentille | Emplacement | Constat | Pourquoi |'
const FR_RULE = '| --- | --- | --- | --- | --- | --- |'

test('a French story\'s review, failed gate, decisions and costs are told in French', async () => {
  const reviewed = scripted({ config: CONSENTED, codeHost: french() }, (it) => nominal(it, REFS_42))
  reviewed.agentRunner.review = lenses({
    consistency: [says('consistency', 'fail', [finding('F1', 'medium', 'the map names no currency', { location: 'details/x.md:3' })])],
    fitness: [says('fitness', 'fail', [finding('F1', 'high', 'speculative cache', { location: 'details/x.md:9' })])],
    'test-integrity': [says('test-integrity', 'pass', [finding('F1', 'low', 'long name')])],
    'architecture-boundaries': [says('architecture-boundaries', 'pass', [finding('F1', 'low', 'long name too', { location: './src/Checkout.cs:12' })])],
    'cold-reader': [says('cold-reader', 'fail', [finding('F1', 'medium', 'pay names no currency', { location: 'src/Checkout.cs:3' })])],
    refuter: [
      refutes('refuted', 'details/x.md:3 names EUR'), refutes('refuted', 'nothing is cached'),
      answerYaml({ checks: [{ finding: 'test-integrity F1', verdict: 'refuted', reason: 'Checkout.cs:12 is short' }, { finding: 'architecture-boundaries F1', verdict: 'refuted', reason: 'Checkout.cs:12 is short' }] }),
      refutes('refuted', 'context-map.md:12 fixes pay(amount)'),
    ],
  })
  await reviewed.start(FRENCH)
  const body = await bodyOf(reviewed)
  assert.equal(opening(body, 'Revue'), '<details open><summary>Revue: 1 à trancher, 3 réfutés</summary>')
  assert.equal(section(body, 'Revue'), [
    '**design_review**',
    '',
    '<details><summary>2 réfutés</summary>',
    '',
    FR_HEADER, FR_RULE,
    '| Réfuté | medium | consistency F1 G1 | `details/x.md:3` | the map names no currency | details/x.md:3 names EUR |',
    '| Réfuté | high | fitness F1 G1 | `details/x.md:9` | speculative cache | nothing is cached |',
    '',
    '</details>',
    '',
    '**deliver_review**',
    '',
    FR_HEADER, FR_RULE,
    '| À trancher | medium | cold-reader F1 G1 | `src/Checkout.cs:3` | pay names no currency | une seule lentille, contre celles qui sont passées ; réfuté : context-map.md:12 fixes pay(amount) |',
    '',
    '<details><summary>1 réfuté</summary>',
    '',
    FR_HEADER, FR_RULE,
    '| Réfuté | low | test-integrity F1 G1, architecture-boundaries F1 G1 | `src/Checkout.cs:12` | long name | Checkout.cs:12 is short |',
    '',
    '</details>',
  ].join('\n'))

  const onward = 'digraph p {\n  start [shape=Mdiamond]\n  deliver [shape=box, agent="software-engineer", phase="DELIVER"]\n  gates [shape=parallelogram, gate="build,test"]\n  publish [shape=parallelogram, publish="pull-request", phase="PUBLISH"]\n  exit [shape=Msquare]\n  start -> deliver -> gates\n  gates -> publish\n  gates -> publish [label="FAIL"]\n  publish -> exit\n}'
  const failed = scripted({ config: CONSENTED, codeHost: french(), workflow: onward, machine: new ScriptedMachine({ exits: { '. $ dotnet test': 1 } }) }, (it) => [agent({ answer: { ok: true, text: 'done', costUsd: 0.5, model: 'claude-sonnet-5' }, work: tddCycle(SLUG, 'Checkout', REFS_42) })(it)])
  await failed.start(FRENCH)
  const failing = await bodyOf(failed)
  assert.equal(opening(failing, 'Portes de qualité'), '<details open><summary>Portes de qualité: 1 en échec, 1 réussie</summary>')
  assert.equal(opening(failing, 'Preuves RED'), '<details><summary>Preuves RED: 1 commit red</summary>')
  assert.ok(section(failing, 'Résumé du run').endsWith('\n\nLes coûts sont approximatifs (~) : chacun est ce que la session Claude Code a coûté pendant que l\'agent tournait ; il inclut donc tout autre échange de cette session pendant ce temps.\n\n' + PRUNE), section(failing, 'Résumé du run'))
  assert.equal(section(failing, 'Mention de l\'IA'), 'Cette pull request a été préparée par skraft avec des agents IA sur les familles de modèles implementer (modèles nommés par l\'hôte : claude-sonnet-5). Ce qui change, Pourquoi et Hors périmètre ont été rédigés par l\'agent pr-writer ; toutes les autres sections sont rendues par le moteur à partir du journal du run. Un humain la relit avant sa fusion.')

  const lastRed = scripted({ config: { ...CONSENTED, tdd: { replay: 'last-red' } }, codeHost: french() }, (it) => [...nominal(it, REFS_42).slice(0, 3), agent({ work: (h) => { tddCycle(SLUG, 'Checkout', REFS_42)(h); h.git.commit('test(checkout): Checkout refunds', ['tests/RefundTests.cs'], REFS_42); h.git.commit('feat(checkout): Checkout refunds', ['src/Refund.cs'], REFS_42) } })(it)])
  await lastRed.start(FRENCH)
  assert.ok(section(await bodyOf(lastRed), 'Preuves RED').includes('\n| `root-3` | test(checkout): Checkout pays by card | non rejoué |\n'), section(await bodyOf(lastRed), 'Preuves RED'))

  const adr = '---\nadr: 1\ntitle: Card payment\nstatus: Proposed\nsupersedes: null\nratified_by: null\n---\n\n# ADR-001 — Card payment\n\n**Status:** Proposed\n'
  const unlocked = edit(BUILT_IN_WORKFLOW, ['mutation [shape=parallelogram, gate="mutation", goal_gate=true, locked=true]', 'mutation [shape=parallelogram, gate="mutation", goal_gate=true, locked=true, unlock="no mutation tool for this stack yet"]'])
  const decided = scripted({ config: CONSENTED, codeHost: french(), workflow: unlocked, files: { 'docs/adr/adr-001-card-payment.md': adr }, answers: [{ answer: 'RATIFIED' }] }, (it) => [
    agent()(it), agent()(it), agent()(it), agent({ work: tddCycle(SLUG, 'Checkout', REFS_42) })(it),
  ])
  await decided.start(FRENCH)
  assert.equal(section(await bodyOf(decided), 'Décisions appliquées'), [
    '- ADR-001 Card payment (`docs/adr/adr-001-card-payment.md`), ratifié dans ce run',
    '- Porte verrouillée `mutation` sautée, déverrouillée : no mutation tool for this stack yet',
  ].join('\n'))
})

test('a French story whose run has no pr-writer, no red commit, no gate, no test plan nor consistency matrix says so in French', async () => {
  const onlyPublish = 'digraph p {\n  start [shape=Mdiamond]\n  publish [shape=parallelogram, publish="pull-request", phase="PUBLISH"]\n  exit [shape=Msquare]\n  start -> publish -> exit\n}'
  const host = scripted({ config: CONSENTED, codeHost: french(), workflow: onlyPublish }, () => [])

  assert.equal((await host.start(FRENCH)).status, 'done')

  const description = await host.tracking.read(SLUG, 'pull-request.md')
  assert.ok(description.startsWith('Payer par carte\n\nCloses #42\n\n## Ce qui change\n\nNon rédigé : le run n\'a aucune étape pr-writer qui ait rédigé ce qui change.\n\n## Pourquoi\n\nNon rédigé : le run n\'a aucune étape pr-writer qui ait rédigé le pourquoi.\n'), description)
  assert.equal(section(description, 'Hors périmètre et limites'), 'Non rédigé : le run n\'a aucune étape pr-writer qui ait rédigé ce qui est hors périmètre.')
  assert.deepEqual(['Matrice de cohérence', 'Tests', 'Preuves RED', 'Portes de qualité'].map((heading) => section(description, heading)), [
    'Aucune consignée : le dossier de suivi ne contient aucune matrice de cohérence de ce run (DESIGN l\'écrit).',
    'Aucun consigné : le dossier de suivi ne contient aucun plan de test de ce run (DISTILL l\'écrit).',
    'Aucune consignée : aucun commit red n\'a été accepté dans ce run.',
    'Aucune consignée : aucune porte n\'a tourné dans ce run.',
  ])
  assert.equal(opening(description, 'Preuves RED'), '<details><summary>Preuves RED: 0 commit red</summary>')
  assert.ok(section(description, 'Mention de l\'IA').startsWith('Cette pull request a été préparée par skraft avec des agents IA (l\'hôte n\'a nommé aucun modèle). Ce qui change'), description)
})

test('a French story\'s description past what its forge takes is cut with the French mark, a section first, then whole', async () => {
  const long = scripted({ config: CONSENTED, codeHost: french() }, (it) => nominal(it, REFS_42))
  long.prWriters.push(prWriter({ why: `${'Les clients veulent payer par carte.\n'.repeat(2000)}Fin.` }))
  await long.start(FRENCH)
  assert.ok(section(await bodyOf(long), 'Pourquoi').endsWith(`\n\n${CUT}`), section(await bodyOf(long), 'Pourquoi').slice(-200))

  const planned = scripted({ config: CONSENTED, codeHost: french() }, (it) => nominal(it, REFS_42))
  await planned.start(FRENCH)
  await planned.tracking.write(SLUG, `details/2026-10-11/test-plan-${SLUG}.md`, Array.from({ length: 2_000 }, (_, n) => `| AC${n + 1} | Payer par carte ${n + 1} |`).join('\n'))
  await planned.publish()
  const details = planned.codeHost.pullRequestComments.map((comment) => comment.body).find((comment) => comment.includes('<summary>Tests'))
  assert.match(details, new RegExp(`^<!-- skraft:run-details slug=${SLUG} part=\\d -->\n# skraft · détails du run \\d/\\d\n`), details.slice(0, 120))
  assert.ok(section(details, 'Tests').endsWith(`\n\n${CUT}`), section(details, 'Tests').slice(-200))

  const tiny = scripted({ config: CONSENTED, codeHost: french({ bodyLimit: 400 }) }, (it) => nominal(it, REFS_42))
  await tiny.start(FRENCH)
  const body = await bodyOf(tiny)
  assert.ok(body.length <= 400 && body.endsWith(`\n\n${CUT}`), body)
})

test('a French story whose test plans plan more Domain tests than acceptance tests suggests pruning in French', async () => {
  const host = scripted({ config: CONSENTED, codeHost: french() }, (it) => nominal(it, REFS_42))
  await host.start(FRENCH)
  await host.tracking.write(SLUG, `details/2026-10-11/test-plan-${SLUG}.md`, [
    '| Scenario | Use Case Boundary | Layer | Double Type | Walking Skeleton | Extraction Reason | Priority |',
    '|---|---|---|---|---|---|---|',
    '| S1 | PayByCard | Domain | none | — | — | P1 |',
  ].join('\n'))
  await host.publish()

  const heading = 'Plus de tests Domain que de tests d\'acceptation'
  assert.equal(section(await bodyOf(host), heading), `Les plans de test comptent 1 ligne Domain contre 0 ligne d'acceptation (Application et E2E). ${PRUNE}`)
  await host.tracking.write(SLUG, `details/2026-10-11/test-plan-${SLUG}.md`, [
    '| Scenario | Use Case Boundary | Layer | Double Type | Walking Skeleton | Extraction Reason | Priority |',
    '|---|---|---|---|---|---|---|',
    '| S1 | PayByCard | Domain | none | — | — | P1 |',
    '| S2 | PayByCard | Domain | none | — | — | P1 |',
    '| S3 | PayByCard | Application | none | — | — | P1 |',
    '| S4 | PayByCard | E2E | none | — | — | P1 |',
    '| S5 | PayByCard | Domain | none | — | — | P1 |',
  ].join('\n'))
  await host.publish()
  assert.equal(section(await bodyOf(host), heading), `Les plans de test comptent 3 lignes Domain contre 2 lignes d'acceptation (Application et E2E). ${PRUNE}`)
})
