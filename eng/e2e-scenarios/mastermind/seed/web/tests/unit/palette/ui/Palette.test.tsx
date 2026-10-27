import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChargerPalette } from '../../../../src/palette/application/ChargerPalette'
import type { PaletteGateway } from '../../../../src/palette/application/PaletteGateway'
import { Palette } from '../../../../src/palette/ui/Palette/Palette'
import { PaletteProvider } from '../../../../src/palette/ui/PaletteProvider/PaletteProvider'
import { PaletteEnMemoire } from '../PaletteEnMemoire'

const afficher = (gateway: PaletteGateway) =>
  render(
    <PaletteProvider chargerPalette={new ChargerPalette(gateway)}>
      <Palette />
    </PaletteProvider>,
  )

describe('Palette', () => {
  it('should show one peg per colour of the game', async () => {
    afficher(new PaletteEnMemoire(['rouge', 'jaune', 'vert']))

    const palette = await screen.findByRole('region', { name: 'Les couleurs du jeu' })
    expect(palette).toHaveTextContent('rougejaunevert')
  })

  it('should say when the colours are unavailable', async () => {
    afficher({ couleurs: () => Promise.reject(new Error('hors ligne')) })

    expect(await screen.findByRole('alert')).toHaveTextContent('Les couleurs du jeu sont indisponibles.')
  })
})
