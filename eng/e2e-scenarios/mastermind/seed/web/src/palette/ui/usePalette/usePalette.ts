import { useContext, useEffect, useState } from 'react'
import { PaletteContext } from '../PaletteContext/PaletteContext'

export type EtatPalette =
  | { statut: 'chargement' }
  | { statut: 'prete'; couleurs: string[] }
  | { statut: 'indisponible' }

export const usePalette = (): EtatPalette => {
  const chargerPalette = useContext(PaletteContext)
  if (chargerPalette === null) throw new Error('usePalette needs a PaletteProvider')
  const [etat, setEtat] = useState<EtatPalette>({ statut: 'chargement' })
  useEffect(() => {
    let actif = true
    chargerPalette.executer().then(
      ({ couleurs }) => {
        if (actif) setEtat({ statut: 'prete', couleurs })
      },
      () => {
        if (actif) setEtat({ statut: 'indisponible' })
      },
    )
    return () => {
      actif = false
    }
  }, [chargerPalette])
  return etat
}
