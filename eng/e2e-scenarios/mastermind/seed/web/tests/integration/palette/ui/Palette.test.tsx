import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChargerPalette } from '../../../../src/palette/application/ChargerPalette'
import type { PaletteGateway } from '../../../../src/palette/application/PaletteGateway'
import { Palette } from '../../../../src/palette/ui/Palette/Palette'
import { PaletteProvider } from '../../../../src/palette/ui/PaletteProvider/PaletteProvider'

const palette = (couleurs: () => Promise<string[]>): PaletteGateway => ({ couleurs })

const afficher = (gateway: PaletteGateway) =>
  render(
    <PaletteProvider chargerPalette={new ChargerPalette(gateway)}>
      <Palette />
    </PaletteProvider>,
  )

afterEach(cleanup)

describe('la palette', () => {
  it('montre un pion par couleur du jeu', async () => {
    afficher(palette(async () => ['rouge', 'jaune', 'vert']))

    const pions = await screen.findAllByRole('listitem')
    expect(pions.map((pion) => pion.textContent)).toEqual(['rouge', 'jaune', 'vert'])
  })

  it('dit quand les couleurs sont indisponibles', async () => {
    afficher(palette(() => Promise.reject(new Error('hors ligne'))))

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Les couleurs du jeu sont indisponibles.')
  })
})
