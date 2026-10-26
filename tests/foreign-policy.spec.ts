import { expect, test, type Page } from '@playwright/test';

// Prepared diplomacy scene: policy dispatch, response and transport remain real.
// This isolates the UI and does not stand in for a full growth campaign.
async function showPressure(page: Page, food = 20, hostile = false, multiple = false) {
  await page.goto('/');
  const raw = await page.evaluate(
    async ({ food, hostile, multiple }) => {
      const { createGame } = await import('/src/game/engine.ts');
      const { dispatchForeignPolicy } = await import('/src/game/foreignPolicy.ts');
      const { emptyInventory } = await import('/src/game/content.ts');
      const state = createGame(6842, 'guided');
      Object.assign(state, {
        tier: 3,
        started: true,
        paused: true,
        time: 720,
        entities: [],
        buildings: [],
        sparks: [],
        campfirePending: false,
      });
      const faction = state.factions[0],
        city = state.cities[0];
      faction.name = 'Il Popolo dei Rami';
      faction.relation = hostile ? -70 : -40;
      faction.hostile = hostile;
      Object.assign(city, {
        x: 200,
        y: 250,
        sectorX: 1,
        sectorY: 2,
        resources: { ...emptyInventory(), food: 100, wood: 60, stone: 60 },
      });
      state.factions = [faction];
      state.cities = [city];
      if (multiple) {
        const secondFaction = structuredClone(faction),
          secondCity = structuredClone(city);
        Object.assign(secondFaction, {
          id: 'second-faction',
          name: 'Le Voci della Selce',
          cityId: 'second-city',
        });
        Object.assign(secondCity, {
          id: secondFaction.cityId,
          factionId: secondFaction.id,
          x: 300,
          sectorX: 3,
        });
        state.factions.push(secondFaction);
        state.cities.push(secondCity);
      }
      state.resources.food = food;
      for (const sector of state.sectors) sector.explored = true;
      dispatchForeignPolicy(state);
      return JSON.stringify(state);
    },
    { food, hostile, multiple },
  );
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem('foreign-ui-fixture')) return;
    localStorage.setItem('lingus.save.v2', raw);
    sessionStorage.setItem('foreign-ui-fixture', 'loaded');
  }, raw);
  await page.reload();
  const pressure = page.getByRole('region', { name: 'Pressioni delle tribù vicine' });
  await expect(pressure).toBeVisible();
  return pressure;
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  return state;
}

test('a visible diplomatic request sends one real gift without changing doctrine', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const pressure = await showPressure(page);
  await expect(pressure).toContainText('Chiede un tributo');
  // Without Numero, physical diplomacy is readable while exact quantities remain hidden.
  await expect(pressure).toContainText('Il tempo per rispondere è breve');
  await pressure.getByRole('button', { name: 'Invia il dono', exact: true }).click();
  await expect(pressure).toContainText('è in viaggio');
  await expect(pressure).toContainText('La tregua è attiva');
  await expect(pressure.getByRole('button', { name: 'Invia il dono' })).toHaveCount(0);
  const sent = await save(page);
  expect(sent.resources.food).toBe(12);
  expect(sent.caravans).toHaveLength(1);
  expect(sent.caravans[0]).toMatchObject({ gift: true, resources: { food: 8 } });
  expect(sent.cities[0].resources.food).toBe(100);
  expect(sent.foreignPolicy.ultimata[0].status).toBe('dispatched');
  expect(sent.dogmas).toEqual([]);
  expect(sent.factions[0].peaceUntil).toBe(990);
  expect((await save(page)).resources.food).toBe(12);
  expect(errors).toEqual([]);
});

test('on a narrow screen an unaffordable request can be refused and an incoming raid can be located', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const pressure = await showPressure(page, 3, true);
  await expect(pressure).toContainText('Una razzia si avvicina');
  const pay = pressure.getByRole('button', { name: 'Invia il dono', exact: true });
  await expect(pay).toBeDisabled();
  const refuse = pressure.getByRole('button', { name: 'Rifiuta', exact: true });
  await expect(pay).toBeInViewport({ ratio: 1 });
  await expect(refuse).toBeInViewport({ ratio: 1 });
  const focus = pressure.getByRole('button', { name: /Inquadra gli incursori/ });
  await expect(focus).toBeVisible();
  await focus.click();
  await refuse.focus();
  await expect(refuse).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(refuse).toHaveCount(0);
  const refused = await save(page);
  expect(refused.resources.food).toBe(3);
  expect(refused.caravans).toHaveLength(0);
  expect(refused.foreignPolicy.ultimata[0].status).toBe('refused');
  expect(refused.factions[0].relation).toBe(-90);
  expect(refused.factions[0].hostile).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('overflowing mobile warnings signal scrolling and remain accessible from the keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const pressure = await showPressure(page, 20, true, true);
  await expect(pressure.getByText('Scorri gli avvisi ↓', { exact: true })).toBeVisible();
  await expect(
    pressure.getByRole('button', { name: 'Invia il dono', exact: true }).first(),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    pressure.getByRole('button', { name: 'Rifiuta', exact: true }).first(),
  ).toBeInViewport({ ratio: 1 });
  const list = pressure.getByRole('group', { name: 'Avvisi delle tribù vicine' });
  await list.focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const bounds = await page.getByRole('img', { name: /Mappa della valle/ }).boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(180);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
