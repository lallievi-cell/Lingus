import { expect, test, type Page } from '@playwright/test';

type LabelReading = {
  name: string;
  left: number;
  right: number;
  canvasWidth: number;
  fontPixels: number;
  baseline: number;
  cohortBaseline?: number;
};

async function showOverview(page: Page, crowded = false) {
  await page.setViewportSize({ width: 390, height: 650 });
  await page.goto('/');
  return page.evaluate(async (crowded) => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { default: DOM } = await import('/node_modules/.vite/deps/react-dom.js');
    const { createGame } = await import('/src/game/engine.ts');
    const { WorldMap } = await import('/src/components/WorldMap.tsx');
    const { WORD_ORDER } = await import('/src/game/content.ts');
    const { ensureNaturalAtlas } = await import('/src/components/mapNaturalAtlas.ts');
    await ensureNaturalAtlas();
    // Prepared late-era camera scenes, not an ordinary economic campaign.
    // The standard scene retains every generated city and natural entity.
    const state = createGame(42, 'classic', 'random', 1000);
    Object.assign(state, { started: true, paused: true, tier: 4, urbanized: true, time: 20 });
    state.sectors.forEach((sector) => (sector.explored = true));
    for (const id of WORD_ORDER)
      state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
    if (crowded) {
      state.entities = [];
      state.cities = Array.from({ length: 40 }, (_, index) => ({
        ...state.cities[0],
        id: `dense-city-${index}`,
        name: `Comunità ${index}`,
        x: 500 + (index % 5) * 2,
        y: 500 + Math.floor(index / 5) * 2,
        sectorX: 5,
        sectorY: 5,
      }));
    }
    const names = new Set(state.cities.map((city) => city.name));
    const readings: LabelReading[] = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (name, x, y, maxWidth) {
      if (names.has(name) && this.canvas.classList.contains('lingus-world__canvas')) {
        const transform = this.getTransform();
        const width = Math.min(this.measureText(name).width, maxWidth ?? Infinity) * transform.a;
        const center = x * transform.a + transform.e;
        readings.push({
          name,
          left: (center - width / 2) / devicePixelRatio,
          right: (center + width / 2) / devicePixelRatio,
          canvasWidth: this.canvas.width / devicePixelRatio,
          fontPixels: (parseFloat(this.font) * transform.a) / devicePixelRatio,
          baseline: (y * transform.d + transform.f) / devicePixelRatio,
        });
      }
      if (/^\d+$/.test(name) && this.canvas.classList.contains('lingus-world__canvas')) {
        const label = readings.at(-1);
        if (label && label.cohortBaseline === undefined) {
          const transform = this.getTransform();
          label.cohortBaseline = (y * transform.d + transform.f) / devicePixelRatio;
        }
      }
      if (maxWidth === undefined) original.call(this, name, x, y);
      else original.call(this, name, x, y, maxWidth);
    };
    const selected = crowded ? state.cities.at(-1)! : undefined;
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;overflow:hidden';
    const host = document.createElement('main');
    host.style.cssText = 'width:100vw;height:100vh;position:relative';
    document.body.append(host);
    DOM.flushSync(() =>
      ReactDOM.createRoot(host).render(
        React.createElement(WorldMap, {
          state,
          selectedTarget: selected
            ? { type: 'city', id: selected.id, x: selected.x, y: selected.y }
            : null,
          onSelect(target: unknown) {
            document.body.dataset.overviewSelection = JSON.stringify(target);
          },
        }),
      ),
    );
    Object.assign(window, {
      overviewNames: readings,
      overviewSnapshot: () => JSON.stringify(state),
    });
    return { cities: state.cities.map(({ id, name }) => ({ id, name })), selected: selected?.name };
  }, crowded);
}

async function readLabels(page: Page): Promise<LabelReading[]> {
  return page.evaluate(() => [
    ...new Map(
      (window as unknown as { overviewNames: LabelReading[] }).overviewNames.map((label) => [
        label.name,
        label,
      ]),
    ).values(),
  ]);
}

function expectReadableLabels(names: LabelReading[]) {
  for (const [index, name] of names.entries()) {
    expect(name.fontPixels).toBeGreaterThanOrEqual(9.9);
    expect(name.cohortBaseline).toBeDefined();
    expect(name.cohortBaseline! - name.baseline).toBeGreaterThanOrEqual(11.9);
    expect(name.left).toBeGreaterThanOrEqual(7.9);
    expect(name.right).toBeLessThanOrEqual(name.canvasWidth - 7.9);
    const top = name.baseline - name.fontPixels - 2,
      bottom = name.cohortBaseline! + 2;
    for (const other of names.slice(index + 1)) {
      const otherTop = other.baseline - other.fontPixels - 2,
        otherBottom = other.cohortBaseline! + 2;
      expect(
        name.left >= other.right - 0.1 ||
          name.right <= other.left + 0.1 ||
          top >= otherBottom - 0.1 ||
          bottom <= otherTop + 0.1,
      ).toBe(true);
    }
  }
}

test('the eight generated cultures retain distinct readable names in the regional phone overview', async ({
  page,
}) => {
  const scene = await showOverview(page);
  expect(scene.cities).toHaveLength(8);
  await expect.poll(async () => (await readLabels(page)).length).toBe(8);
  expectReadableLabels(await readLabels(page));
  await page.screenshot({ path: test.info().outputPath('real-region-overview-390.png') });
});

test('a crowded prepared city cluster keeps its selected name and all other settlements selectable', async ({
  page,
}) => {
  const scene = await showOverview(page, true);
  await expect.poll(async () => (await readLabels(page)).length).toBeGreaterThan(0);
  const labels = await readLabels(page);
  expect(labels.length).toBeLessThan(scene.cities.length);
  expect(labels.some((label) => label.name === scene.selected)).toBe(true);
  expectReadableLabels(labels);
  const hidden = scene.cities.find((city) => !labels.some((label) => label.name === city.name))!;
  const before = await page.evaluate(() =>
    (window as unknown as { overviewSnapshot(): string }).overviewSnapshot(),
  );
  await page.getByRole('button', { name: 'Elementi visibili', exact: true }).click();
  const elements = page.getByRole('region', { name: 'Elementi visibili sulla mappa' });
  await elements
    .getByRole('searchbox', { name: 'Cerca tra gli elementi visibili' })
    .fill(hidden.name);
  await elements
    .getByRole('button')
    .filter({ has: page.getByText(hidden.name, { exact: true }) })
    .click();
  expect(
    await page.evaluate(() => JSON.parse(document.body.dataset.overviewSelection!)),
  ).toMatchObject({ type: 'city', id: hidden.id });
  expect(
    await page.evaluate(() =>
      (window as unknown as { overviewSnapshot(): string }).overviewSnapshot(),
    ),
  ).toBe(before);
  await page.screenshot({ path: test.info().outputPath('crowded-region-selected-390.png') });
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
    // A fixed rendering workload keeps this prepared benchmark comparable
    // when the new sea replaces land and its naturally generated resources.
    // Extra sprites reuse known dry resource positions; no game time is run.
    const natural = state.entities.filter((entity) => entity.kind !== 'fishery');
    const generated = state.entities.length;
    for (let index = generated; index < 1800; index++) {
      const source = natural[((index - generated) * 7) % natural.length];
      state.entities.push({ ...source, id: `overview-stress-${index}` });
    }
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
