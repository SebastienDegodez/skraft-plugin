import type { PaletteGateway } from '../application/PaletteGateway'

export class HttpPaletteGateway implements PaletteGateway {
  constructor(private readonly baseUrl: string) {}

  async couleurs(): Promise<string[]> {
    const reponse = await fetch(`${this.baseUrl}/api/couleurs`)
    if (!reponse.ok) throw new Error(`GET /api/couleurs a répondu ${reponse.status}`)
    const corps = (await reponse.json()) as { couleurs: string[] }
    return corps.couleurs
  }
}
