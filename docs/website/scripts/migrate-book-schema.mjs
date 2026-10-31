// Migrates book.yml from the Jekyll schema (a page names `fr:` and `en:` paths) to the
// Docusaurus schema (migration plan §1.3): one `doc` id per page, a `slug` per Diataxis
// part, an `intro_fr`/`intro_en` per section, sections for the how-to part, the retire
// globs and the header rewritten for docs/website. Text in, text out: comments and field
// order are kept. Running it on a migrated book changes nothing.
//
//   node docs/website/scripts/migrate-book-schema.mjs [--book docs/website/book.yml] [--check]
//
// --check exits 1 when the book is not migrated yet. Exit 2 when the book cannot be
// migrated (a how-to page no section plans, a section without an intro, FR/EN paths that differ).

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const HEADER = `# book.yml — CONTRAT DE STRUCTURE DU LIVRE SKRAFT (source de verite unique)
#
# Ce manifeste est lu par :
#   - docs/website/sidebars.mjs (via src/book/sidebars-from-book.mjs) : une sidebar
#     Docusaurus par partie Diataxis, une categorie par section, un doc par page ;
#   - docs/website/scripts/book-translations.mjs : les libelles FR de ces sidebars
#     (i18n/fr/docusaurus-plugin-content-docs/current.json, verifie par --check) ;
#   - scripts/scan-drift.mjs et scripts/lint-nav.mjs (via scripts/lib/book.mjs) :
#     detection deterministe des ecarts contrat <-> fichiers <-> sources ;
#   - les workflows gh-aw skraft-docs-sync et skraft-docs-gaps, qui reparent
#     les ecarts que scan-drift signale, par une pull request relue par un humain.
#
# Regles dures :
#   1. Diataxis strict : une page = un seul mode, celui de sa partie
#      (\`diataxis_mode\` : tutorial | how-to | reference | explanation). Une page
#      de reference decrit, elle n'explique pas le pourquoi : elle renvoie a la
#      page d'explication. Une page d'explication ne donne pas de marche a suivre.
#   2. Toute page listee ici existe en EN (docs/website/docs/<doc>.md) ET en FR
#      (docs/website/i18n/fr/docusaurus-plugin-content-docs/current/<doc>.md),
#      avec la meme structure de titres. \`.mdx\` seulement quand la page contient
#      du JSX (lint-nav : NAV-MDX-NO-JSX).
#   3. Une page porte un seul identifiant \`doc\` : son chemin anglais, sans
#      extension (ex. \`reference/glossary\`). Les fichiers FR et EN ont donc le meme
#      chemin relatif et le meme nom, par construction.
#   4. Une affirmation attribuee a un auteur cite sa source depuis
#      \`data/citations.yml\` (auteur, ouvrage, annee) ; scripts/check-citations.mjs
#      refuse une cle inconnue. Une page sans affirmation attribuee ne porte pas
#      de citation.
#   5. Tout fait sur le produit est verifie dans le code du plugin. Un chiffre non
#      sourcable depuis le code est formule qualitativement, jamais invente.
#   6. Toute page de la partie \`reference\` respecte \`reference_template\` ; les
#      autres parties respectent \`editorial_template\`.
#   7. Tout pattern / gate present dans \`sources\` est couvert par une page
#      \`derived\`. Agents, skills, workers et lentilles sont couverts exactement
#      une fois par le catalogue dashboard (section \`ownership: dashboard\`).
#
# Navigation : une partie Diataxis porte \`slug\` (la route de sa page d'index
# generee) ; une section porte \`intro_fr\`/\`intro_en\` (une phrase, la description
# de sa page d'index generee, route \`<slug de la partie>/<id>\`). Une section ne
# porte \`slug\` que si cette route est deja celle d'un doc (lint-nav :
# NAV-SLUG-COLLISION).
#
# \`type\` : derived   (regenerable depuis \`source\` par skraft-docs-sync)
#        | editorial (redigee et relue par un humain ; un workflow ne la cree
#                     que si elle manque, et ne la reecrit que pour un ecart
#                     signale par scan-drift : lien casse, recit d'orchestration
#                     perime, parite FR/EN)
#        | dashboard (rendue depuis les donnees du catalogue).
`

