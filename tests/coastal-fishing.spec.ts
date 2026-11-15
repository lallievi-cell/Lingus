import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../src/game/engine';
import { RESOURCE_ORDER } from '../src/game/content';
import { createCoastGeometry } from '../src/game/coastGeometry';
import { isDryLandPoint, planLandRoute } from '../src/game/landNavigation';
import { validSave } from '../src/game/saveValidation';
import { createBuilding } from '../src/game/simulation';
import type { GameState } from '../src/game/types';
import { closeWordBank } from './mobile-ui';

const SAVE_KEY = 'lingus.save.v2';

/** A prepared coastal camp isolates the public fishing flow. The bank and
 * shoreline come from the actual generator; the scene is not a campaign. */
function coastalCamp(stocks = false) {
  const state = createGame(123, 'guided', 'random', 1000);
  const coast = createCoastGeometry(state)!;
  const inland = {
    x: coast.side === 'west' ? 1 : coast.side === 'east' ? -1 : 0,
    y: coast.side === 'north' ? 1 : coast.side === 'south' ? -1 : 0,
  };
  const bank = state.entities.find((entity) => {
    if (entity.kind !== 'fishery') return false;
    const camp = { x: entity.x + inland.x * 10, y: entity.y + inland.y * 10 };
    return isDryLandPoint(state, camp) && planLandRoute(state, camp, entity) !== null;
  });
  if (!bank) throw new Error('The seeded region has no dry, reachable fishing camp.');
  state.home = { x: bank.x + inland.x * 10, y: bank.y + inland.y * 10 };
  Object.assign(state, { started: true, paused: true, tier: 2, time: 20, sparks: [] });
  state.units = state.units.slice(0, 1);
  Object.assign(state.units[0], { ...state.home, age: 6, hp: 100, temp: 100, hunger: 20 });
  state.entities = [bank];
  for (const sector of state.sectors) sector.explored = true;
  state.explored = [{ ...state.home }, { x: bank.x, y: bank.y }];
  for (const id of ['O_01', 'O_02', 'O_03', 'O_04', 'O_05', 'O_08', 'V_04', 'V_05', 'V_07']) {
    state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
    if (!state.units[0].knows.includes(id)) state.units[0].knows.push(id);
  }
  if (stocks) Object.assign(state.resources, { meat: 2, cooked: 3, fish: 4, cookedFish: 5 });
  if (!validSave(state)) throw new Error('The coastal browser scene must pass save validation.');
  return { state, bank };
}

async function load(page: Page, state: GameState) {
  await page.clock.install();
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem('coastal-fishing-fixture')) return;
    localStorage.setItem('lingus.save.v2', raw);
    localStorage.setItem('lingus.pause-events', 'false');
    sessionStorage.setItem('coastal-fishing-fixture', 'applied');
  }, JSON.stringify(state));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
  await closeWordBank(page);
}

async function saved(page: Page): Promise<GameState> {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi', exact: true }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  await page.getByRole('button', { name: 'Chiudi finestra', exact: true }).click();
  return state;
}

