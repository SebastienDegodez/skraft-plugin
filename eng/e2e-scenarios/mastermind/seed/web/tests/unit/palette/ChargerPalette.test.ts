import { describe, expect, it } from 'vitest'
import { ChargerPalette } from '../../../src/palette/application/ChargerPalette'
import type { PaletteGateway } from '../../../src/palette/application/PaletteGateway'

class PaletteEnMemoire implements PaletteGateway {
  constructor(private readonly connues: string[]) {}

  async couleurs(): Promise<string[]> {
    return this.connues
  }
}

describe('charger la palette', () => {
  it('donne les couleurs que l’API connaît, dans son ordre', async () => {
    const palette = await new ChargerPalette(new PaletteEnMemoire(['rouge', 'bleu'])).executer()

    expect(palette).toEqual({ couleurs: ['rouge', 'bleu'] })
  })
})
