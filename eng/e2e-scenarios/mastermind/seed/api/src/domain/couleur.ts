export const COULEURS = ['rouge', 'jaune', 'vert', 'bleu', 'orange', 'violet'] as const

export type Couleur = (typeof COULEURS)[number]

export const estUneCouleur = (valeur: string): valeur is Couleur =>
  (COULEURS as readonly string[]).includes(valeur)
