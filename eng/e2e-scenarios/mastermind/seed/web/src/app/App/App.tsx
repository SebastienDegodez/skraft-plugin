import { ChargerPalette } from '../../palette/application/ChargerPalette'
import { HttpPaletteGateway } from '../../palette/infrastructure/HttpPaletteGateway'
import { Palette } from '../../palette/ui/Palette/Palette'
import { PaletteProvider } from '../../palette/ui/PaletteProvider/PaletteProvider'
import './App.css'

// The API answers on the same origin: Vite proxies /api in development.
const chargerPalette = new ChargerPalette(new HttpPaletteGateway(''))

export const App = () => (
  <main className="page">
    <h1>Mastermind</h1>
    <PaletteProvider chargerPalette={chargerPalette}>
      <Palette />
    </PaletteProvider>
  </main>
)
