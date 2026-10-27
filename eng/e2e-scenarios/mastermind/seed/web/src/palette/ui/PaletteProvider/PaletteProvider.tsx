import type { ReactNode } from 'react'
import type { ChargerPalette } from '../../application/ChargerPalette'
import { PaletteContext } from '../PaletteContext/PaletteContext'

export type PaletteProviderProps = {
  chargerPalette: ChargerPalette
  children: ReactNode
}

export const PaletteProvider = ({ chargerPalette, children }: PaletteProviderProps) => (
  <PaletteContext value={chargerPalette}>{children}</PaletteContext>
)
