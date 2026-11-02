import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../src/game/engine';

async function openStory(page: Page, quotaFailure = false) {
  const state = createGame(6842, 'guided');
  state.started = true;
  state.paused = true;
  await page.addInitScript(
    ({ raw, quotaFailure }) => {
      localStorage.setItem('lingus.save.v2', raw);
      if (quotaFailure) {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key.startsWith('lingus.save'))
            throw new DOMException('Storage full', 'QuotaExceededError');
          return original.call(this, key, value);
        };
      }
    },
    { raw: JSON.stringify(state), quotaFailure },
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
}

for (const width of [320, 390]) {
  test(`large text, contrast and sound controls persist and fit a ${width}px phone`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await openStory(page);
    const dialog = page.getByRole('dialog', { name: 'Impostazioni e salvataggi' });
    await expect(dialog.getByRole('button', { name: /Salva adesso/ })).toBeVisible();
    await dialog.locator('summary').filter({ hasText: 'Suoni, musica e leggibilità' }).click();
    await dialog.getByRole('combobox', { name: 'Dimensione del testo' }).selectOption('large');
    await dialog.getByRole('combobox', { name: 'Contrasto dei pannelli' }).selectOption('high');
    const effects = dialog.getByRole('slider', { name: 'Azioni ed eventi' });
    await effects.fill('35');
    await expect(effects).toHaveValue('35');
    expect(await page.locator('.app').getAttribute('data-text-size')).toBe('large');
    expect(await page.locator('.app').getAttribute('data-contrast')).toBe('high');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await dialog.locator('.interface-settings').scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`settings-${width}.png`) });
    await page.reload();
    await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
    await page
      .getByRole('dialog')
      .locator('summary')
      .filter({ hasText: 'Suoni, musica e leggibilità' })
      .click();
    await expect(page.getByRole('combobox', { name: 'Dimensione del testo' })).toHaveValue('large');
    await expect(page.getByRole('combobox', { name: 'Contrasto dei pannelli' })).toHaveValue(
      'high',
    );
    await expect(page.getByRole('slider', { name: 'Azioni ed eventi' })).toHaveValue('35');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('img', { name: /Mappa della valle/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: test.info().outputPath(`world-large-${width}.png`) });
  });
}

test('a release check never reloads over a failed save', async ({ page }) => {
  await openStory(page, true);
  await page.route('**/build.json?*', async (route) =>
    route.fulfill({
      json: {
        version: '0.3.1',
        commit: 'a'.repeat(40),
        builtAt: '2026-11-01T10:00:00.000Z',
      },
    }),
  );
  await page.getByRole('button', { name: 'Controlla aggiornamenti' }).click();
  await expect(page.getByRole('region', { name: 'Versione del gioco' })).toContainText(
    'È disponibile 0.3.1',
  );
  const before = page.url();
  await page.getByRole('button', { name: 'Salva e aggiorna', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Versione del gioco' })).toContainText(
    'La pagina è rimasta aperta',
  );
  expect(page.url()).toBe(before);
  await expect(
    page.getByRole('dialog').getByRole('alert', { name: 'Stato della partita' }),
  ).toBeVisible();
});

test('the voluntary playtest report starts locally and exports an actual observed session', async ({
  page,
}) => {
  await openStory(page);
  const report = page.locator('.playtest-summary');
  await report.locator('summary').click();
  await expect(
    report.getByRole('button', { name: 'Inizia il resoconto', exact: true }),
  ).toBeVisible();
  await report.getByRole('button', { name: 'Inizia il resoconto', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Come si gioca', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await report.locator('summary').click();
  await report.getByRole('button', { name: 'Termina il resoconto', exact: true }).click();
  await expect(report).toContainText('Annotazione terminata');
  const downloading = page.waitForEvent('download');
  await report.getByRole('button', { name: 'Esporta il resoconto', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('lingus-playtest.json');
  const stream = (await download.createReadStream())!;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(data.observation.totals['help-opened']).toBe(1);
  expect(data.observation.recording).toBe(false);
  expect(JSON.stringify(data)).not.toContain('Uma');
});