const DESIGN = `  # Design : une sidebar Docusaurus par partie Diataxis (les quatre portes de la
  # navbar), theme classique, mesure du contenu ~72 caracteres.
  design:
    layout: docusaurus-docs       # docs Docusaurus, sidebars derivees de \`parts\`
    sidebar_grouped_by: parts     # une sidebar par partie, une categorie par section
    theme: docusaurus-classic
    content_measure: 72ch
    artifacts:
      sidebars: "docs/website/sidebars.mjs"
      sidebars_generator: "docs/website/src/book/sidebars-from-book.mjs"
      translations: "docs/website/scripts/book-translations.mjs"
      stylesheet: "docs/website/src/css/custom.css"
`

const PARTS_COMMENT = `# parts — une partie par mode Diataxis (plus l'accueil), dans l'ordre de la
# navbar ; une partie peut se decouper en \`sections\` (menu a 3 niveaux).
# Chaque page porte label_fr/label_en (libelle de la sidebar : EN dans
# sidebars.mjs, FR dans current.json) ; type/source/purpose servent a
# scan-drift et aux workflows.
`

const section = (id, sidebar_position, title_fr, title_en, intro_fr, intro_en, pages) =>
  ({ id, sidebar_position, title_fr, title_en, intro_fr, intro_en, pages })

