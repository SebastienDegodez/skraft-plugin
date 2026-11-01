// The dashboard's static text in French. index.html holds the English text; each translated node
// names its key with data-i18n (text), data-i18n-html (text with inline markup) or
// data-i18n-attr="<attribute>:<key>". The page is one static file copied into each locale build
// (/dashboard/ and /fr/dashboard/), so its language comes from its address.

export const pageText = {
  fr: {
    title: 'Catalogue agentique et qualité — SKRAFT',
    metaDescription: "Catalogue factuel des agents, skills, workers, lentilles, racines et chaînes d'orchestration SKRAFT, avec leurs preuves d'évaluation.",
    siteNav: 'Site',
    handbook: 'Manuel',
    otherLanguage: 'English',
    eyebrow: 'Dashboard qualité du plugin',
    headline: 'Des skills pour une livraison <em>disciplinée.</em>',
    lead: "Tout ce que livre le plugin SKRAFT — skills, agents, workers et lentilles de revue — avec son profil de contexte, sa couverture d'évaluation et les preuves issues de comparaisons contrôlées skill versus baseline.",
    summaryLabel: 'Résumé du plugin',
    replayTitle: 'Replay de session.',
    replayText: 'Comparer côte à côte les trajectoires enregistrées avec et sans skill.',
    replayOpen: 'Ouvrir le replay',
    viewsLabel: 'Vues du dashboard',
    tabCatalogue: 'Catalogue',
    tabQuality: 'Qualité',
    tabEfficiency: 'Efficacité',
    tabModels: 'Modèles',
    filtersLabel: 'Filtres du dashboard',
    searchLabel: 'Rechercher dans toutes les vues',
    searchPlaceholder: 'Skill, agent, modèle, description…',
    modelLabel: 'Modèle agent',
    allModels: 'Tous les modèles évalués',
    clearFilters: 'Effacer les filtres',
    filtersNote: "Ces filtres s'appliquent au catalogue, à la qualité, à l'efficacité et à la comparaison des modèles.",
    usageEyebrow: "Ordre d'usage",
    usageTitle: 'Préparation produit, puis ingénierie',
    usageText: "Les workflows produit autonomes et optionnels précèdent l'unique point d'entrée d'ingénierie. Brownfield et les autres racines restent indépendants.",
    catalogueEyebrow: 'Catalogue dérivé des sources',
    catalogueTitle: 'Agents, workers, lentilles et skills',
    loading: 'Chargement du catalogue…',
    qualityEyebrow: 'Comparaison contrôlée',
    qualityTitle: 'Qualité et activation',
    qualityGuideTitle: 'Comment lire la qualité',
    qualityGuide: 'Chaque modèle est comparé avec et sans le skill. Les modèles apparaissent ensemble uniquement quand le même juge les a évalués ; « score le plus élevé » vaut pour ce skill et ce juge, pas pour toutes les tâches.',
    baselineTerm: 'Baseline',
    baselineDef: 'Score sans le skill.',
    skilledTerm: 'Avec skill',
    skilledDef: 'Score du même modèle avec le skill disponible.',
    liftTerm: 'Gain',
    liftDef: "Score avec skill moins baseline. Positif signifie que le skill a aidé sur ce jeu d'essais.",
    activationTerm: "Taux d'activation",
    activationDef: 'Fréquence de chargement du skill quand il était attendu.',
    unexpectedTerm: 'Inattendues',
    unexpectedDef: 'Chargements sur des prompts où le skill devait rester inactif. Zéro est la cible.',
    verdictTerm: 'Verdict',
    verdictDef: 'Conclusion statistique sur des essais appariés, pas un succès ou un échec isolé.',
    efficiencyEyebrow: "Profil d'exécution",
    efficiencyTitle: 'Efficacité',
    efficiencyGuideTitle: "Comment lire l'efficacité",
    efficiencyGuide: "Comparez chaque modèle à sa propre baseline. Une consommation plus faible n'est utile que si la qualité reste acceptable ; l'efficacité seule ne désigne pas le meilleur modèle.",
    durationTerm: 'Durée',
    durationDef: 'Temps écoulé médian par essai.',
    tokensTerm: 'Tokens',
    tokensDef: "Volume médian d'entrée et de sortie du modèle par essai.",
    turnsTerm: 'Tours',
    turnsDef: "Nombre médian de cycles de raisonnement de l'agent.",
    toolCallsTerm: "Appels d'outils",
    toolCallsDef: "Nombre médian d'actions externes réalisées par l'agent.",
    deltaTerm: 'Écart',
    deltaDef: "Évolution par rapport à la baseline. Un pourcentage négatif signifie que l'essai avec skill a consommé moins.",
    modelsEyebrow: 'Un bras par modèle agent',
    modelsTitle: 'Comparaison des modèles',
    modelsGuideTitle: 'Comment comparer les modèles',
    modelsGuide: "Une ligne correspond à un modèle agent. Comparez uniquement les lignes d'un même tableau : elles utilisent le même skill et le même juge. « Score le plus élevé » est une preuve locale, jamais un classement universel des modèles.",
    agentModelTerm: 'Modèle agent',
    agentModelDef: 'Modèle qui a réalisé la tâche.',
    judgeTerm: 'Juge',
    judgeDef: 'Modèle qui a évalué les sorties selon la grille.',
    highestTerm: 'Score le plus élevé',
    highestDef: 'Meilleur score avec skill dans ce tableau ; examinez aussi le gain et l\'efficacité avant de décider.',
    footer: 'Généré depuis les contrats du dépôt et les évaluations Vally approuvées.',
  },
}

/** `fr` on /fr/dashboard/ (under any base URL), `en` everywhere else. @param {string} pathname */
export const pageLanguage = (pathname) => (/\/fr\/dashboard(\/|\/index\.html)?$/.test(pathname) ? 'fr' : 'en')

/** The same page in the other language, relative to this one. @param {'en' | 'fr'} lang */
const otherLanguageHref = (lang) => (lang === 'fr' ? '../../dashboard/' : '../fr/dashboard/')

const translateAttributes = (node, text) => {
  for (const pair of node.dataset.i18nAttr.split(';')) {
    const [attribute, key] = pair.split(':')
    if (text[key] !== undefined) node.setAttribute(attribute, text[key])
  }
}

/** Puts the page's static text in `lang`; English is the text index.html already holds. @param {Document} doc @param {'en' | 'fr'} lang */
export const applyPageText = (doc, lang) => {
  const link = doc.querySelector('#lang-link')
  if (link) link.setAttribute('href', otherLanguageHref(lang))
  const text = pageText[lang]
  if (!text) return
  doc.documentElement.lang = lang
  if (link) link.setAttribute('hreflang', 'en')
  if (link) link.setAttribute('lang', 'en')
  for (const node of doc.querySelectorAll('[data-i18n]')) if (text[node.dataset.i18n] !== undefined) node.textContent = text[node.dataset.i18n]
  for (const node of doc.querySelectorAll('[data-i18n-html]')) if (text[node.dataset.i18nHtml] !== undefined) node.innerHTML = text[node.dataset.i18nHtml]
  for (const node of doc.querySelectorAll('[data-i18n-attr]')) translateAttributes(node, text)
}
