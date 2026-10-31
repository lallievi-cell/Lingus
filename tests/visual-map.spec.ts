import { expect, test, type Page } from '@playwright/test';

type Scene = 'person' | 'tree' | 'hut';

// Isolated renderer fixtures. These verify pointer selection against the painted
// silhouettes; they do not claim to represent an ordinary campaign progression.
async function showScene(page: Page, scene: Scene) {
  await page.goto('/');
  await page.evaluate(async (scene) => {
    const reactModule = await import('/node_modules/.vite/deps/react.js');
    const React = reactModule.default;
    const rootModule = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { createRoot } = rootModule.default;
    const { WorldMap } = await import('/src/components/WorldMap.tsx');
    const { createGame } = await import('/src/game/engine.ts');
    const state = createGame(6842);
    Object.assign(state, { started: true, paused: true, time: 20 });
    state.entities = [];
    state.buildings = [];
    state.cities = [];
    state.factions = [];
    state.sparks = [];
    state.units = scene === 'person' ? state.units.slice(0, 1) : [];
    if (state.units[0]) Object.assign(state.units[0], { x: 250, y: 252, age: 6, action: 'idle' });
    for (const id of ['S_02', 'O_01', 'O_02', 'O_03', 'O_08'])
      state.words[id] = { retention: 100, custodians: state.units.map((u) => u.id), uses: 0 };
    if (scene === 'tree')
      state.entities = [
        {
          id: 'painted-tree',
          kind: 'tree',
          x: 250,
          y: 251,
          amount: 20,
          maxAmount: 20,
          hp: 100,
          maxHp: 100,
        },
        {
          id: 'physical-pile',
          kind: 'ground',
          resource: 'wood',
          x: 250,
          y: 251,
          amount: 5,
          maxAmount: 5,
          hp: 0,
          maxHp: 1,
        },
      ];
    if (scene === 'hut')
      state.buildings = [{ id: 'painted-hut', kind: 'hut', x: 250, y: 252, hp: 100, active: true }];
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;overflow:hidden';
    const host = document.createElement('div');
    host.style.cssText = 'width:100vw;height:100vh;position:relative';
    document.body.append(host);
    const receive = (target: { type: string; id?: string; x: number; y: number }) => {
      document.body.dataset.selection = JSON.stringify(target);
    };
    createRoot(host).render(
      React.createElement(WorldMap, { state, selectedTarget: null, onSelect: receive }),
    );
  }, scene);
  await expect(page.getByRole('img', { name: /Mappa della valle/ })).toBeVisible();
}

async function pinchTo(page: Page, previous: number, desired: number) {
  const bounds = (await page.getByRole('img', { name: /Mappa della valle/ }).boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height / 2;
  const finger = (id: number, px: number) => ({ id, x: px, y, radiusX: 3, radiusY: 3, force: 1 });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [finger(1, x - 20), finger(2, x + 20)],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    // Keep the midpoint fixed: translated pinches deliberately pan the map.
    touchPoints: [
      finger(1, x - (20 * desired) / previous),
      finger(2, x + (20 * desired) / previous),
    ],
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.lingus-world__control-stack > span')).toHaveText(
    `${Math.round(desired * 100)}%`,
  );
  await session.detach();
}

async function clickArt(
  page: Page,
  zoom: number,
  x: number,
  y: number,
  localHeight = 0,
  kind: 'unit' | 'other' = 'other',
) {
  const map = page.getByRole('img', { name: /Mappa della valle/ });
  const bounds = (await map.boundingBox())!;
  const scale = Math.max(bounds.width / 1200, bounds.height / 800) * zoom;
  const spriteScale = await page.evaluate(async (kind) => {
    const art = await import('/src/components/mapDrawing.ts');
    return kind === 'unit' ? art.UNIT_ART_SCALE : art.SPRITE_SCALE;
  }, kind);
  await map.click({
    position: {
      x: bounds.width / 2 + (x - 250) * 2.4 * scale,
      y: bounds.height / 2 + ((y - 250) * 1.6 - localHeight * spriteScale) * scale,
    },
  });
  return page.evaluate(() => JSON.parse(document.body.dataset.selection ?? '{}'));
}

for (const mobile of [false, true]) {
  const device = mobile ? 'narrow screen' : 'desktop';
  test(`painted person head remains selectable at high zoom on ${device}`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 780 } : { width: 1080, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await showScene(page, 'person');
    let previous = 4.5;
    for (const zoom of [10, 16]) {
      await pinchTo(page, previous, zoom);
      expect(await clickArt(page, zoom, 250, 252, 28, 'unit')).toMatchObject({
        type: 'unit',
        x: 250,
        y: 252,
      });
      previous = zoom;
    }
    expect(errors).toEqual([]);
  });

  test(`painted tree crown and extracted pile stay distinct on ${device}`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 780 } : { width: 1080, height: 900 });
    await showScene(page, 'tree');
    await pinchTo(page, 4.5, 10);
    expect(await clickArt(page, 10, 250, 251, 55)).toMatchObject({
      type: 'entity',
      id: 'painted-tree',
    });
    // The physical pile is displayed beside its source. Selection must still
    // return its authoritative coordinates, rather than that visual offset.
    expect(await clickArt(page, 10, 255, 255)).toMatchObject({
      type: 'entity',
      id: 'physical-pile',
      x: 250,
      y: 251,
    });
    await pinchTo(page, 10, 16);
    expect(await clickArt(page, 16, 250, 251, 55)).toMatchObject({
      type: 'entity',
      id: 'painted-tree',
    });
  });

  test(`painted hut roof remains selectable at high zoom on ${device}`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 780 } : { width: 1080, height: 900 });
    await showScene(page, 'hut');
    let previous = 4.5;
    for (const zoom of [10, 16]) {
      await pinchTo(page, previous, zoom);
      expect(await clickArt(page, zoom, 250, 252, 40)).toMatchObject({
        type: 'building',
        id: 'painted-hut',
      });
      previous = zoom;
    }
  });
}