const book = (page: Page) =>
  page
    .getByRole('region', { name: 'Frasario', exact: true })
    .or(page.getByRole('dialog', { name: 'Frasario', exact: true }));

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 1050 },
]) {
  test(`a coastal phrase prepares freely, selects the real bank and delivers finite fish at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const { state, bank } = coastalCamp();
    await load(page, state);

    await page.getByRole('button', { name: 'Elementi visibili', exact: true }).click();
    const elements = page.getByRole('region', {
      name: 'Elementi visibili sulla mappa',
      exact: true,
    });
    await elements
      .getByRole('searchbox', { name: 'Cerca tra gli elementi visibili' })
      .fill('Punto di pesca');
    await elements.getByRole('button', { name: /Punto di pesca/ }).click();
    await expect(elements).toHaveCount(0);
    const details = page.getByRole('status', { name: 'Dettagli del bersaglio', exact: true });
    await expect(details).toContainText('Punto di pesca');
    await expect(details).toContainText('terraferma');
    await expect(page.getByRole('img', { name: /Mappa della valle/ })).toBeFocused();

    await page.getByRole('button', { name: 'Apri frasario', exact: true }).click();
    const fishing = book(page).getByRole('article', {
      name: 'Pesca e porta al campo',
      exact: true,
    });
    await expect(fishing).toContainText('riserva diminuisce alla cattura');
    await fishing
      .getByRole('button', { name: 'Prepara la frase: Pesca e porta al campo', exact: true })
      .click();
    await expect(book(page)).toHaveCount(0);
    await expect(page.locator('.sentence-slot.filled')).toHaveCount(3);
    await expect(
      page.getByRole('button', { name: 'Deseleziona bersaglio', exact: true }),
    ).toBeVisible();
    await expect(details).toContainText('Punto di pesca');
    const prepared = await saved(page);
    expect(prepared.stats.commands).toBe(0);
    expect(prepared.voice).toBe(state.voice);
    expect(prepared.resources).toEqual(state.resources);
    expect(prepared.entities[0].amount).toBe(bank.amount);
    expect(prepared.units[0].action).toBe('idle');

    await page.getByRole('button', { name: 'Pronuncia', exact: true }).click();
    const assigned = await saved(page);
    expect(assigned.stats.commands).toBe(1);
    expect(assigned.voice).toBe(state.voice - 1);
    expect(assigned.units[0].targetId).toBe(bank.id);
    expect(assigned.resources.fish).toBe(0);
    expect(assigned.entities[0].amount).toBe(bank.amount);

    await page.getByRole('button', { name: 'Velocità 4x', exact: true }).click();
    await page.getByRole('button', { name: 'Riprendi il tempo', exact: true }).click();
    // Browser time drives the normal simulation loop, physical work and travel.
    await page.clock.runFor(10_000);
    await page.getByRole('button', { name: 'Metti in pausa', exact: true }).click();
    const delivered = await saved(page);
    expect(delivered.resources.fish).toBeGreaterThan(0);
    expect(delivered.entities[0].amount).toBeLessThan(bank.amount);
    const caught = bank.amount - delivered.entities[0].amount;
    const cargo = delivered.units.reduce(
      (sum, unit) => sum + (unit.carry?.resource === 'fish' ? unit.carry.amount : 0),
      0,
    );
    const piles = delivered.entities
      .filter((entity) => entity.kind === 'ground' && entity.resource === 'fish')
      .reduce((sum, entity) => sum + entity.amount, 0);
    expect(delivered.resources.fish + cargo + piles).toBe(caught);
    expect(delivered.resources.meat).toBe(0);
    expect(delivered.resources.cooked).toBe(0);
    expect(delivered.resources.cookedFish).toBe(0);
    expect(delivered.resources.seed).toBe(0);
    expect(delivered.resources.pelt).toBe(0);
    expect(isDryLandPoint(delivered, delivered.units[0])).toBe(true);
    expect(delivered.stats.commands).toBe(1);
    expect(Object.keys(delivered.resources).sort()).toEqual([...RESOURCE_ORDER].sort());
    expect(RESOURCE_ORDER).toHaveLength(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`coastal-fishing-${viewport.width}.png`),
    });
  });

  test(`a selected fish portion cooks through a real save reload without using meat at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const { state } = coastalCamp();
    // Classic makes one paid portion. The prepared camp contains both kinds
    // of animal food so that selecting the physical fish is meaningful.
    state.playMode = 'classic';
    delete state.openingBalanceVersion;
    delete state.openingCouncilsCompleted;
    createBuilding(state, 'campfire', state.home.x, state.home.y);
    state.resources.meat = 2;
    state.resources.wood = 5;
    const portion = {
      id: 'caught-fish-portion',
      kind: 'ground' as const,
      resource: 'fish' as const,
      ...state.home,
      amount: 1,
      maxAmount: 1,
      hp: 0,
      maxHp: 1,
    };
    state.entities.push(portion);
    expect(validSave(state)).toBe(true);
    await load(page, state);
    await page.getByRole('button', { name: 'Apri frasario', exact: true }).click();
    await book(page)
      .getByRole('article', { name: 'Cuoci carne o pesce', exact: true })
      .getByRole('button', { name: 'Prepara la frase: Cuoci carne o pesce', exact: true })
      .click();
    await expect(page.locator('.sentence-slot.filled')).toHaveCount(4);
    await page.getByRole('button', { name: 'Elementi visibili', exact: true }).click();
    const elements = page.getByRole('region', {
      name: 'Elementi visibili sulla mappa',
      exact: true,
    });
    await elements
      .getByRole('searchbox', { name: 'Cerca tra gli elementi visibili' })
      .fill('Pesce crudo');
    await elements.getByRole('button', { name: /Pesce crudo/ }).click();
    const prepared = await saved(page);
    expect(prepared.stats.commands).toBe(0);
    expect(prepared.voice).toBe(state.voice);
    expect(prepared.entities.find((entity) => entity.id === portion.id)?.amount).toBe(1);
    expect(prepared.resources).toEqual(state.resources);

    await page.getByRole('button', { name: 'Pronuncia', exact: true }).click();
    const paid = await saved(page);
    expect(paid.stats.commands).toBe(1);
    expect(paid.voice).toBe(state.voice - 1);
    expect(paid.units[0].action).toBe('cooking');
    expect(paid.units[0].cookInput).toBe('fish');
    expect(paid.entities.find((entity) => entity.id === portion.id)?.amount).toBe(0);
    expect(paid.resources.meat).toBe(2);
    expect(paid.resources.cooked).toBe(0);
    expect(paid.resources.cookedFish).toBe(0);

    await page.getByRole('button', { name: 'Riprendi il tempo', exact: true }).click();
    await page.clock.runFor(1_000);
    await page.getByRole('button', { name: 'Metti in pausa', exact: true }).click();
    const inProgress = await saved(page);
    expect(inProgress.units[0].progress).toBeGreaterThan(0);
    expect(inProgress.units[0].progress).toBeLessThan(5);
    expect(inProgress.units[0].cookInput).toBe('fish');
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Riprendi il tempo', exact: true }),
    ).toBeVisible();
    if (viewport.width === 390)
      await page
        .getByRole('navigation', { name: 'Sezioni di gioco' })
        .getByRole('button', { name: /^Tribù/ })
        .click();
    await expect(page.locator('.unit-card')).toContainText('Cuoce pesce');
    if (viewport.width === 390)
      await page
        .getByRole('navigation', { name: 'Sezioni di gioco' })
        .getByRole('button', { name: 'Mappa', exact: true })
        .click();
    await page.getByRole('button', { name: 'Riprendi il tempo', exact: true }).click();
    await page.clock.runFor(5_000);
    await page.getByRole('button', { name: 'Metti in pausa', exact: true }).click();
    const cooked = await saved(page);
    expect(cooked.stats.commands).toBe(1);
    expect(cooked.resources.meat).toBe(2);
    expect(cooked.resources.cooked).toBe(0);
    expect(cooked.resources.fish).toBe(0);
    expect(cooked.resources.cookedFish).toBe(1);
    expect(cooked.units[0].cookInput).toBeUndefined();
    expect(
      cooked.entities
        .filter((entity) => entity.kind === 'ground' && entity.resource === 'fish')
        .reduce((sum, entity) => sum + entity.amount, 0),
    ).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test(`raw and cooked fish keep distinct stock rows and inventories at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const { state } = coastalCamp(true);
    await load(page, state);
    await page.getByRole('button', { name: 'Scorte del campo', exact: true }).click();
    const inventory = page.locator('dl[aria-label="Scorte disponibili"]');
    for (const [resource, label, quantity] of [
      ['meat', 'Carne cruda', 2],
      ['cooked', 'Carne cotta', 3],
      ['fish', 'Pesce crudo', 4],
      ['cookedFish', 'Pesce cotto', 5],
    ] as const) {
      const row = page.locator(`.camp-inventory-row[data-resource="${resource}"]`);
      await expect(row).toContainText(label);
      await expect(row.locator('.camp-inventory-quantity')).toHaveText(String(quantity));
    }
    await expect(inventory).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: test.info().outputPath(`coastal-stocks-${viewport.width}.png`) });
    await page.getByRole('button', { name: 'Chiudi finestra', exact: true }).click();
    const after = await saved(page);
    expect(after.resources).toEqual(state.resources);
  });
}
