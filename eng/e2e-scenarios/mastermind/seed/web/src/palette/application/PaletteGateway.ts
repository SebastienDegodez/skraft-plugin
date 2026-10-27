export interface PaletteGateway {
  couleurs(): Promise<string[]>
}
