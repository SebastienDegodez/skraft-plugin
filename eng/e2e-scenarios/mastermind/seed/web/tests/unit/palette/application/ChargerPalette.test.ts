import { describe, expect, it } from 'vitest'
import { ChargerPalette } from '../../../../src/palette/application/ChargerPalette'
import { PaletteEnMemoire } from '../PaletteEnMemoire'

describe('ChargerPalette', () => {
  it('should give the colours the API knows, in its order', async () => {
    const palette = await new ChargerPalette(new PaletteEnMemoire(['rouge', 'bleu'])).executer()

    expect(palette).toEqual({ couleurs: ['rouge', 'bleu'] })
  })
})
