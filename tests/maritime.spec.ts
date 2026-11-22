import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../src/game/engine';
import { emptyInventory, WORD_ORDER } from '../src/game/content';
import { createCoastGeometry, isSeaPoint } from '../src/game/coastGeometry';
import { isDryLandPoint, planLandRoute } from '../src/game/landNavigation';
import { findShoreAccess } from '../src/game/shoreAccess';
import { createBuilding } from '../src/game/simulation';
import { validSave } from '../src/game/saveValidation';
import { BOAT_BUILD_COST, BOAT_SPEED } from '../src/game/maritimeConfig';
import type { Boat, GameState } from '../src/game/types';
import { closeWordBank, openTargetDetails } from './mobile-ui';

/** Prepared technology and a coastal camp isolate the public maritime loop.
 * Every construction, boarding and voyage after setup uses normal UI orders. */
function scene(ready = false) {
  const state = createGame(123, 'classic', 'random', 1000);
  const coast = createCoastGeometry(state)!;
  const inward = {
    x: coast.side === 'west' ? 1 : coast.side === 'east' ? -1 : 0,
    y: coast.side === 'north' ? 1 : coast.side === 'south' ? -1 : 0,
  };
  const along = { x: inward.y ? 1 : 0, y: inward.x ? 1 : 0 };
  const island = coast.islands![0];
  const expeditionSite = {
    x: island.points.reduce((sum, point) => sum + point.x, 0) / island.points.length,
    y: island.points.reduce((sum, point) => sum + point.y, 0) / island.points.length,
  };
  // A nearby mainland camp keeps this public-control test focused on the
  // crossing. Full-length and obstructed routes have separate geometry tests.
  const vertex = [...coast.points.slice(3, -3)]
    .sort(
      (a, b) =>
        Math.hypot(a.x - expeditionSite.x, a.y - expeditionSite.y) -
        Math.hypot(b.x - expeditionSite.x, b.y - expeditionSite.y),
    )
    .find((point) => {
      const site = { x: point.x + inward.x * 8, y: point.y + inward.y * 8 };
      const home = {
        x: site.x + inward.x * 8 - along.x * 12,
        y: site.y + inward.y * 8 - along.y * 12,
      };
      return (
        findShoreAccess(state, site) &&
        isDryLandPoint(state, home) &&
        planLandRoute(state, home, site)
      );
    });
  if (!vertex) throw new Error('The scene needs a physical coastal workstation.');
  const site = { x: vertex.x + inward.x * 8, y: vertex.y + inward.y * 8 };
  state.home = { x: site.x + inward.x * 8 - along.x * 12, y: site.y + inward.y * 8 - along.y * 12 };
  if (!isDryLandPoint(state, state.home)) throw new Error('The prepared camp must be dry.');
  Object.assign(state, { started: true, paused: true, time: 0, tier: 3, sparks: [] });
  state.units = state.units.slice(0, 1);
  Object.assign(state.units[0], {
    ...state.home,
    age: 6,
    hp: 100,
    hunger: 0,
    temp: 100,
    action: 'idle',
  });
  for (const id of WORD_ORDER)
    state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
  state.units[0].knows = [...WORD_ORDER];
  state.entities = [];
  state.buildings = [];
  for (const sector of state.sectors) sector.explored = true;
  state.explored = [{ ...state.home }, { ...site }];
  state.resources = { ...emptyInventory(), wood: 30, stone: 10, tool: 2, cookedFish: 5 };
  createBuilding(state, 'storage', state.home.x, state.home.y);
  createBuilding(state, 'depot', state.home.x, state.home.y);
  createBuilding(state, 'campfire', state.home.x, state.home.y);
  let boat: Boat | undefined;
  if (ready) {
    const harbor = createBuilding(state, 'harbor', site.x, site.y);
    const access = findShoreAccess(state, site)!;
    harbor.seaAccess = access.water;
    boat = {
      id: 'prepared-canoe',
      ...access.water,
      hp: 150,
      maxHp: 150,
      ownerId: 'player',
      harborId: harbor.id,
      status: 'moored',
      passengerIds: [],
      resources: emptyInventory(),
      paidMaterials: { ...emptyInventory(), ...BOAT_BUILD_COST },
      progress: 20,
      accessLand: { ...site },
    };
    state.boats = [boat];
    Object.assign(state.units[0], site);
  }
  if (!validSave(state)) throw new Error('The maritime scene must pass strict save validation.');
  return { state, site, boat, inward, along };
}
async function load(page: Page, state: GameState) {
  await page.clock.install();
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem('maritime-fixture')) return;
    localStorage.setItem('lingus.save.v2', raw);
    localStorage.setItem('lingus.pause-events', 'false');
    sessionStorage.setItem('maritime-fixture', 'yes');
  }, JSON.stringify(state));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
  await closeWordBank(page);
}
async function saved(page: Page): Promise<GameState> {
  // Observe the normal five-second autosave while the world remains paused.
  // This keeps maritime checks focused on orders, rather than repeatedly
  // opening the unrelated settings dialog for every intermediate ledger.
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
  await page.clock.fastForward(5_000);
  const state: GameState = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('lingus.save.v2')!),
  );
  expect(state.paused).toBe(true);
  return state;
}

