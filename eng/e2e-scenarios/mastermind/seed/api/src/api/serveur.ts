import Fastify, { type FastifyInstance } from 'fastify'
import type { Couleur } from '../domain/couleur.js'

export type CasDUsage = {
  listerCouleurs: () => readonly Couleur[]
}

export const creerServeur = (casDUsage: CasDUsage): FastifyInstance => {
  const serveur = Fastify()
  serveur.get('/api/couleurs', async () => ({ couleurs: casDUsage.listerCouleurs() }))
  return serveur
}
