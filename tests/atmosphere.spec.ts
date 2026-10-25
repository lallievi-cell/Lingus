import { expect, test, type Page } from '@playwright/test';

/** Prepared visual fixtures isolate real weather/source flags. They are not a campaign replay. */
async function showStormMap(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const reactModule = await import('/node_modules/.vite/deps/react.js');
    const React = reactModule.default;
    const rootModule = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { createRoot } = rootModule.default;
    const { createGame } = await import('/src/game/engine.ts');
    const { WorldMap } = await import('/src/components/WorldMap.tsx');
    const initial = createGame(6842);
    Object.assign(initial, { started: true, paused: false, time: 20 });
    initial.disasters.storm = true;
    initial.units = [];
    initial.entities = [];
    initial.buildings = [];
    initial.cities = [];
    initial.factions = [];
    initial.sparks = [];
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;overflow:hidden';
    const host = document.createElement('div');
    host.style.cssText = 'width:100vw;height:100vh';
    document.body.append(host);
    function WeatherSamples() {
      const [state, setState] = React.useState(initial);
      React.useEffect(() => {
        // Supply successive simulation snapshots through WorldMap's public prop.
        // The empty scene leaves only weather capable of changing the visible pixels.
        const interval = window.setInterval(
          () => setState((previous) => ({ ...previous, time: previous.time + 0.25 })),
          100,
        );
        return () => window.clearInterval(interval);
      }, []);
      return React.createElement(WorldMap, {
        state,
        selectedTarget: null,
        onSelect: () => {},
      });
    }
    createRoot(host).render(React.createElement(WeatherSamples));
  });
  await expect(page.getByRole('img', { name: /Mappa della valle/ })).toBeVisible();
}

