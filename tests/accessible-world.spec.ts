import { expect, test, type Page } from '@playwright/test';

/** Isolated map fixtures exercise selection and paint scheduling, not campaign progress. */
async function showWorld(page: Page, waitForAtlas = true) {
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.setTransform;
    Object.assign(window, { mapPaints: 0 });
    CanvasRenderingContext2D.prototype.setTransform = function (...args) {
      if (this.canvas.isConnected && this.canvas.classList.contains('lingus-world__canvas'))
        (window as unknown as { mapPaints: number }).mapPaints++;
      return original.apply(this, args as Parameters<typeof original>);
    };
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (waitForAtlas) => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { default: DOM } = await import('/node_modules/.vite/deps/react-dom.js');
    const { WorldMap } = await import('/src/components/WorldMap.tsx');
    const { createGame } = await import('/src/game/engine.ts');
    const { ensureNaturalAtlas } = await import('/src/components/mapNaturalAtlas.ts');
    let state = createGame(6842, 'guided');
    Object.assign(state, { started: true, paused: true, time: 20 });
    state.buildings = [];
    state.cities = [];
    state.factions = [];
    state.sparks = [];
    state.units = state.units.slice(0, 1);
    Object.assign(state.units[0], { x: 250, y: 252, hp: 100, age: 6, action: 'idle' });
    state.entities = [
      {
        id: 'keyboard-tree',
        kind: 'tree',
        x: 242,
        y: 246,
        amount: 20,
        maxAmount: 20,
        hp: 100,
        maxHp: 100,
      },
      {
        id: 'unrevealed-ore',
        kind: 'ore',
        x: 260,
        y: 250,
        amount: 20,
        maxAmount: 20,
        hp: 100,
        maxHp: 100,
      },
      {
        id: 'unexplored-tree',
        kind: 'tree',
        x: 310,
        y: 250,
        amount: 20,
        maxAmount: 20,
        hp: 100,
        maxHp: 100,
      },
    ];
    if (waitForAtlas) await ensureNaturalAtlas();
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;overflow:hidden';
    const host = document.createElement('div');
    host.id = 'world-fixture';
    host.style.cssText = 'width:100vw;height:100vh;position:relative';
    document.body.append(host);
    const root = ReactDOM.createRoot(host);
    const render = () =>
      DOM.flushSync(() =>
        root.render(
          React.createElement(WorldMap, {
            state,
            selectedTarget: null,
            onSelect: (target: { type: string; id?: string; x: number; y: number }) => {
              document.body.dataset.worldSelection = JSON.stringify(target);
            },
          }),
        ),
      );
    let clock = 0;
    Object.assign(window, {
      mapPaints: 0,
      moveWorldPerson() {
        state = { ...state, units: [{ ...state.units[0], x: 252 }] };
        render();
      },
      startWorldClock() {
        state = { ...state, paused: false };
        render();
        clock = window.setInterval(() => {
          state = { ...state, time: state.time + 0.1 };
          render();
        }, 100);
      },
      stopWorldClock() {
        clearInterval(clock);
      },
      readWorldState() {
        return JSON.stringify(state);
      },
    });
    render();
  }, waitForAtlas);
  await expect(page.getByRole('img', { name: /Mappa della valle/ })).toBeVisible();
  await page.waitForFunction(() => (window as unknown as { mapPaints: number }).mapPaints > 0);
}

const paintCount = (page: Page) =>
  page.evaluate(() => (window as unknown as { mapPaints: number }).mapPaints);

