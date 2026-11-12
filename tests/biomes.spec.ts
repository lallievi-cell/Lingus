import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../src/game/engine';
import { closeWordBank } from './mobile-ui';

async function scene(page: Page, agriculture = true, legacy = false) {
  const state = createGame(42, 'guided', 'random', 1000);
  Object.assign(state, { started: true, paused: true, tier: 3, time: 20, sparks: [] });
  state.entities = [];
  state.sectors.find((sector) => sector.x === 5 && sector.y === 5)!.biome = 'wetland';
  state.resources.seed = 20;
  for (const id of ['O_01', 'O_04', 'O_08', ...(agriculture ? ['V_09'] : [])]) {
    state.words[id] = { retention: 100, custodians: state.units.map((unit) => unit.id), uses: 0 };
    for (const unit of state.units) if (!unit.knows.includes(id)) unit.knows.push(id);
  }
  if (legacy) delete state.mapGeneration!.biomeRules;
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem('biome-fixture')) return;
    localStorage.setItem('lingus.save.v2', raw);
    sessionStorage.setItem('biome-fixture', 'yes');
  }, JSON.stringify(state));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
  await closeWordBank(page);
  return state;
}

async function selectGround(page: Page) {
  const map = page.getByRole('img', { name: /Mappa della valle/ });
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width * 0.68, y: box.height * 0.4 } });
  await page.mouse.move(1, 1);
}

for (const width of [320, 390, 1440])
  test(`biome details stay compact and expose farm placement effects at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1050 : 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await scene(page);
    await selectGround(page);
    const card = page.getByRole('status', { name: 'Dettagli del bersaglio' });
    const disclosure = card.locator('.map-biome-details');
    await expect(disclosure).not.toHaveAttribute('open', '');
    const summary = disclosure.locator('summary');
    await expect(summary).toHaveText('Terreno · Zona umida');
    expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await summary.click();
    await expect(disclosure).toContainText('20% di tempo in più');
    await expect(disclosure).toContainText('125%');
    const map = (await page.getByRole('img', { name: /Mappa della valle/ }).boundingBox())!;
    const bounds = (await card.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(map.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(map.x + map.width + 1);
    expect(bounds.y).toBeGreaterThanOrEqual(map.y);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(map.y + map.height + 1);
    await page.getByRole('button', { name: 'Ingrandisci la mappa', exact: true }).click();
    await expect(page.locator('.lingus-world__control-stack')).toContainText('480');
    await page.getByRole('button', { name: 'Riduci la mappa', exact: true }).click();
    await page.screenshot({ path: test.info().outputPath(`biome-ground-${width}.png`) });
    const elements = page.getByRole('button', { name: 'Elementi visibili', exact: true });
    await elements.click();
    await expect(page.getByRole('region', { name: 'Elementi visibili sulla mappa' })).toBeVisible();
    await page.getByRole('button', { name: 'Chiudi elementi visibili', exact: true }).click();
    await page
      .getByRole('button', { name: 'Costruisci: apri le frasi degli edifici', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Prepara la frase: Campo agricolo', exact: true })
      .click();
    await page.getByRole('group', { name: 'Anteprima dell’ordine' }).locator('summary').click();
    await expect(page.locator('.preview-farm-terrain')).toContainText('Zona umida');
    await expect(page.locator('.preview-farm-terrain')).toContainText('125%');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`biome-farm-${width}.png`) });
  });

test('early ground inspection does not reveal crop effects before agriculture', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await scene(page, false);
  await selectGround(page);
  const card = page.getByRole('status', { name: 'Dettagli del bersaglio' });
  await card.locator('.map-biome-details summary').click();
  await expect(card).toContainText('20% di tempo in più');
  await expect(card).not.toContainText(/Raccolto|fertilità|125%/i);
});

test('a prepared regional overview renders six generated biomes without browser errors', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = createGame(42, 'guided', 'random', 1000);
  Object.assign(state, { started: true, paused: true, tier: 4, time: 20, sparks: [] });
  for (const sector of state.sectors) sector.explored = true;
  expect(new Set(state.sectors.map((sector) => sector.biome)).size).toBe(6);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem('biome-overview-fixture')) return;
    localStorage.setItem('lingus.save.v2', raw);
    sessionStorage.setItem('biome-overview-fixture', 'yes');
  }, JSON.stringify(state));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
  await closeWordBank(page);
  await expect(page.getByRole('img', { name: /Mappa della valle/ })).toBeVisible();
  await expect(page.locator('.lingus-world__control-stack')).toContainText('50');
  await page.screenshot({ path: test.info().outputPath('biome-region-overview-390.png') });
  expect(errors).toEqual([]);
});