/** The plan applied to docs/website/book.yml (migration plan §1.3 and §2.1). */
export const DEFAULT_PLAN = Object.freeze({
  header: HEADER,
  design: DESIGN,
  partsComment: PARTS_COMMENT,
  partSlugs: { tutorials: '/tutorials', 'how-to': '/how-to', explanation: '/explanation', reference: '/reference' },
  docRenames: { 'dashboard/index': 'reference/catalogue' },
  // `<part slug>/<section id>` is already a doc's route for these three sections.
  sectionSlugs: {
    catalogue: '/reference/agentic-catalogue',
    gates: '/reference/quality-gates',
    patterns: '/reference/architecture-patterns',
  },
  sectionIntros: {
    orientation: { fr: 'Par où entrer : les trois parcours et la liste des pages d\'explication.', en: 'Where to enter: the three journeys and the list of explanation pages.' },
    'core-journey': { fr: 'Le fil rouge suivi du backlog jusqu\'à DELIVER, phase par phase.', en: 'The running example followed from the backlog to DELIVER, phase by phase.' },
    'brownfield-journey': { fr: 'Reprendre un code existant : l\'analyser, le mettre sous filet, le refactorer.', en: 'Taking over existing code: analyse it, put it under a net, refactor it.' },
    'system-understanding': { fr: 'Les mécanismes qui protègent le pipeline : équipe, moteur, journal, garde-fous, coûts.', en: 'The mechanisms that protect the pipeline: team, engine, journal, guardrails, costs.' },
    'craft-foundations': { fr: 'Les pratiques du craft que skraft rend opposables : craftsmanship, DDD, Clean Architecture.', en: 'The craft practices skraft makes enforceable: craftsmanship, DDD, Clean Architecture.' },
    'deep-dives': { fr: 'Un mécanisme à la fois, en détail : revue, TDD, walking skeleton, mocking, contrats, évaluation.', en: 'One mechanism at a time, in depth: review, TDD, walking skeleton, mocking, contracts, evaluation.' },
    'special-contexts': { fr: 'skraft vu par un décideur.', en: 'skraft seen by a decision maker.' },
    usage: { fr: 'Hôtes, commandes, workflow DOT, phases, configuration et journal d\'un run.', en: 'Hosts, commands, DOT workflow, phases, configuration and a run\'s journal.' },
    catalogue: { fr: 'Les agents, skills, workers et lentilles des plugins, et leurs chaînes.', en: 'The plugins\' agents, skills, workers and lenses, and their chains.' },
    gates: { fr: 'Les gates de commandes et les critères de revue de chaque lentille.', en: 'The command gates and each lens\'s review criteria.' },
    patterns: { fr: 'Les patterns d\'architecture et leur référence.', en: 'The architecture patterns and their reference.' },
    evaluation: { fr: 'Les fichiers, le lanceur et les verdicts de l\'évaluation des skills et des agents.', en: 'The files, runner and verdicts of skill and agent evaluation.' },
    bibliography: { fr: 'Les citations, le glossaire et l\'historique des versions.', en: 'Citations, glossary and version history.' },
  },
  partSections: {
    'how-to': [
      section('set-up', 1, 'Mettre en place', 'Set up',
        'Installer skraft, décrire les composants du dépôt, choisir les modèles, migrer depuis la v1.',
        'Install skraft, describe the repository\'s components, choose the models, migrate from v1.',
        ['install-on-a-host', 'configure-components', 'choose-models', 'migrate-from-v1']),
      section('run-a-story', 2, 'Mener une story', 'Run a story',
        'Lancer les gates, reprendre un run, répondre à ses questions, publier sa pull request.',
        'Run the gates, resume a run, answer its questions, publish its pull request.',
        ['run-gates', 'resume-a-run', 'answer-a-question', 'publish-pull-request']),
      section('review', 3, 'Revoir', 'Review',
        'Faire revoir une pull request et ajouter une lentille à une revue.',
        'Have a pull request reviewed and add a lens to a review.',
        ['review-a-pull-request', 'customise-review']),
      section('adapt-the-workflow', 4, 'Adapter le workflow', 'Adapt the workflow',
        'Copier le workflow dans le dépôt et y ajouter un agent du dépôt.',
        'Copy the workflow into the repository and add a repository agent to it.',
        ['eject-workflow', 'add-repository-agent']),
      section('backlog', 5, 'Backlog', 'Backlog',
        'Passer d\'un PRD à un backlog GitHub, puis raffiner une issue.',
        'Go from a PRD to a GitHub backlog, then refine an issue.',
        ['prd-to-backlog', 'refine-backlog']),
      section('existing-code', 6, 'Code existant', 'Existing code',
        'Poser un filet de caractérisation, puis refactorer sous ce filet.',
        'Put a characterization net in place, then refactor under it.',
        ['characterize-legacy', 'refactor-legacy']),
      section('contribute', 7, 'Contribuer', 'Contribute',
        'Évaluer un skill et proposer un pattern.',
        'Evaluate a skill and propose a pattern.',
        ['evaluate-a-skill', 'contributing']),
    ],
  },
})

const quote = (value) => JSON.stringify(value)
const indentOf = (line) => line.length - line.trimStart().length
const isComment = (line, indent) => line.startsWith(`${' '.repeat(indent)}#`)

/** Replaces everything above the first `meta:` line. */
const withHeader = (lines, header) => [...header.split('\n'), ...lines.slice(lines.indexOf('meta:'))]

/** Replaces the comment lines right above `anchor` and, with `toBlank`, the block below it up to a blank line. */
const replaceAround = (lines, anchor, replacement, { indent, toBlank }) => {
  const at = lines.indexOf(anchor)
  if (at < 0) return lines
  let start = at
  while (start > 0 && isComment(lines[start - 1], indent)) start -= 1
  let end = at + 1
  if (toBlank) while (end < lines.length && lines[end].trim() !== '') end += 1
  return [...lines.slice(0, start), ...replacement.replace(/\n$/, '').split('\n'), ...lines.slice(end)]
}

