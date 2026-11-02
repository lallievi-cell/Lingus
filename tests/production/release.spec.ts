import { expect, test } from '@playwright/test';
import { createGame } from '../../src/game/engine';

test('the built release loads its real assets under the Pages subpath and exposes its build', async ({
  page,
  request,
}) => {
  const failures: string[] = [];
  const errors: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const state = createGame(6842, 'guided');
  state.started = true;
  state.paused = true;
  await page.addInitScript(
    (raw) => localStorage.setItem('lingus.save.v2', raw),
    JSON.stringify(state),
  );
  const manifestResponse = await request.get('build.json');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.commit).toMatch(/^[a-f\d]{40}$/);
  expect(manifest.entryFile).toMatch(/^assets\/.*\.js$/);
  const asset = await request.get('art/valley-natural-atlas.png');
  expect(asset.ok()).toBe(true);
  expect(asset.headers()['content-type']).toContain('image/png');
  await page.goto('./');
  await expect(page.getByRole('img', { name: /Mappa della valle/ })).toBeVisible();
  await page.getByRole('button', { name: 'Apri frasario', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Frasario', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Chiudi frasario', exact: true }).click();
  await page
    .getByRole('button', { name: 'Costruisci: apri le frasi degli edifici', exact: true })
    .click();
  await expect(page.getByRole('tab', { name: 'Costruzioni', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: 'Chiudi frasario', exact: true }).click();
  await page.getByRole('button', { name: 'Mostra parole', exact: true }).click();
  for (const word of ['Gruppo', 'Andare'])
    await page.getByRole('button', { name: new RegExp(`^${word}:`) }).click();
  const composer = page.getByRole('region', { name: 'Costruttore di frasi' });
  const before = (await composer.boundingBox())!;
  const canvas = page.getByRole('img', { name: /Mappa della valle/ });
  const bounds = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: bounds.width * 0.2, y: bounds.height * 0.7 } });
  await expect(
    page.getByRole('button', { name: 'Rimuovi bersaglio del comando', exact: true }),
  ).toBeVisible();
  const selected = (await composer.boundingBox())!;
  expect(selected.height).toBeLessThanOrEqual(before.height + 1);
  expect(selected.height).toBeLessThanOrEqual(180);
  await page.getByRole('button', { name: 'Scorte del campo', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Scorte del campo' })).toContainText('Pelli');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await expect(page.getByRole('dialog')).toContainText(manifest.commit.slice(0, 7));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});
