import type { PaletteGateway } from '../../../src/palette/application/PaletteGateway'

export class PaletteEnMemoire implements PaletteGateway {
  private readonly connues: string[]

  constructor(connues: string[]) {
    this.connues = [...connues]
  }

  couleurs(): Promise<string[]> {
    return Promise.resolve([...this.connues])
  }
}
