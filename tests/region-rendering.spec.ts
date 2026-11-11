import { expect, test, type Page } from '@playwright/test';

/** Prepared renderer scenes test the real camera and picking. They do not
 * represent an ordinary campaign's population, discoveries or settlements. */
async function showMap(page: Page, worldSize: 500 | 1000, tier = 2) {
  await page.goto('/');
  const scene = await page.evaluate(
    async ({ worldSize, tier }) => {
      const { default: React } = await import('/node_modules/.vite/deps/react.js');
      const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
      const { default: DOM } = await import('/node_modules/.vite/deps/react-dom.js');
      const { createGame } = await import('/src/game/engine.ts');
      const { WORD_ORDER } = await import('/src/game/content.ts');
      const { WorldMap } = await import('/src/components/WorldMap.tsx');
      const { ensureNaturalAtlas } = await import('/src/components/mapNaturalAtlas.ts');
      await ensureNaturalAtlas();
      let state = createGame(42, 'classic', 'random', worldSize);
      const city = {
        ...state.cities[0],
        id: 'regional-city',
        name: 'Riva lontana',
        x: 850,
        y: 850,
        sectorX: 8,
        sectorY: 8,
      };
      Object.assign(state, {
        started: true,
        paused: true,
        time: 20,
        tier,
        entities: [],
        buildings: [],
        cities: [],
        factions: [],
        sparks: [],
      });
      state.sectors.forEach((sector) => {
        sector.explored = true;
      });
      state.units = state.units.slice(0, 1);
      Object.assign(state.units[0], {
        x: state.home.x + 20,
        y: state.home.y + 6,
        age: 6,
        hp: 100,
        hunger: 0,
        temp: 100,
        action: 'idle',
      });
      for (const id of WORD_ORDER)
        state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
      let focusRequest: { x: number; y: number; nonce: number } | undefined;
      let nonce = 0;
      document.body.innerHTML = '';
      document.body.style.cssText = 'margin:0;overflow:hidden';
      const host = document.createElement('main');
      host.style.cssText = 'width:100vw;height:100vh;position:relative';
      document.body.append(host);
      const root = ReactDOM.createRoot(host);
      const render = () =>
        DOM.flushSync(() =>
          root.render(
            React.createElement(WorldMap, {
              state,
              selectedTarget: null,
              focusRequest,
              onSelect(target: { type: string; id?: string; x: number; y: number }) {
                document.body.dataset.regionSelection = JSON.stringify(target);
              },
            }),
          ),
        );
      Object.assign(window, {
        regionSnapshot: () => JSON.stringify(state),
        focusRemotePerson() {
          state = { ...state, units: [{ ...state.units[0], x: 830, y: 760 }] };
          focusRequest = { x: 830, y: 760, nonce: ++nonce };
          render();
        },
        enterRegionalEra() {
          state = { ...state, tier: 4, urbanized: true, cities: [city], units: [] };
          focusRequest = undefined;
          render();
        },
      });
      render();
      return {
        home: state.home,
        unit: { id: state.units[0].id, x: state.units[0].x, y: state.units[0].y },
      };
    },
    { worldSize, tier },
  );
  await expect(page.getByRole('img', { name: /Mappa della valle/ })).toBeVisible();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))),
      ),
  );
  return scene;
}

const map = (page: Page) => page.getByRole('img', { name: /Mappa della valle/ });
const zoom = (page: Page) => page.locator('.lingus-world__control-stack');
const readSnapshot = (page: Page) =>
  page.evaluate(() => (window as unknown as { regionSnapshot(): string }).regionSnapshot());

test('a new mobile story paints the regional camp without browser errors', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 650 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page
    .getByRole('dialog', { name: 'Benvenuto in Lingus' })
    .getByRole('button', { name: /Dai inizio alla storia/ })
    .click();
  await page.getByRole('button', { name: 'Metti in pausa' }).click();
  await expect(map(page)).toBeVisible();
  // A canvas can remain selectable even when its drawing frame throws. Sample
  // its actual pixels so a blank opaque canvas cannot pass as a painted map.
  await expect
    .poll(() =>
      map(page).evaluate((element) => {
        const canvas = element as HTMLCanvasElement;
        const ctx = canvas.getContext('2d')!;
        const colors = new Set<string>();
        for (let row = 1; row < 10; row++)
          for (let column = 1; column < 10; column++) {
            const [r, g, b] = ctx.getImageData(
              Math.floor((canvas.width * column) / 10),
              Math.floor((canvas.height * row) / 10),
              1,
              1,
            ).data;
            colors.add(`${r},${g},${b}`);
          }
        return colors.size;
      }),
    )
    .toBeGreaterThan(20);
  expect(errors).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('region-new-story-390.png') });
});

