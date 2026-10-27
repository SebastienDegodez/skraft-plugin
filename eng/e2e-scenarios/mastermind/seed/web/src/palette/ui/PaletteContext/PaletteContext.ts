import { createContext } from 'react'
import type { ChargerPalette } from '../../application/ChargerPalette'

export const PaletteContext = createContext<ChargerPalette | null>(null)
