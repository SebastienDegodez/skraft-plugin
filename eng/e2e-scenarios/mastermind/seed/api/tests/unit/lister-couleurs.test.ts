import { describe, expect, it } from 'vitest'
import { listerCouleurs } from '../../src/application/lister-couleurs.js'

describe('listerCouleurs', () => {
  it('should give the six colours of the game in their order', () => {
    expect(listerCouleurs()).toEqual(['rouge', 'jaune', 'vert', 'bleu', 'orange', 'violet'])
  })
})