test('actual weather and local hazards paint deterministically without leaking hidden sources', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createGame } = await import('/src/game/engine.ts');
    const { drawMapAtmosphere } = await import('/src/components/mapAtmosphere.ts');
    const { createTerrain, drawWorld } = await import('/src/components/mapDrawing.ts');
    const makeState = () => {
      const state = createGame(6842);
      Object.assign(state, { started: true, paused: false, time: 20 });
      state.units = [];
      state.entities = [];
      state.buildings = [];
      state.cities = [];
      state.factions = [];
      state.sparks = [];
      return state;
    };
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext('2d')!;
    const raster = (state: ReturnType<typeof createGame>, time: number, reducedMotion = false) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawMapAtmosphere(ctx, state, time, undefined, { reducedMotion, pixelRatio: 1 });
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data.slice();
    };
    const equal = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
      a.length === b.length && a.every((value, i) => value === b[i]);
    const painted = (pixels: Uint8ClampedArray) =>
      pixels.reduce((sum, value, i) => sum + (i % 4 === 3 && value > 0 ? 1 : 0), 0);
    const state = makeState();
    const blank = raster(state, 20);
    const weather = {} as Record<string, { painted: number; animated: boolean; paused: boolean }>;
    for (const kind of ['storm', 'blizzard', 'drought'] as const) {
      state.disasters[kind] = true;
      const first = raster(state, 20);
      const later = raster(state, 20.6);
      state.paused = true;
      const stopped = equal(raster(state, 20), raster(state, 50));
      state.paused = false;
      weather[kind] = { painted: painted(first), animated: !equal(first, later), paused: stopped };
      state.disasters[kind] = false;
    }
    state.buildings = [{ id: 'fire', kind: 'campfire', x: 250, y: 250, hp: 100, active: true }];
    const activeFire = raster(state, 20);
    state.buildings[0].active = false;
    const inactiveFire = raster(state, 20);
    state.buildings[0].active = true;
    state.buildings[0].completed = false;
    const unfinishedFire = raster(state, 20);
    Object.assign(state.buildings[0], { x: 180, completed: true });
    const hiddenFire = raster(state, 20);
    const worker = createGame(6842).units[0];
    Object.assign(worker, {
      x: 250,
      y: 250,
      action: 'working',
      jobBuildingId: 'furnace',
      command: ['S_01', 'V_12', 'O_07'],
      hunger: 20,
      temp: 100,
      hp: 100,
    });
    state.units = [worker];
    state.resources.ore = 5;
    state.resources.wood = 10;
    state.buildings = [
      {
        id: 'furnace',
        kind: 'foundry',
        x: 250,
        y: 250,
        hp: 100,
        active: true,
        workerIds: [worker.id],
      },
    ];
    const workingFoundry = raster(state, 20);
    worker.x = 260;
    const distantFoundry = raster(state, 20);
    worker.x = 250;
    state.resources.ore = 0;
    const emptyFoundry = raster(state, 20);
    state.buildings = [];
    worker.plagueUntil = 40;
    const infected = raster(state, 20);
    worker.plagueUntil = 19;
    const recovered = raster(state, 20);
    state.units = [];
    state.buildings = [];
    state.entities = [{ id: 'body', kind: 'corpse', x: 250, y: 250, amount: 1, hp: 0, maxHp: 1 }];
    const corpse = raster(state, 20);
    state.entities[0].amount = 0;
    const removedCorpse = raster(state, 20);
    Object.assign(state.entities[0], { amount: 1, x: 180 });
    const hiddenCorpse = raster(state, 20);
    state.entities = [
      {
        id: 'struck-tree',
        kind: 'tree',
        x: 250,
        y: 250,
        amount: 20,
        hp: 100,
        maxHp: 100,
        burning: true,
      },
    ];
    Object.assign(state, { time: 90.4, seasonIndex: 1 });
    const burningTree = raster(state, 90.4);
    state.disasters.lightning = true;
    const strike = raster(state, 90.4);
    const reducedStrike = raster(state, 90.4, true);
    state.disasters.lightning = false;
    const reducedTree = raster(state, 90.4, true);
    state.time = 95;
    const lateTree = raster(state, 95);
    state.disasters.lightning = true;
    const lateStrike = raster(state, 95);
    const night = makeState();
    night.time = 72;
    night.paused = true;
    const terrain = createTerrain(6842, night.seasonIndex, night);
    const worldRaster = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawWorld(ctx, night, terrain, night.time, null, null, false);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data.slice();
    };
    const nightBefore = worldRaster();
    night.buildings.push({
      id: 'hidden-night-fire',
      kind: 'campfire',
      x: 180,
      y: 250,
      hp: 100,
      active: true,
    });
    const hiddenNightFire = worldRaster();
    const unchanged = JSON.stringify(state);
    raster(state, 22);
    return {
      blank: painted(blank),
      weather,
      activeFire: painted(activeFire),
      inactiveFire: equal(inactiveFire, blank),
      unfinishedFire: equal(unfinishedFire, blank),
      hiddenFire: equal(hiddenFire, blank),
      workingFoundry: painted(workingFoundry),
      distantFoundry: equal(distantFoundry, blank),
      emptyFoundry: equal(emptyFoundry, blank),
      infected: painted(infected),
      recovered: equal(recovered, blank),
      corpse: painted(corpse),
      removedCorpse: equal(removedCorpse, blank),
      hiddenCorpse: equal(hiddenCorpse, blank),
      burningTree: painted(burningTree),
      strike: !equal(strike, burningTree),
      reducedStrike: equal(reducedStrike, reducedTree),
      noRepeatedStrike: equal(lateStrike, lateTree),
      hiddenNightFire: equal(hiddenNightFire, nightBefore),
      stateUnchanged: unchanged === JSON.stringify(state),
    };
  });
  expect(result.blank).toBe(0);
  for (const weather of Object.values(result.weather)) {
    expect(weather.painted).toBeGreaterThan(0);
    expect(weather.paused).toBe(true);
  }
  expect(result.weather.storm.animated).toBe(true);
  expect(result.weather.blizzard.animated).toBe(true);
  expect(result.activeFire).toBeGreaterThan(0);
  expect(result.corpse).toBeGreaterThan(0);
  expect(result.inactiveFire).toBe(true);
  expect(result.unfinishedFire).toBe(true);
  expect(result.hiddenFire).toBe(true);
  expect(result.workingFoundry).toBeGreaterThan(0);
  expect(result.distantFoundry).toBe(true);
  expect(result.emptyFoundry).toBe(true);
  expect(result.infected).toBeGreaterThan(0);
  expect(result.recovered).toBe(true);
  expect(result.removedCorpse).toBe(true);
  expect(result.hiddenCorpse).toBe(true);
  expect(result.burningTree).toBeGreaterThan(0);
  expect(result.strike).toBe(true);
  expect(result.reducedStrike).toBe(true);
  expect(result.noRepeatedStrike).toBe(true);
  expect(result.hiddenNightFire).toBe(true);
  expect(result.stateUnchanged).toBe(true);
});

test('WorldMap responds to a live reduced-motion preference while weather remains readable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await showStormMap(page);
  const canvas = page.getByRole('img', { name: /Mappa della valle/ });
  const frame = () => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  const moving = await frame();
  await expect.poll(frame).not.toBe(moving);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Allow the media change and one fresh frame to reach the renderer.
  await page.waitForTimeout(150);
  const reduced = await frame();
  await page.waitForTimeout(350);
  expect(await frame()).toBe(reduced);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(frame).not.toBe(reduced);
  expect(errors).toEqual([]);
});