test('a larger region keeps the local camera scale and can focus a person beyond the old valley', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 650 });
  for (const worldSize of [500, 1000] as const) {
    const scene = await showMap(page, worldSize);
    await expect(zoom(page)).toContainText('450%');
    const bounds = (await map(page).boundingBox())!;
    const scale = Math.max(bounds.width / 1200, bounds.height / 800) * 4.5;
    await map(page).click({
      position: {
        x: bounds.width / 2 + (scene.unit.x - scene.home.x) * 2.4 * scale,
        y: bounds.height / 2 + ((scene.unit.y - scene.home.y) * 1.6 - 28 * 0.3) * scale,
      },
    });
    expect(await page.evaluate(() => JSON.parse(document.body.dataset.regionSelection!))).toEqual({
      type: 'unit',
      ...scene.unit,
    });
    if (worldSize === 1000) {
      await page.evaluate(() =>
        (window as unknown as { focusRemotePerson(): void }).focusRemotePerson(),
      );
      await page.mouse.move(1, 1);
      await page.waitForTimeout(100);
      const before = await readSnapshot(page);
      await map(page).click({
        position: { x: bounds.width / 2, y: bounds.height / 2 - 28 * 0.3 * scale },
      });
      expect(await page.evaluate(() => JSON.parse(document.body.dataset.regionSelection!))).toEqual(
        { type: 'unit', id: scene.unit.id, x: 830, y: 760 },
      );
      expect(await readSnapshot(page)).toBe(before);
      await page.mouse.move(1, 1);
      await page.waitForTimeout(100);
      const still = await map(page).evaluate((element) =>
        (element as HTMLCanvasElement).toDataURL(),
      );
      await page.waitForTimeout(180);
      expect(
        await map(page).evaluate((element) => (element as HTMLCanvasElement).toDataURL()),
      ).toBe(still);
      await page.screenshot({ path: test.info().outputPath('region-local-person-390.png') });
    }
  }
});

test('the urban transition reveals the full region and its distant city remains selectable on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 650 });
  await showMap(page, 1000, 3);
  await expect(zoom(page)).toContainText('450%');
  await page.evaluate(() => (window as unknown as { enterRegionalEra(): void }).enterRegionalEra());
  await expect(zoom(page)).toContainText('50%');
  await page.getByRole('button', { name: 'Riduci la mappa', exact: true }).click();
  await expect(zoom(page)).toContainText('45%');
  const bounds = (await map(page).boundingBox())!;
  const scale = Math.min(bounds.width / 1200, bounds.height / 800) * 0.45;
  const before = await readSnapshot(page);
  await map(page).click({
    position: {
      x: bounds.width / 2 + (850 - 500) * 2.4 * scale,
      y: bounds.height / 2 + (850 - 500) * 1.6 * scale,
    },
  });
  expect(await page.evaluate(() => JSON.parse(document.body.dataset.regionSelection!))).toEqual({
    type: 'city',
    id: 'regional-city',
    x: 850,
    y: 850,
  });
  expect(await readSnapshot(page)).toBe(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('region-overview-390.png') });
});

test('terrain, fog and night lighting cover the part of the region beyond the old 500m boundary', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createGame } = await import('/src/game/engine.ts');
    const { emptyInventory } = await import('/src/game/content.ts');
    const { drawWorld } = await import('/src/components/mapDrawing.ts');
    const state = createGame(42, 'classic', 'random', 1000);
    Object.assign(state, {
      started: true,
      paused: true,
      time: 20,
      tier: 2,
      entities: [],
      units: [],
      buildings: [],
      cities: [],
      sparks: [],
      resources: emptyInventory(),
    });
    state.sectors.forEach((sector) => {
      sector.explored = sector.x !== 8 || sector.y !== 8;
    });
    const terrain = document.createElement('canvas');
    terrain.width = 1200;
    terrain.height = 800;
    const fill = terrain.getContext('2d')!;
    fill.fillStyle = '#d84545';
    fill.fillRect(0, 0, 1200, 800);
    const canvas = document.createElement('canvas');
    canvas.width = 2400;
    canvas.height = 1600;
    const ctx = canvas.getContext('2d')!;
    const pixel = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data];
    drawWorld(ctx, state, terrain, state.time, null, null, false);
    const day = pixel(1800, 1200),
      fog = pixel(2040, 1360);
    state.time = 75;
    drawWorld(ctx, state, terrain, state.time, null, null, false);
    const night = pixel(1800, 1200);
    return { day, fog, night };
  });
  expect(result.day[3]).toBe(255);
  expect(result.day[0] - result.day[1]).toBeGreaterThan(80);
  expect(Math.abs(result.fog[0] - result.fog[1])).toBeLessThan(20);
  expect(result.night[0]).toBeLessThan(result.day[0] - 40);
});
