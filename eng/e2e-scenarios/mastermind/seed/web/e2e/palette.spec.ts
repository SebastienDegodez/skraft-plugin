import { expect, test } from '@playwright/test'
import { capturer } from './visuels'

test('la page montre les six couleurs du jeu', async ({ page }, testInfo) => {
  await page.goto('/')

  await expect(page.getByRole('listitem')).toHaveText(['rouge', 'jaune', 'vert', 'bleu', 'orange', 'violet'])
  await capturer(page, testInfo, 'Les couleurs du jeu')
})