async function run(page: Page, milliseconds: number) {
  await page.getByRole('button', { name: 'Velocità 4x', exact: true }).click();
  await page.getByRole('button', { name: 'Riprendi il tempo', exact: true }).click();
  await page.clock.runFor(milliseconds);
  await page.getByRole('button', { name: 'Metti in pausa', exact: true }).click();
}
async function elements(page: Page, text: string) {
  await page.getByRole('button', { name: 'Elementi visibili', exact: true }).click();
  const list = page.getByRole('region', { name: 'Elementi visibili sulla mappa' });
  await list.getByRole('searchbox', { name: 'Cerca tra gli elementi visibili' }).fill(text);
  await list.getByRole('button').filter({ hasText: text }).first().click();
  await expect(list).toHaveCount(0);
}
async function ground(page: Page, home: { x: number; y: number }, point: { x: number; y: number }) {
  const map = page.getByRole('img', { name: /Mappa della valle/ });
  const bounds = (await map.boundingBox())!;
  const scale = Math.max(bounds.width / 1200, bounds.height / 800) * 4.5;
  await map.click({
    position: {
      x: bounds.width / 2 + (point.x - home.x) * 2.4 * scale,
      y: bounds.height / 2 + (point.y - home.y) * 1.6 * scale,
    },
  });
  const choices = page.getByRole('group', { name: 'Scegli tra gli elementi sovrapposti' });
  if (await choices.isVisible())
    await choices.getByRole('button', { name: 'Punto sul terreno', exact: true }).click();
}
const details = (page: Page) =>
  page.getByRole('status', { name: 'Dettagli del bersaglio', exact: true });
async function openBoat(page: Page) {
  await elements(page, 'barca');
  await openTargetDetails(page);
  const panel = details(page).locator('details.boat-panel');
  if ((await panel.getAttribute('open')) === null)
    await panel.getByText('Equipaggio, carico e ordini', { exact: true }).click();
}

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const persisted = await page
    .evaluate(() => localStorage.getItem('lingus.save.v2'))
    .catch(() => null);
  if (persisted)
    await info.attach('persisted-maritime-state', {
      body: persisted,
      contentType: 'application/json',
    });
});

