import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../src/game/engine';
import { openWordBank, closeWordBank } from './mobile-ui';

/** Prepared diplomacy scenes isolate discovery, reading and camera controls.
 * Revealing the region here is not evidence of an ordinary campaign. */
async function scene(page: Page, mode: 'all' | 'hidden' | 'capital' = 'all') {
  const state = createGame(42, 'guided', 'random', 1000);
  Object.assign(state, { started: true, paused: true, tier: 3, time: 20, sparks: [] });
  for (const id of ['S_05', 'O_03', 'V_04']) {
    state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
    state.units[0].knows.push(id);
  }
  for (const sector of state.sectors) sector.explored = mode !== 'hidden';
  if (mode === 'hidden') {
    const first = state.cities[0];
    state.sectors.find(
      (sector) => sector.x === first.sectorX && sector.y === first.sectorY,
    )!.explored = true;
    state.sectors.find((sector) => sector.x === 5 && sector.y === 5)!.explored = true;
  }
  let survivingCity = state.cities[0];
  if (mode === 'capital') {
    const faction = state.factions[0];
    survivingCity = structuredClone(state.cities[0]);
    Object.assign(survivingCity, {
      id: 'encountered-colony',
      name: 'Le Rive dei Rami',
      x: 650,
      y: 650,
      sectorX: 6,
      sectorY: 6,
    });
    state.cities[0].factionId = 'player';
    faction.subjugated = true;
    state.cities.push(survivingCity);
    state.sectors.find((sector) => sector.x === 6 && sector.y === 6)!.cityId = survivingCity.id;
  }
  const raw = JSON.stringify(state);
  await page.goto('/');
  await page.addInitScript(
    ({ raw, marker }) => {
      if (sessionStorage.getItem(marker)) return;
      localStorage.setItem('lingus.save.v2', raw);
      sessionStorage.setItem(marker, 'loaded');
    },
    { raw, marker: `regional-cultures.${mode}` },
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
  return { state, survivingCity };
}

async function openCultures(page: Page) {
  await page
    .getByRole('navigation', { name: 'Sezioni di gioco' })
    .getByRole('button', { name: 'Pensiero', exact: true })
    .click();
  await page.getByRole('button', { name: /Gli altri popoli/ }).click();
  return page.getByRole('dialog', { name: 'La civiltà delle parole' });
}

for (const width of [320, 390])
  test(`eight regional cultures remain reachable and map focus keeps the draft at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 744 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const { state } = await scene(page);
    expect(state.factions).toHaveLength(8);
    await openWordBank(page);
    await page.getByRole('button', { name: /^Gruppo:/ }).click();
    await page.getByRole('button', { name: /^Andare:/ }).click();
    const draft = await page.locator('.sentence-slot.filled').allTextContents();
    expect(draft).toHaveLength(2);
    await closeWordBank(page);
    const dialog = await openCultures(page);
    await expect(dialog.locator('.civ-culture-card')).toHaveCount(8);
    for (const [index, faction] of state.factions.entries()) {
      const card = dialog.getByRole('article', { name: faction.name, exact: true });
      await card.locator('summary').click();
      await expect(card.getByText('Comprensione', { exact: false })).toBeVisible();
      await expect(dialog.locator('.civ-culture-disclosure[open]')).toHaveCount(1);
      const focus = card.getByRole('button', { name: 'Indica sulla mappa', exact: true });
      await expect(focus).toBeVisible();
      expect((await focus.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (index === 0)
        await page.screenshot({ path: test.info().outputPath(`regional-cultures-${width}.png`) });
    }
    const last = state.factions.at(-1)!;
    await dialog
      .getByRole('article', { name: last.name, exact: true })
      .getByRole('button', { name: 'Indica sulla mappa', exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('img', { name: /Mappa della valle/ })).toBeVisible();
    expect(await page.locator('.sentence-slot.filled').allTextContents()).toEqual(draft);
    await expect(page.locator('.map-toolbar')).toContainText(last.name);
    await page.getByRole('button', { name: 'Elementi visibili', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Elementi visibili sulla mappa' })).toBeVisible();
    await page.getByRole('button', { name: 'Chiudi elementi visibili', exact: true }).click();
    expect(await page.locator('.sentence-slot.filled').allTextContents()).toEqual(draft);
    expect(errors).toEqual([]);
  });

test('the diplomatic list contains no names from unexplored regional settlements', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 744 });
  const { state } = await scene(page, 'hidden');
  const dialog = await openCultures(page);
  await expect(dialog.locator('.civ-culture-card')).toHaveCount(1);
  await expect(dialog).toContainText(state.factions[0].name);
  for (const faction of state.factions.slice(1))
    await expect(dialog).not.toContainText(faction.name);
});

test('a culture with a surviving colony remains reachable after losing its first capital', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 744 });
  const { state, survivingCity } = await scene(page, 'capital');
  const dialog = await openCultures(page);
  const card = dialog.getByRole('article', { name: state.factions[0].name, exact: true });
  await expect(card).toContainText('In pace');
  await expect(card).not.toContainText('Annessa');
  await card.locator('summary').click();
  await card.getByRole('button', { name: 'Indica sulla mappa', exact: true }).click();
  await expect(page.locator('.map-toolbar')).toContainText(survivingCity.name);
});
