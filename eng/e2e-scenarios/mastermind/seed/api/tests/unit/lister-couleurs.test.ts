import { describe, expect, it } from 'vitest'
import { listerCouleurs } from '../../src/application/lister-couleurs.js'

describe('lister les couleurs du jeu', () => {
  it('donne les six couleurs dans l’ordre du jeu', () => {
    expect(listerCouleurs()).toEqual(['rouge', 'jaune', 'vert', 'bleu', 'orange', 'violet'])
  })
})