for (const width of [390, 1440]) {
  test(`a shore harbor requires paid materials and real work through public controls at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1050 });
    const { state, site } = scene();
    await load(page, state);
    await page
      .getByRole('button', { name: 'Costruisci: apri le frasi degli edifici', exact: true })
      .click();
    await page.getByRole('button', { name: 'Prepara la frase: Approdo', exact: true }).click();
    await ground(page, state.home, site);
    const prepared = await saved(page);
    expect(prepared.stats.commands).toBe(0);
    expect(prepared.resources).toEqual(state.resources);
    await page.getByRole('button', { name: 'Pronuncia', exact: true }).click();
    const assigned = await saved(page);
    expect(assigned.stats.commands).toBe(1);
    expect(assigned.voice).toBe(prepared.voice - 1);
    expect(assigned.resources.wood).toBe(20);
    expect(assigned.resources.stone).toBe(5);
    expect(
      assigned.buildings.some(
        (building) => building.kind === 'harbor' && building.completed !== false,
      ),
    ).toBe(false);
    // This Classica scene uses twenty work seconds, plus the physical approach.
    await run(page, 7_000);
    const built = await saved(page);
    expect(built.buildings.find((building) => building.kind === 'harbor')?.seaAccess).toBeDefined();
    expect(built.stats.commands).toBe(1);
    expect(validSave(built)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`harbor-${width}.png`) });
  });

  test(`a paid canoe requires real work through public harbor controls at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1050 });
    const { state } = scene(true);
    state.boats = [];
    await load(page, state);
    await elements(page, 'Approdo');
    await openTargetDetails(page);
    await details(page).getByText('Barche e traversate', { exact: true }).click();
    await details(page).getByRole('button', { name: 'Prepara una barca', exact: true }).click();
    const boatPrepared = await saved(page);
    expect(boatPrepared.stats.commands).toBe(0);
    expect(boatPrepared.resources).toEqual(state.resources);
    await page.getByRole('button', { name: 'Pronuncia', exact: true }).click();
    const paid = await saved(page);
    expect(paid.stats.commands).toBe(1);
    expect(paid.voice).toBe(boatPrepared.voice - 1);
    expect(paid.resources.wood).toBe(15);
    expect(paid.resources.tool).toBe(1);
    expect(paid.boats).toHaveLength(1);
    expect(paid.boats![0].status).toBe('building');
    expect(paid.boats![0].progress).toBe(0);
    await run(page, 5_500);
    const ready = await saved(page);
    expect(ready.boats![0].status).toBe('moored');
    expect(ready.boats![0].progress).toBe(20);
    expect(ready.boats![0].resources).toEqual(emptyInventory());
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: test.info().outputPath(`harbor-canoe-${width}.png`) });
  });

  test(`a real crew boards, sails, reloads and lands on observed island ground at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1050 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const { state, boat } = scene(true);
    await load(page, state);
    await openBoat(page);
    await details(page)
      .getByRole('button', { name: 'Prepara piccolo equipaggio', exact: true })
      .click();
    const prepared = await saved(page);
    expect(prepared.stats.commands).toBe(0);
    expect(prepared.boats![0].passengerIds).toHaveLength(0);
    await page.getByRole('button', { name: 'Pronuncia', exact: true }).click();
    await run(page, 1_500);
    const boarded = await saved(page);
    expect(boarded.boats![0].passengerIds).toEqual([state.units[0].id]);
    expect(boarded.units[0].boatId).toBe(boat!.id);
    const coast = createCoastGeometry(boarded)!;
    const island = coast.islands![0];
    const center = {
      x: island.points.reduce((sum, point) => sum + point.x, 0) / island.points.length,
      y: island.points.reduce((sum, point) => sum + point.y, 0) / island.points.length,
    };
    const access = island.points
      .map((vertex) => ({
        x: center.x + (vertex.x - center.x) * 0.5,
        y: center.y + (vertex.y - center.y) * 0.5,
      }))
      .flatMap((point) => {
        const candidate = findShoreAccess(boarded, point);
        return candidate ? [candidate] : [];
      })
      // Leave enough real water to save and reload while the vessel is moving.
      .filter(
        (candidate) => Math.hypot(candidate.water.x - boat!.x, candidate.water.y - boat!.y) > 70,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.water.x - boat!.x, a.water.y - boat!.y) -
          Math.hypot(b.water.x - boat!.x, b.water.y - boat!.y),
      )[0];
    expect(access).toBeDefined();
    expect(Math.hypot(access.water.x - boat!.x, access.water.y - boat!.y)).toBeGreaterThan(70);
    expect(planLandRoute(boarded, boarded.home, access.land)).toBeNull();
    await openBoat(page);
    await details(page).getByRole('button', { name: 'Prepara navigazione', exact: true }).click();
    // Keep the desktop landfall to the left of the map's control column.
    // A narrow phone needs a wider view to include the opposite shore.
    const zoomSteps = width > 860 ? 8 : 12;
    for (let index = 0; index < zoomSteps; index++)
      await page.getByRole('button', { name: 'Riduci la mappa', exact: true }).click();
    const map = page.getByRole('img', { name: /Mappa della valle/ });
    const bounds = (await map.boundingBox())!;
    // Project the shoreline with the current zoom and the bounded camera.
    const zoomLabel = await page.locator('.lingus-world__control-stack').innerText();
    const zoom = Number(zoomLabel.match(/(\d+)\s*%/)?.[1] ?? 90) / 100;
    const fit = Math.max(bounds.width / 1200, bounds.height / 800) * zoom;
    const halfX = bounds.width / fit / 2.4 / 2,
      halfY = bounds.height / fit / 1.6 / 2;
    const cx = Math.max(halfX, Math.min(1000 - halfX, boarded.boats![0].x));
    let cy = Math.max(halfY, Math.min(1000 - halfY, boarded.boats![0].y));
    if (width > 860) {
      // Pan the observed beach above the minimap using the normal drag gesture.
      const shift = Math.min(120, bounds.height * 0.2);
      const start = { x: bounds.x + bounds.width * 0.55, y: bounds.y + bounds.height * 0.55 };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x, start.y - shift, { steps: 5 });
      await page.mouse.up();
      cy = Math.max(halfY, Math.min(1000 - halfY, cy + shift / fit / 1.6));
    }
    await map.click({
      position: {
        x: bounds.width / 2 + (access.land.x - cx) * 2.4 * fit,
        y: bounds.height / 2 + (access.land.y - cy) * 1.6 * fit,
      },
    });
    const overlaps = page.getByRole('group', { name: 'Scegli tra gli elementi sovrapposti' });
    if (await overlaps.isVisible())
      await overlaps.getByRole('button', { name: 'Punto sul terreno', exact: true }).click();
    await page.getByRole('button', { name: 'Pronuncia', exact: true }).click();
    const departing = await saved(page);
    expect(departing.stats.commands).toBe(2);
    expect(departing.boats![0].status).toBe('sailing');
    expect(departing.resources).toEqual(boarded.resources);
    await run(page, 500);
    const sailing = await saved(page);
    expect(isSeaPoint(sailing, sailing.boats![0])).toBe(true);
    expect(
      Math.hypot(sailing.boats![0].x - boat!.x, sailing.boats![0].y - boat!.y),
    ).toBeGreaterThan(0);
    expect(sailing.units[0].x).toBeCloseTo(sailing.boats![0].x);
    expect(sailing.units[0].y).toBeCloseTo(sailing.boats![0].y);
    expect(sailing.units[0].hunger).toBeGreaterThan(boarded.units[0].hunger);
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Riprendi il tempo', exact: true }),
    ).toBeVisible();
    const reloaded = await saved(page);
    expect(reloaded.boats![0].status).toBe('sailing');
    expect(reloaded.units[0].boatId).toBe(boat!.id);
    const vessel = reloaded.boats![0];
    const remaining = vessel.route!.slice(vessel.routeIndex!);
    const distanceToLand = remaining.reduce(
      (route, point) => ({
        point,
        length: route.length + Math.hypot(point.x - route.point.x, point.y - route.point.y),
      }),
      { point: { x: vessel.x, y: vessel.y }, length: 0 },
    ).length;
    const bridge = Math.hypot(
      vessel.destination!.x - vessel.landing!.x,
      vessel.destination!.y - vessel.landing!.y,
    );
    // Advance the actual remaining route and the real 4m/s shore crossing.
    await run(page, Math.ceil((distanceToLand / BOAT_SPEED + bridge / 4 + 1) * 250));
    const landed = await saved(page);
    expect(landed.boats![0].status).toBe('moored');
    expect(landed.boats![0].passengerIds).toHaveLength(0);
    expect(landed.units[0].boatId).toBeUndefined();
    expect(isDryLandPoint(landed, landed.units[0])).toBe(true);
    expect(planLandRoute(landed, landed.home, landed.units[0])).toBeNull();
    expect(landed.resources).toEqual(state.resources);
    expect(landed.stats.commands).toBe(2);
    expect(validSave(landed)).toBe(true);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 390) await page.getByRole('button', { name: 'Tribù (1)', exact: true }).click();
    await page
      .getByRole('button', { name: `Seleziona ${state.units[0].name}`, exact: true })
      .click();
    await page.getByRole('button', { name: 'Inquadra sulla mappa', exact: true }).click();
    await expect(page.getByRole('img', { name: /Mappa della valle/ })).toBeVisible();
    await page.getByRole('button', { name: 'Deseleziona bersaglio', exact: true }).click();
    await page.screenshot({ path: test.info().outputPath(`island-landfall-${width}.png`) });
  });

  test(`an explicitly chosen tool is carried to and from the hold without mixing food at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1050 });
    const { state } = scene(true);
    state.resources.tool = 1;
    await load(page, state);
    await openBoat(page);
    const cargo = details(page).locator('details.boat-other-cargo');
    // The optional material selector stays inside the existing target card.
    await cargo.locator('summary').click();
    await cargo
      .getByRole('combobox', { name: 'Risorsa da trasportare', exact: true })
      .selectOption('tool');
    await cargo.getByRole('button', { name: 'Prepara carico selezionato', exact: true }).click();
    const prepared = await saved(page);
    expect(prepared.stats.commands).toBe(0);
    expect(prepared.resources).toEqual(state.resources);
    expect(prepared.boats![0].resources).toEqual(emptyInventory());
    expect(prepared.voice).toBe(state.voice);
    await page.getByRole('button', { name: 'Pronuncia', exact: true }).click();
    const assigned = await saved(page);
    expect(assigned.stats.commands).toBe(1);
    expect(assigned.resources.tool).toBe(1);
    expect(assigned.boats![0].resources.tool).toBe(0);
    expect(assigned.voice).toBe(prepared.voice - 1);
    await run(page, 4_000);
    const loaded = await saved(page);
    expect(loaded.resources.tool).toBe(0);
    expect(loaded.boats![0].resources.tool).toBe(1);
    expect(loaded.boats![0].resources.cookedFish).toBe(0);
    expect(loaded.resources.cookedFish).toBe(state.resources.cookedFish);
    await openBoat(page);
    if ((await cargo.getAttribute('open')) === null) await cargo.locator('summary').click();
    await cargo.getByRole('button', { name: 'Prepara scarico selezionato', exact: true }).click();
    const unloadPrepared = await saved(page);
    expect(unloadPrepared.stats.commands).toBe(1);
    expect(unloadPrepared.resources.tool).toBe(0);
    expect(unloadPrepared.boats![0].resources.tool).toBe(1);
    expect(unloadPrepared.voice).toBe(loaded.voice);
    await page.getByRole('button', { name: 'Pronuncia', exact: true }).click();
    await run(page, 4_000);
    const delivered = await saved(page);
    expect(delivered.stats.commands).toBe(2);
    expect(delivered.resources.tool).toBe(1);
    expect(delivered.boats![0].resources.tool).toBe(0);
    expect(delivered.resources.cookedFish).toBe(state.resources.cookedFish);
    expect(validSave(delivered)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