test('keyboard selection exposes only visible known descriptions and returns the real target', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await showWorld(page);
  const canvas = page.getByRole('img', { name: /Mappa della valle/ });
  await canvas.focus();
  await page.keyboard.press('e');
  const list = page.getByRole('region', { name: 'Elementi visibili sulla mappa' });
  await expect(list).toBeVisible();
  await expect(list).not.toContainText('Korg');
  await expect(list).not.toContainText('Minerale');
  const search = list.getByRole('searchbox', { name: 'Cerca tra gli elementi visibili' });
  await expect(search).toBeFocused();
  await search.fill('ostacolo');
  await expect(list.getByRole('button', { name: /Un ostacolo senza nome/ })).toHaveCount(1);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(list.getByRole('button', { name: /Un ostacolo senza nome/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(list).not.toBeVisible();
  await expect(canvas).toBeFocused();
  expect(await page.evaluate(() => JSON.parse(document.body.dataset.worldSelection!))).toEqual({
    type: 'entity',
    id: 'keyboard-tree',
    x: 242,
    y: 246,
  });
  const state = await page.evaluate(() =>
    JSON.parse((window as unknown as { readWorldState(): string }).readWorldState()),
  );
  expect(state.stats.commands).toBe(0);
  expect(state.resources.wood).toBe(0);
  expect(
    state.entities.find((entity: { id: string }) => entity.id === 'keyboard-tree').amount,
  ).toBe(20);
});

test('a paused map paints on input and snapshot changes without a continuous draw loop', async ({
  page,
}) => {
  await showWorld(page);
  await page.waitForTimeout(180);
  const before = await paintCount(page);
  await page.waitForTimeout(220);
  expect(await paintCount(page)).toBe(before);
  await page.getByRole('button', { name: 'Ingrandisci la mappa' }).click();
  await expect.poll(() => paintCount(page)).toBeGreaterThan(before);
  const zoomed = await paintCount(page);
  await page.evaluate(() => (window as unknown as { moveWorldPerson(): void }).moveWorldPerson());
  await expect.poll(() => paintCount(page)).toBeGreaterThan(zoomed);
  const moved = await paintCount(page);
  const canvas = page.getByRole('img', { name: /Mappa della valle/ });
  const bounds = (await canvas.boundingBox())!;
  const scale = Math.max(bounds.width / 1200, bounds.height / 800) * 4.8;
  await canvas.hover({
    position: { x: bounds.width / 2 - 8 * 2.4 * scale, y: bounds.height / 2 - 4 * 1.6 * scale },
  });
  await expect(page.getByRole('status', { name: 'Dettagli del bersaglio' })).toBeVisible();
  await expect.poll(() => paintCount(page)).toBeGreaterThan(moved);
  await page.waitForTimeout(100);
  const settled = await paintCount(page);
  await page.waitForTimeout(180);
  expect(await paintCount(page)).toBe(settled);
});

test('an atlas that finishes loading after pause repaints once and then settles', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/art/valley-natural-atlas.png', async (route) => {
    await gate;
    await route.continue();
  });
  await showWorld(page, false);
  await page.waitForTimeout(100);
  const before = await paintCount(page);
  release();
  await page.evaluate(async () => {
    const { ensureNaturalAtlas } = await import('/src/components/mapNaturalAtlas.ts');
    if (!(await ensureNaturalAtlas())) throw new Error('The delayed atlas did not load');
  });
  await expect.poll(() => paintCount(page)).toBeGreaterThan(before);
  await page.waitForTimeout(100);
  const settled = await paintCount(page);
  await page.waitForTimeout(180);
  expect(await paintCount(page)).toBe(settled);
});

test('hidden and offscreen maps stop painting and redraw the latest snapshot on return', async ({
  page,
}) => {
  await showWorld(page);
  const initial = await paintCount(page);
  await page.evaluate(() => (window as unknown as { startWorldClock(): void }).startWorldClock());
  await expect.poll(() => paintCount(page)).toBeGreaterThan(initial + 3);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hidden = await paintCount(page);
  await page.waitForTimeout(240);
  expect(await paintCount(page)).toBe(hidden);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => paintCount(page)).toBeGreaterThan(hidden);
  await page.evaluate(() => {
    document.getElementById('world-fixture')!.style.display = 'none';
  });
  await page.waitForTimeout(100);
  const offscreen = await paintCount(page);
  await page.waitForTimeout(240);
  expect(await paintCount(page)).toBe(offscreen);
  await page.evaluate(() => {
    document.getElementById('world-fixture')!.style.display = '';
  });
  await expect.poll(() => paintCount(page)).toBeGreaterThan(offscreen);
  await page.evaluate(() => (window as unknown as { stopWorldClock(): void }).stopWorldClock());
});

test('visible targets remain reachable in a short phone map without shrinking touch targets', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await showWorld(page);
  await page.evaluate(() => {
    document.getElementById('world-fixture')!.style.height = '210px';
  });
  const canvas = page.getByRole('img', { name: /Mappa della valle/ });
  await expect.poll(async () => (await canvas.boundingBox())!.height).toBe(210);
  await canvas.focus();
  await page.keyboard.press('e');
  const list = page.getByRole('region', { name: 'Elementi visibili sulla mappa' });
  const target = list.getByRole('button', { name: /Un ostacolo senza nome/ });
  await target.scrollIntoViewIfNeeded();
  const touchTarget = (await target.boundingBox())!;
  const panel = (await list.boundingBox())!;
  expect(touchTarget.height).toBeGreaterThanOrEqual(44);
  expect(touchTarget.y).toBeGreaterThanOrEqual(panel.y);
  expect(touchTarget.y + touchTarget.height).toBeLessThanOrEqual(panel.y + panel.height);
  expect(panel.height).toBeLessThanOrEqual(194);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await target.click();
  await expect(list).not.toBeVisible();
  await expect(canvas).toBeFocused();
  expect(
    await page.evaluate(() => JSON.parse(document.body.dataset.worldSelection!)),
  ).toMatchObject({
    type: 'entity',
    id: 'keyboard-tree',
  });
});
