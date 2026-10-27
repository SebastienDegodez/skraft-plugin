import { creerServeur } from './api/serveur.js'
import { listerCouleurs } from './application/lister-couleurs.js'

const port = Number(process.env.PORT ?? 3001)

await creerServeur({ listerCouleurs }).listen({ host: '127.0.0.1', port })
