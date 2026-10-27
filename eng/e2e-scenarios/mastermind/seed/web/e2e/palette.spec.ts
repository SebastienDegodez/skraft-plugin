import { expect, test } from '@playwright/test'
import { capturer } from './visuels'

test('should show the six colours of the game', async ({ page }, testInfo) => {
  await page.goto('/')

  const palette = page.getByRole('region', { name: 'Les couleurs du jeu' })
  await expect(palette.getByRole('listitem')).toHaveText(['rouge', 'jaune', 'vert', 'bleu', 'orange', 'violet'])
  await capturer(page, testInfo, 'Les couleurs du jeu')
})
