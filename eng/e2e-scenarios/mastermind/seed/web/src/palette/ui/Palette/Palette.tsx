import { usePalette } from '../usePalette/usePalette'
import styles from './Palette.module.css'

export const Palette = () => {
  const etat = usePalette()
  if (etat.statut === 'chargement') return <p>Chargement des couleurs…</p>
  if (etat.statut === 'indisponible') return <p role="alert">Les couleurs du jeu sont indisponibles.</p>
  return (
    <section aria-labelledby="titre-palette">
      <h2 id="titre-palette">Les couleurs du jeu</h2>
      <ul className={styles.palette}>
        {etat.couleurs.map((couleur) => (
          <li key={couleur} className={styles.pion} data-couleur={couleur}>
            {couleur}
          </li>
        ))}
      </ul>
    </section>
  )
}
