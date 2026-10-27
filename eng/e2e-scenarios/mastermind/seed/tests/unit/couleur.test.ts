import { describe, expect, it } from 'vitest'
import { COULEURS, estUneCouleur } from '../../src/domain/couleur.js'

describe('les couleurs du jeu', () => {
  it('compte six couleurs', () => {
    expect(COULEURS).toEqual(['rouge', 'jaune', 'vert', 'bleu', 'orange', 'violet'])
  })

  it('reconnaît une couleur du jeu', () => {
    expect(estUneCouleur('violet')).toBe(true)
  })

  it('refuse une couleur hors du jeu', () => {
    expect(estUneCouleur('noir')).toBe(false)
  })
})
