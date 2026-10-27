export const COULEURS = ['rouge', 'jaune', 'vert', 'bleu', 'orange', 'violet'] as const

export type Couleur = (typeof COULEURS)[number]
