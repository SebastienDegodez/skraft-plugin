import type { PaletteGateway } from './PaletteGateway'

export type PaletteViewModel = {
  couleurs: string[]
}

export class ChargerPalette {
  constructor(private readonly gateway: PaletteGateway) {}

  async executer(): Promise<PaletteViewModel> {
    return { couleurs: await this.gateway.couleurs() }
  }
}
