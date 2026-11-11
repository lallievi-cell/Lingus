import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../src/game/engine';
import { getRiverFords, isLandPoint, type LandPoint } from '../src/game/landNavigation';
import { createRiverArtGeometry } from '../src/game/riverGeometry';
import type { GameState, WorldTarget } from '../src/game/types';
import { closeWordBank, openWordBank } from './mobile-ui';

/** Prepared shoreline scenes exercise real commands and movement, not campaign progress. */
function shoreScene() {
  const state = createGame(6842, 'guided', 'random');
  const fords = [...getRiverFords(state)].sort(
    (a, b) => Math.min(b.x, b.y, 500 - b.x, 500 - b.y) - Math.min(a.x, a.y, 500 - a.x, 500 - a.y),
  );
  for (const ford of fords) {
    const along = { x: -ford.dy, y: ford.dx };
    const start = { x: ford.bankA.x - along.x * 22, y: ford.bankA.y - along.y * 22 };
    const destination = {
      x: ford.bankB.x + ford.dx * 10 + along.x * 22,
      y: ford.bankB.y + ford.dy * 10 + along.y * 22,
    };
    if (!isLandPoint(state, start) || !isLandPoint(state, destination)) continue;
    if (
      [start, destination].some(
        (point) => Math.min(point.x, point.y, 500 - point.x, 500 - point.y) < 65,
      )
    )
      continue;
    const blockedStraightLine = Array.from({ length: 100 }, (_, index) => {
      const t = index / 99;
      return {
        x: start.x + (destination.x - start.x) * t,
        y: start.y + (destination.y - start.y) * t,
      };
    }).some((point) => !isLandPoint(state, point));
    if (!blockedStraightLine) continue;
    const deepWater = createRiverArtGeometry(state)
      .points.filter((point) => {
        const distance = Math.hypot(point.x - start.x, point.y - start.y);
        return distance >= 18 && distance <= 30 && !isLandPoint(state, point);
      })
      .sort(
        (a, b) =>
          Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(b.x - start.x, b.y - start.y),
      )[0];
    if (!deepWater) continue;
    Object.assign(state, {
      started: true,
      paused: true,
      time: 20,
      tier: 2,
      entities: [],
      cities: [],
      factions: [],
      buildings: [],
      sparks: [],
      home: start,
    });
    state.sectors.forEach((sector) => {
      sector.explored = true;
    });
    state.explored = state.sectors.map((sector) => ({
      x: sector.x * 100 + 50,
      y: sector.y * 100 + 50,
    }));
    state.units = state.units.slice(0, 1);
    Object.assign(state.units[0], {
      ...start,
      age: 6,
      hp: 100,
      hunger: 0,
      temp: 100,
      action: 'returning',
      command: ['S_01', 'V_04', 'O_03'],
      carry: { resource: 'wood', amount: 2 },
    });
    for (const id of ['V_04', 'O_03']) {
      state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
      state.units[0].knows.push(id);
    }
    return { state, ford, start, destination, deepWater: { x: deepWater.x, y: deepWater.y } };
  }
  throw new Error('The generated shoreline has no suitable revealed crossing scene.');
}

