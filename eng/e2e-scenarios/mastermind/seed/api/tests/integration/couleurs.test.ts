import { describe, expect, it } from 'vitest'
import { creerServeur } from '../../src/api/serveur.js'
import { listerCouleurs } from '../../src/application/lister-couleurs.js'

describe('GET /api/couleurs', () => {
  it('répond les couleurs du jeu', async () => {
    const reponse = await creerServeur({ listerCouleurs }).inject({ method: 'GET', url: '/api/couleurs' })

    expect(reponse.statusCode).toBe(200)
    expect(reponse.json()).toEqual({ couleurs: ['rouge', 'jaune', 'vert', 'bleu', 'orange', 'violet'] })
  })
})