const rewriteLine = (line) => line
  .replace('required: [layout, lang, title, description]', 'required: [title, description]')
  .replace('"docs/site/fr/', '"docs/website/i18n/fr/docusaurus-plugin-content-docs/current/')
  .replace('"docs/site/en/', '"docs/website/docs/')

const PATH_LINE = (lang) => new RegExp(`^(\\s+)${lang}: "?${lang}/([^"]+?)"?$`)
const stripExtension = (path) => path.replace(/\.mdx?$/, '')

/** `fr: "fr/x.md"` then `en: "en/x.md"` become `doc: x`. */
const withDocIds = (lines, renames) => {
  const out = []
  for (let i = 0; i < lines.length; i += 1) {
    const fr = lines[i].match(PATH_LINE('fr'))
    const en = fr && lines[i + 1]?.match(PATH_LINE('en'))
    if (!fr || !en || en[1] !== fr[1]) { out.push(lines[i]); continue }
    if (stripExtension(fr[2]) !== stripExtension(en[2])) throw new Error(`FR and EN paths differ: fr/${fr[2]}, en/${en[2]}`)
    const id = stripExtension(en[2])
    out.push(`${fr[1]}doc: ${renames[id] ?? id}`)
    i += 1
  }
  return out
}

/** Splits the lines below `parts:` into one block per part (`  - id:`). */
const splitBlocks = (lines, marker) => {
  const blocks = []
  for (const line of lines) {
    if (line.startsWith(marker) || blocks.length === 0) blocks.push([])
    blocks[blocks.length - 1].push(line)
  }
  return blocks
}

const idOf = (block, marker) => block[0].startsWith(marker) ? block[0].slice(marker.length).trim() : null

/** Inserts `lines` after the last line of the block head (before `stop`) that matches `after`. */
const insertInHead = (block, stop, after, inserted) => {
  const end = block.findIndex((line) => stop.test(line))
  const head = end < 0 ? block.length : end
  let at = 0
  for (let i = 0; i < head; i += 1) if (after.test(block[i])) at = i
  return [...block.slice(0, at + 1), ...inserted, ...block.slice(at + 1)]
}

const headHas = (block, stop, field) => {
  const end = block.findIndex((line) => stop.test(line))
  return block.slice(0, end < 0 ? block.length : end).some((line) => field.test(line))
}

const PART_STOP = /^ {4}(pages|sections):/
const SECTION_STOP = /^ {8}pages:/

const withPartSlug = (block, slug) =>
  slug === undefined || headHas(block, PART_STOP, /^ {4}slug:/)
    ? block
    : insertInHead(block, PART_STOP, /^( {2}- id:| {4}diataxis_mode:)/, [`    slug: ${slug}`])

const sectionHeadLines = (id, plan) => {
  const intro = plan.sectionIntros[id]
  if (!intro) throw new Error(`section ${id} has no planned intro`)
  const slug = plan.sectionSlugs[id]
  return [`        intro_fr: ${quote(intro.fr)}`, `        intro_en: ${quote(intro.en)}`, ...(slug ? [`        slug: ${slug}`] : [])]
}

const withSectionIntro = (block, plan) => {
  const id = idOf(block, '      - id:')
  if (id === null || headHas(block, SECTION_STOP, /^ {8}intro_en:/)) return block
  return insertInHead(block, SECTION_STOP, /^ {8}title_en:/, sectionHeadLines(id, plan))
}

const withSectionIntros = (block, plan) => {
  const at = block.findIndex((line) => /^ {4}sections:/.test(line))
  if (at < 0) return block
  const sections = splitBlocks(block.slice(at + 1), '      - id:').map((section) => withSectionIntro(section, plan))
  return [...block.slice(0, at + 1), ...sections.flat()]
}