async function showFordMap(page: Page, state: GameState, center: LandPoint, height = 210) {
  await page.goto('/');
  await page.evaluate(
    async ({ raw, center, height }) => {
      const { default: React } = await import('/node_modules/.vite/deps/react.js');
      const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
      const { default: DOM } = await import('/node_modules/.vite/deps/react-dom.js');
      const { WorldMap } = await import('/src/components/WorldMap.tsx');
      const { ensureNaturalAtlas } = await import('/src/components/mapNaturalAtlas.ts');
      await ensureNaturalAtlas();
      let state: GameState = JSON.parse(raw);
      let selected: WorldTarget | null = null;
      document.body.innerHTML = '';
      document.body.style.cssText = 'margin:0;overflow:hidden';
      const host = document.createElement('main');
      host.style.cssText = `height:${height}px;width:100vw;position:relative`;
      document.body.append(host);
      const root = ReactDOM.createRoot(host);
      const render = () =>
        DOM.flushSync(() =>
          root.render(
            React.createElement(WorldMap, {
              state,
              selectedTarget: selected,
              focusRequest: { ...center, nonce: 1 },
              onSelect: (target: WorldTarget) => {
                selected = target;
                document.body.dataset.fordSelection = JSON.stringify(target);
                render();
              },
            }),
          ),
        );
      Object.assign(window, {
        readFordState: () => JSON.stringify(state),
        hideFord() {
          state = {
            ...state,
            sectors: state.sectors.map((sector) => ({
              ...sector,
              explored:
                sector.x === Math.floor(center.x / 100) && sector.y === Math.floor(center.y / 100)
                  ? false
                  : sector.explored,
            })),
          };
          selected = null;
          render();
        },
        useLegacyMovement() {
          state = {
            ...state,
            mapGeneration: { ...state.mapGeneration! },
            sectors: state.sectors.map((sector) => ({ ...sector, explored: true })),
          };
          delete state.mapGeneration!.landNavigation;
          selected = null;
          render();
        },
      });
      render();
    },
    { raw: JSON.stringify(state), center, height },
  );
  const map = page.getByRole('img', { name: /Mappa della valle/ });
  await expect(map).toBeVisible();
  await expect.poll(async () => (await map.boundingBox())!.height).toBe(height);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))),
      ),
  );
}

async function clickWorldPoint(page: Page, point: LandPoint, center: LandPoint) {
  const map = page.getByRole('img', { name: /Mappa della valle/ });
  const box = (await map.boundingBox())!;
  const scale = Math.max(box.width / 1200, box.height / 800) * 4.5;
  const position = {
    x: box.width / 2 + (point.x - center.x) * 2.4 * scale,
    y: box.height / 2 + (point.y - center.y) * 1.6 * scale,
  };
  expect(position.x).toBeGreaterThan(0);
  expect(position.x).toBeLessThan(box.width);
  expect(position.y).toBeGreaterThan(0);
  expect(position.y).toBeLessThan(box.height);
  await map.click({ position });
  await page.mouse.move(1, 1);
}

async function saveAndRead(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi', exact: true }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const state: GameState = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('lingus.save.v2')!),
  );
  await page.getByRole('button', { name: 'Chiudi finestra', exact: true }).click();
  return state;
}

