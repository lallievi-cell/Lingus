import { expect, test, type Page } from '@playwright/test';

test.use({
  viewport: { width: 384, height: 720 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1.5,
});

/** Isolates the real WorldMap: no simulated game order, geometry or gesture handler. */
async function mapScene(
  page: Page,
  scenario: 'empty' | 'rock' | 'overlap' = 'empty',
  height = 300,
) {
  await page.goto('/');
  await page.evaluate(
    async ({ scenario, height }) => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default;
      const ReactDOM = await import('/node_modules/.vite/deps/react-dom_client.js');
      const createRoot = ReactDOM.createRoot ?? ReactDOM.default.createRoot;
      const { WorldMap } = await import('/src/components/WorldMap.tsx');
      const { createGame } = await import('/src/game/engine.ts');
      const state = createGame(6842, 'guided');
      Object.assign(state, {
        started: true,
        paused: true,
        time: 20,
        cities: [],
        factions: [],
        units: [],
        entities: [],
        buildings: [],
        sparks: [],
      });
      for (const id of ['O_02', 'O_08'])
        state.words[id] = { retention: 100, custodians: [], uses: 0 };
      if (scenario === 'rock')
        state.entities = [
          { id: 'rock', kind: 'stone', x: 245, y: 237, amount: 20, hp: 100, maxHp: 100 },
        ];
      if (scenario === 'overlap')
        state.units = ['first', 'second', 'third'].map((id) => ({
          ...createGame().units[0],
          id,
          x: 250,
          y: 250,
          hp: 100,
        }));
      (window as any).__mapTouch = { selections: [], groupCalls: 0 };
      document.body.innerHTML = '<div id="touch-fixture"></div>';
      document.body.style.margin = '0';
      const h = React.createElement;
      function Scene() {
        const [selected, setSelected] = React.useState(null);
        return h(
          'div',
          { style: { width: '100vw' } },
          h(
            'div',
            { style: { height, position: 'relative' } },
            h(WorldMap, {
              state,
              selectedTarget: selected,
              onSelect: (target: any) => {
                (window as any).__mapTouch.selections.push(target);
                setSelected(target);
              },
              onSelectGroupAnchor: () => (window as any).__mapTouch.groupCalls++,
            }),
          ),
          h(
            'button',
            { onClick: () => setSelected(null), style: { minHeight: 44 } },
            'Azzera bersaglio',
          ),
        );
      }
      createRoot(document.getElementById('touch-fixture')!).render(h(Scene));
    },
    { scenario, height },
  );
  const map = page.getByRole('img', { name: /Mappa della valle/ });
  await expect(map).toBeVisible();
  await expect.poll(async () => (await map.boundingBox())?.height).toBe(height);
  await expect.poll(async () => Number(await map.getAttribute('height'))).toBe(height * 1.5);
  return map;
}

async function touchState(page: Page) {
  return page.evaluate(() => (window as any).__mapTouch);
}

test('off-centre pinch follows the held world point, with no stray selection on two-to-one finger release', async ({
  page,
}) => {
  const map = await mapScene(page);
  const box = (await map.boundingBox())!;
  const x = box.x + box.width * 0.6,
    y = box.y + box.height * 0.6;
  await page.touchscreen.tap(x, y);
  const first = (await touchState(page)).selections[0];
  expect(first.type).toBe('point');
  await page.getByRole('button', { name: 'Azzera bersaglio' }).tap();
  const cdp = await page.context().newCDPSession(page);
  const finger = (id: number, px: number, py: number) => ({
    id,
    x: px,
    y: py,
    radiusX: 5,
    radiusY: 5,
    force: 1,
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [finger(1, x - 20, y), finger(2, x + 20, y)],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [finger(1, x - 30, y + 5), finger(2, x + 50, y + 5)],
  });
  await expect(page.locator('.lingus-world__control-stack')).toContainText('900');
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [finger(2, x + 50, y + 5)],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [finger(2, x + 70, y + 10)],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect((await touchState(page)).selections).toHaveLength(1);
  await page.touchscreen.tap(x + 10, y + 5);
  const second = (await touchState(page)).selections[1];
  expect(second.type).toBe('point');
  expect(second.x).toBeCloseTo(first.x, 1);
  expect(second.y).toBeCloseTo(first.y, 1);
});

