import { expect, test } from '@playwright/test';

test('the real regional overview keeps every city name inside a narrow canvas', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 650 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { default: DOM } = await import('/node_modules/.vite/deps/react-dom.js');
    const { createGame } = await import('/src/game/engine.ts');
    const { WorldMap } = await import('/src/components/WorldMap.tsx');
    const { WORD_ORDER } = await import('/src/game/content.ts');
    const { ensureNaturalAtlas } = await import('/src/components/mapNaturalAtlas.ts');
    await ensureNaturalAtlas();
    // Prepared late-era view: real generated geography and all natural entities,
    // with discoveries revealed for a camera/readability check, not campaign proof.
    const state = createGame(42, 'classic', 'random', 1000);
    Object.assign(state, { started: true, paused: true, tier: 4, urbanized: true, time: 20 });
    state.sectors.forEach((sector) => (sector.explored = true));
    for (const id of WORD_ORDER)
      state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
    const names = new Set(state.cities.map((city) => city.name));
    const bounds: {
      name: string;
      left: number;
      right: number;
      canvasWidth: number;
      fontPixels: number;
      baseline: number;
      cohortBaseline?: number;
    }[] = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (name, x, y, maxWidth) {
      if (names.has(name) && this.canvas.classList.contains('lingus-world__canvas')) {
        const transform = this.getTransform();
        const width = Math.min(this.measureText(name).width, maxWidth ?? Infinity) * transform.a;
        const center = x * transform.a + transform.e;
        bounds.push({
          name,
          left: center - width / 2,
          right: center + width / 2,
          canvasWidth: this.canvas.width,
          fontPixels: (parseFloat(this.font) * transform.a) / devicePixelRatio,
          baseline: (y * transform.d + transform.f) / devicePixelRatio,
        });
      }
      if (/^\d+$/.test(name) && this.canvas.classList.contains('lingus-world__canvas')) {
        const label = bounds.at(-1);
        if (label && label.cohortBaseline === undefined) {
          const transform = this.getTransform();
          label.cohortBaseline = (y * transform.d + transform.f) / devicePixelRatio;
        }
      }
      if (maxWidth === undefined) original.call(this, name, x, y);
      else original.call(this, name, x, y, maxWidth);
    };
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;overflow:hidden';
    const host = document.createElement('main');
    host.style.cssText = 'width:100vw;height:100vh;position:relative';
    document.body.append(host);
    DOM.flushSync(() =>
      ReactDOM.createRoot(host).render(
        React.createElement(WorldMap, { state, selectedTarget: null, onSelect() {} }),
      ),
    );
    Object.assign(window, { overviewNames: bounds });
  });
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { overviewNames: unknown[] }).overviewNames.length),
    )
    .toBeGreaterThanOrEqual(4);
  const names = await page.evaluate(
    () =>
      (
        window as unknown as {
          overviewNames: {
            name: string;
            left: number;
            right: number;
            canvasWidth: number;
            fontPixels: number;
            baseline: number;
            cohortBaseline?: number;
          }[];
        }
      ).overviewNames,
  );
  expect(new Set(names.map((entry) => entry.name)).size).toBe(4);
  for (const name of names) {
    expect(name.fontPixels).toBeGreaterThanOrEqual(9.9);
    expect(name.cohortBaseline).toBeDefined();
    expect(name.cohortBaseline! - name.baseline).toBeGreaterThanOrEqual(11.9);
    expect(name.left).toBeGreaterThanOrEqual(7.9);
    expect(name.right).toBeLessThanOrEqual(name.canvasWidth - 7.9);
  }
  await page.screenshot({ path: test.info().outputPath('real-region-overview-390.png') });
});

test('a populated overview avoids full limb painting while keeping state and resource appearances intact', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createGame } = await import('/src/game/engine.ts');
    const { createTerrain, drawWorld } = await import('/src/components/mapDrawing.ts');
    const { drawOverviewNature } = await import('/src/components/mapOverviewArt.ts');
    const { ensureNaturalAtlas } = await import('/src/components/mapNaturalAtlas.ts');
    const { WORD_ORDER } = await import('/src/game/content.ts');
    await ensureNaturalAtlas();
    const state = createGame(42, 'classic', 'random', 1000);
    Object.assign(state, { started: true, paused: true, tier: 4, urbanized: true, time: 20 });
    state.sectors.forEach((sector) => (sector.explored = true));
    for (const id of WORD_ORDER)
      state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
    const before = JSON.stringify(state);
    const terrain = createTerrain(42, 0, state);
    const canvas = document.createElement('canvas');
    canvas.width = 1800;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d')!;
    let saves = 0;
    const originalSave = ctx.save.bind(ctx);
    ctx.save = () => {
      saves++;
      originalSave();
    };
    const paint = (scale: number) => {
      saves = 0;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawWorld(ctx, state, terrain, 20, null, null, false);
      return saves;
    };
    paint(0.6); // Populate small composites before measuring steady rendering.
    const overview = paint(0.6);
    const detailed = paint(0.7);
    const tree = { ...state.entities.find((entity) => entity.kind === 'tree')! };
    const sample = document.createElement('canvas');
    sample.width = 160;
    sample.height = 120;
    const painter = sample.getContext('2d')!;
    const snapshot = (season: number, unknown: boolean) => {
      painter.clearRect(0, 0, 160, 120);
      drawOverviewNature(painter, tree, season, unknown, 80, 100, 1);
      return sample.toDataURL();
    };
    const living = snapshot(0, false);
    const unknown = snapshot(0, true);
    const winter = snapshot(3, false);
    tree.amount = 0;
    const exhausted = snapshot(0, false);
    return {
      overview,
      detailed,
      unchanged: before === JSON.stringify(state),
      entities: state.entities.length,
      distinct: new Set([living, unknown, winter, exhausted]).size,
    };
  });
  expect(result.entities).toBeGreaterThan(1700);
  expect(result.overview).toBeLessThan(result.detailed / 2);
  expect(result.unchanged).toBe(true);
  expect(result.distinct).toBe(4);
});