test('a revealed ford stays selectable in a short mobile map while hidden and legacy crossings stay private', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 568 });
  const { state, ford } = shoreScene();
  await showFordMap(page, state, ford);
  await page.getByRole('button', { name: 'Elementi visibili', exact: true }).click();
  const list = page.getByRole('region', { name: 'Elementi visibili sulla mappa' });
  await list.getByRole('combobox', { name: 'Tipo di elemento visibile' }).selectOption('places');
  const crossing = list.getByRole('button', { name: /Guado del fiume/ }).first();
  await expect(crossing).toBeVisible();
  await crossing.scrollIntoViewIfNeeded();
  expect((await crossing.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await crossing.click();
  await expect(list).not.toBeVisible();
  await expect(page.getByRole('status', { name: 'Dettagli del bersaglio' })).toContainText(
    'Guado del fiume',
  );
  expect(await page.evaluate(() => JSON.parse(document.body.dataset.fordSelection!))).toEqual({
    type: 'point',
    id: ford.id,
    x: ford.x,
    y: ford.y,
  });
  expect(
    await page.evaluate(() =>
      JSON.parse((window as unknown as { readFordState(): string }).readFordState()),
    ),
  ).toEqual(state);
  await page.screenshot({ path: test.info().outputPath('ford-mobile-selection.png') });

  await page.evaluate(() => (window as unknown as { hideFord(): void }).hideFord());
  await page.getByRole('button', { name: 'Elementi visibili', exact: true }).click();
  await list.getByRole('searchbox', { name: 'Cerca tra gli elementi visibili' }).fill('guado');
  await expect(list.getByRole('button', { name: /Guado del fiume/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Chiudi elementi visibili', exact: true }).click();
  await page.evaluate(() =>
    (window as unknown as { useLegacyMovement(): void }).useLegacyMovement(),
  );
  await page.getByRole('button', { name: 'Elementi visibili', exact: true }).click();
  await list.getByRole('searchbox', { name: 'Cerca tra gli elementi visibili' }).fill('guado');
  await expect(list.getByRole('button', { name: /Guado del fiume/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a mobile deep-water order preserves Voice, cargo and the existing task', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { state, start, deepWater } = shoreScene();
  await page.addInitScript(
    (raw) => localStorage.setItem('lingus.save.v2', raw),
    JSON.stringify(state),
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
  const before = await saveAndRead(page);
  await openWordBank(page);
  await page
    .getByRole('button', { name: /^Gruppo:/ })
    .filter({ visible: true })
    .click();
  await page
    .getByRole('button', { name: /^Andare:/ })
    .filter({ visible: true })
    .click();
  await closeWordBank(page);
  await clickWorldPoint(page, deepWater, start);
  await expect(page.getByRole('status', { name: 'Dettagli del bersaglio' })).toContainText(
    'Acqua profonda',
  );
  await page.screenshot({ path: test.info().outputPath('land-water-app-390.png') });
  await page.getByRole('button', { name: 'Pronuncia', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Qui non si può passare a piedi');
  const after = await saveAndRead(page);
  expect(after.voice).toBe(before.voice);
  expect(after.stats.commands).toBe(before.stats.commands);
  expect(after.resources).toEqual(before.resources);
  expect(after.units).toEqual(before.units);
  expect(after.units[0].carry).toEqual({ resource: 'wood', amount: 2 });
});

test('a canvas-selected opposite-bank order actually walks through a ford before arriving', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 568 });
  const { state, ford, destination } = shoreScene();
  await showFordMap(page, state, ford, 500);
  await clickWorldPoint(page, destination, ford);
  const result = await page.evaluate(async () => {
    const { issueCommand, tick } = await import('/src/game/engine.ts');
    const { getRiverFords, isInRiverFord, isLandPoint } = await import(
      '/src/game/landNavigation.ts'
    );
    const target: WorldTarget = JSON.parse(document.body.dataset.fordSelection!);
    let state: GameState = JSON.parse(
      (window as unknown as { readFordState(): string }).readFordState(),
    );
    const before = { voice: state.voice, commands: state.stats.commands };
    state = issueCommand(state, ['S_01', 'V_01'], target);
    const voiceSpent = before.voice - state.voice;
    state.paused = false;
    let usedFord = false,
      dryFeet = true,
      largestStep = 0,
      arrived = false;
    const fords = getRiverFords(state);
    for (let step = 0; step < 240; step++) {
      const previous = { x: state.units[0].x, y: state.units[0].y };
      state = tick(state, 0.25);
      const person = state.units[0];
      largestStep = Math.max(largestStep, Math.hypot(person.x - previous.x, person.y - previous.y));
      dryFeet &&= isLandPoint(state, person);
      usedFord ||= fords.some((ford) => isInRiverFord(person, ford));
      if (!person.command && Math.hypot(person.x - target.x, person.y - target.y) <= 5) {
        arrived = true;
        break;
      }
    }
    return {
      arrived,
      usedFord,
      dryFeet,
      largestStep,
      commands: state.stats.commands - before.commands,
      voiceSpent,
    };
  });
  expect(result.commands).toBe(1);
  expect(result.voiceSpent).toBe(1);
  expect(result.arrived).toBe(true);
  expect(result.usedFord).toBe(true);
  expect(result.dryFeet).toBe(true);
  expect(result.largestStep).toBeLessThanOrEqual(1.000001);
});