test('touch drag, double tap and cancelled gesture never silently reselect the group', async ({
  page,
}) => {
  const map = await mapScene(page);
  const box = (await map.boundingBox())!;
  const x = box.x + box.width * 0.5,
    y = box.y + box.height * 0.5;
  const cdp = await page.context().newCDPSession(page);
  const finger = (px: number, py: number) => ({
    id: 1,
    x: px,
    y: py,
    radiusX: 5,
    radiusY: 5,
    force: 1,
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger(x, y)] });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [finger(x + 35, y + 20)],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect((await touchState(page)).selections).toHaveLength(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger(x, y)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  expect((await touchState(page)).selections).toHaveLength(0);
  await page.touchscreen.tap(x, y);
  await page.touchscreen.tap(x, y);
  expect((await touchState(page)).selections).toHaveLength(2);
  expect((await touchState(page)).groupCalls).toBe(0);
  // Right click and double click remain available to a real mouse after touch.
  await map.click({ button: 'right', position: { x: box.width * 0.5, y: box.height * 0.5 } });
  expect((await touchState(page)).groupCalls).toBe(1);
  await map.dblclick({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
  expect((await touchState(page)).groupCalls).toBe(2);
});

test('a mobile resource card moves away from an upper-map target and retains readable explanation', async ({
  page,
}) => {
  const map = await mapScene(page, 'rock');
  const box = (await map.boundingBox())!;
  const scale = Math.max(box.width / 1200, box.height / 800) * 4.5;
  const x = box.x + box.width / 2 - 5 * 2.4 * scale;
  const y = box.y + box.height / 2 - 13 * 1.6 * scale - 16 * 0.2 * scale;
  await page.touchscreen.tap(x, y);
  const card = page.getByRole('status', { name: 'Dettagli del bersaglio' });
  await expect(card).toContainText('Affioramento di selce');
  await expect(card).toContainText('Colpire stacca materiale');
  await expect(card).toHaveAttribute('data-mobile-placement', 'bottom');
  const bounds = (await card.boundingBox())!;
  expect(y < bounds.y || y > bounds.y + bounds.height).toBe(true);
  await card.focus();
  await expect(card).toBeFocused();
});

test('overlap choice and close remain inside a short map with a scrollable list', async ({
  page,
}) => {
  const map = await mapScene(page, 'overlap', 130);
  const box = (await map.boundingBox())!;
  const scale = Math.max(box.width / 1200, box.height / 800) * 4.5;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2 - 14 * 0.2 * scale);
  const choice = page.getByRole('group', { name: 'Scegli tra gli elementi sovrapposti' });
  await expect(choice).toBeVisible();
  const bounds = (await choice.boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(box.y);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(box.y + box.height);
  const options = choice.locator('[data-target-choice]');
  expect(await options.count()).toBeGreaterThan(1);
  const option = options.first();
  const optionBounds = (await option.boundingBox())!;
  const listBounds = (await choice.locator('.map-target-choice-list').boundingBox())!;
  expect(Math.round(optionBounds.height * 100) / 100).toBeGreaterThanOrEqual(44);
  expect(optionBounds.y + optionBounds.height).toBeLessThanOrEqual(
    listBounds.y + listBounds.height + 1,
  );
  await options.last().scrollIntoViewIfNeeded();
  await expect(options.last()).toBeInViewport();
  await choice.getByRole('button', { name: 'Chiudi scelta bersaglio' }).tap();
  await expect(choice).toHaveCount(0);
});