/** Splits the lines after `    pages:` into the page entries and the trailing lines (blanks, next part's comment). */
const pageEntries = (lines) => {
  const end = lines.findIndex((line) => line.trim() !== '' && indentOf(line) < 6)
  const body = end < 0 ? lines : lines.slice(0, end)
  let last = body.length
  while (last > 0 && body[last - 1].trim() === '') last -= 1
  const entries = new Map(splitBlocks(body.slice(0, last), '      - id:').map((entry) => [idOf(entry, '      - id:'), entry]))
  return { entries, trailing: [...body.slice(last), ...(end < 0 ? [] : lines.slice(end))] }
}

const checkPlanned = (partId, entries, planned) => {
  const plannedIds = planned.flatMap((s) => s.pages)
  const unplanned = [...entries.keys()].filter((id) => !plannedIds.includes(id))
  if (unplanned.length) throw new Error(`${partId}: no section plans the page(s) ${unplanned.join(', ')}`)
  const ghosts = plannedIds.filter((id) => !entries.has(id))
  if (ghosts.length) throw new Error(`${partId}: the book has no page ${ghosts.join(', ')}`)
}

const sectionLines = (planned, entries) => [
  `      - id: ${planned.id}`,
  `        title_fr: ${quote(planned.title_fr)}`,
  `        title_en: ${quote(planned.title_en)}`,
  `        intro_fr: ${quote(planned.intro_fr)}`,
  `        intro_en: ${quote(planned.intro_en)}`,
  `        sidebar_position: ${planned.sidebar_position}`,
  '        pages:',
  ...planned.pages.flatMap((id) => entries.get(id).map((line) => (line === '' ? line : `    ${line}`))),
]

/** A flat part the plan cuts into sections: its page entries move, unchanged, into them. */
const withSections = (block, partId, planned) => {
  const at = block.findIndex((line) => /^ {4}pages:/.test(line))
  if (planned === undefined || at < 0) return block
  const { entries, trailing } = pageEntries(block.slice(at + 1))
  checkPlanned(partId, entries, planned)
  return [...block.slice(0, at), '    sections:', ...planned.flatMap((s) => sectionLines(s, entries)), ...trailing]
}

const migratePart = (block, plan) => {
  const id = idOf(block, '  - id:')
  if (id === null) return block
  const sectioned = withSections(withPartSlug(block, plan.partSlugs[id]), id, plan.partSections[id])
  return withSectionIntros(sectioned, plan)
}

const withParts = (lines, plan) => {
  const at = lines.indexOf('parts:')
  const parts = splitBlocks(lines.slice(at + 1), '  - id:').map((block) => migratePart(block, plan))
  return [...lines.slice(0, at + 1), ...parts.flat()]
}

/** Migrates the text of a book.yml to the Docusaurus schema. */
export function migrateBook(text, plan = DEFAULT_PLAN) {
  let lines = text.replace(/\r\n/g, '\n').split('\n')
  lines = withHeader(lines, plan.header)
  lines = replaceAround(lines, '  design:', plan.design, { indent: 2, toBlank: true })
  lines = replaceAround(lines, 'parts:', `${plan.partsComment}parts:`, { indent: 0, toBlank: false })
  lines = withDocIds(lines.map(rewriteLine), plan.docRenames)
  return withParts(lines, plan).join('\n')
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const { values } = parseArgs({
    options: {
      book: { type: 'string', default: fileURLToPath(new URL('../book.yml', import.meta.url)) },
      check: { type: 'boolean', default: false },
    },
  })
  const path = resolve(values.book)
  const text = readFileSync(path, 'utf8')
  let migrated
  try {
    migrated = migrateBook(text)
  } catch (error) {
    console.error(`book.yml cannot be migrated: ${error.message}`)
    process.exit(2)
  }
  if (values.check) {
    if (migrated !== text) console.error(`${values.book} is not on the Docusaurus schema: run node docs/website/scripts/migrate-book-schema.mjs`)
    process.exit(migrated === text ? 0 : 1)
  }
  if (migrated !== text) writeFileSync(path, migrated)
  console.log(migrated === text ? `${values.book} is already migrated.` : `Migrated ${values.book}.`)
}
