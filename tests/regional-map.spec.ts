import { expect, test, type Page } from '@playwright/test';

/** Prepared regional fixtures isolate travel, siege and map interaction.
 * These tests do not represent a campaign reaching urbanization from Seed Zero. */
test('real fiscal travel wears only traversed ground and its history survives save/reload', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createGame, serializeGame, parseGame } = await import('/src/game/engine.ts');
    const { emptyInventory, WORD_ORDER } = await import('/src/game/content.ts');
    const { updateImperial } = await import('/src/game/imperial.ts');
    const { drawRegionalRoutes, getRegionalRouteStyle } = await import(
      '/src/components/mapRouteArt.ts'
    );
    const state = createGame(6842);
    Object.assign(state, { tier: 5, started: true, paused: false, urbanized: true, time: 20 });
    state.factions = [];
    state.buildings = [];
    state.entities = [];
    for (const id of WORD_ORDER) state.words[id] = { retention: 100, custodians: [], uses: 0 };
    const template = structuredClone(state.cities[0]);
    const province = {
      ...structuredClone(template),
      id: 'province',
      name: 'La Provincia',
      x: 210,
      y: 250,
      sectorX: 2,
      sectorY: 2,
      factionId: 'player',
      capital: false,
    };
    const capital = {
      ...structuredClone(template),
      id: 'capital',
      name: 'La Capitale',
      x: 310,
      y: 250,
      sectorX: 3,
      sectorY: 2,
      factionId: 'player',
      capital: true,
    };
    state.cities = [province, capital];
    state.caravans = [
      {
        id: 'real-tax-convoy',
        kind: 'tax',
        x: province.x,
        y: province.y,
        fromCityId: province.id,
        toCityId: capital.id,
        factionId: 'player',
        resources: { ...emptyInventory(), coin: 10 },
        population: 0,
        target: { type: 'city', id: capital.id, x: capital.x, y: capital.y },
        hp: 100,
      },
    ];
    const travel = (seconds: number) => {
      for (let i = 0; i < seconds * 4; i++) {
        state.time += 0.25;
        updateImperial(state, 0.25);
      }
    };
    travel(2);
    const first = structuredClone(state.regionalRoutes ?? []);
    const travelledTo = state.caravans[0].x;
    state.caravans[0].customsRefused = true;
    travel(2);
    const stopped = JSON.stringify(state.regionalRoutes) === JSON.stringify(first);
    state.caravans[0].customsRefused = false;
    travel(18);
    const onePass = structuredClone(state.regionalRoutes ?? []);
    const onePassDistance = onePass.reduce((n, segment) => n + segment.travelled, 0);
    const arrived = state.caravans[0].arrived;
    // A second scheduled convoy starts at the other city; all wear still comes
    // from its real movement, rather than revealing an untravelled planned route.
    state.caravans.push({
      id: 'real-return-convoy',
      kind: 'tax',
      x: capital.x,
      y: capital.y,
      fromCityId: capital.id,
      toCityId: province.id,
      factionId: 'player',
      resources: { ...emptyInventory(), coin: 1 },
      population: 0,
      target: { type: 'city', id: province.id, x: province.x, y: province.y },
      hp: 100,
    });
    travel(18);
    const repeated = state.regionalRoutes ?? [];
    const repeatedDistance = repeated.reduce((n, segment) => n + segment.travelled, 0);
    const loaded = parseGame(serializeGame(state));
    const oldSave = structuredClone(state);
    delete oldSave.regionalRoutes;
    const legacy = parseGame(serializeGame(oldSave));
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext('2d')!;
    const before = serializeGame(state);
    drawRegionalRoutes(ctx, state);
    const pixels = ctx.getImageData(0, 0, 1200, 800).data;
    return {
      firstCount: first.length,
      visited: first.every(
        (segment) => segment.from.x <= travelledTo + 0.001 && segment.to.x <= travelledTo + 0.001,
      ),
      unplanned: first.every(
        (segment) => segment.from.x >= province.x && segment.to.x >= province.x,
      ),
      travelledTo,
      stopped,
      arrived,
      onePassDistance,
      repeatedDistance,
      persisted: JSON.stringify(loaded?.regionalRoutes) === JSON.stringify(repeated),
      legacy: legacy !== null && legacy.regionalRoutes === undefined,
      painted: pixels.some((n, index) => index % 4 === 3 && n > 0),
      immutable: before === serializeGame(state),
      styles: repeated.map((segment) => getRegionalRouteStyle(state, segment)),
    };
  });
  expect(result.firstCount).toBeGreaterThan(0);
  expect(result.travelledTo).toBeCloseTo(222);
  expect(result.visited).toBe(true);
  expect(result.unplanned).toBe(true);
  expect(result.stopped).toBe(true);
  expect(result.arrived).toBe(true);
  expect(result.onePassDistance).toBeCloseTo(100);
  expect(result.repeatedDistance).toBeCloseTo(200);
  expect(result.persisted).toBe(true);
  expect(result.legacy).toBe(true);
  expect(result.painted).toBe(true);
  expect(result.immutable).toBe(true);
});

test('an actual siege hit paints once and the occupation display follows thirty real seconds', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createGame } = await import('/src/game/engine.ts');
    const { WORD_ORDER, BUILDING_SPECS, emptyInventory } = await import('/src/game/content.ts');
    const { updateImperial } = await import('/src/game/imperial.ts');
    const { deriveSiegePresentation, drawRegionalSieges, getSiegeProjectile } = await import(
      '/src/components/mapSiegeArt.ts'
    );
    const state = createGame(6842);
    Object.assign(state, { tier: 5, urbanized: true, started: true, paused: false, time: 20 });
    state.factions = [];
    state.entities = [];
    state.units = [];
    for (const id of WORD_ORDER) state.words[id] = { retention: 100, custodians: [], uses: 0 };
    const city = state.cities[0];
    Object.assign(city, {
      id: 'siege-city',
      name: 'La Città Assediata',
      x: 250,
      y: 250,
      sectorX: 2,
      sectorY: 2,
      garrisonHp: 0,
      factionId: 'foreign',
      occupation: 0,
      resources: emptyInventory(),
    });
    state.cities = [city];
    const walls = {
      id: 'real-walls',
      kind: 'walls' as const,
      cityId: city.id,
      x: city.x,
      y: city.y,
      hp: BUILDING_SPECS.walls.maxHp,
      active: true,
      completed: true,
    };
    state.buildings = [walls];
    const army = {
      id: 'real-siege-army',
      name: 'Il Battaglione',
      x: 248,
      y: 250,
      cityId: 'origin',
      factionId: 'player',
      hp: 2000,
      maxHp: 2000,
      morale: 1,
      action: 'conquering',
      catapult: true,
      occupation: 0,
      targetId: city.id,
      attackProgress: 0,
    };
    state.battalions = [army];
    const advance = (seconds: number) => {
      for (let i = 0; i < seconds * 4; i++) {
        state.time += 0.25;
        updateImperial(state, 0.25);
      }
    };
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext('2d')!;
    const raster = (time: number, reducedMotion = false) => {
      ctx.clearRect(0, 0, 1200, 800);
      drawRegionalSieges(ctx, state, time, { reducedMotion, pixelRatio: 1 });
      return canvas.toDataURL();
    };
    const ready = deriveSiegePresentation(state, army);
    const unconfirmed = getSiegeProjectile(state, army, state.time) === undefined;
    advance(1);
    const actualDamage = BUILDING_SPECS.walls.maxHp - walls.hp;
    const shot = structuredClone(army.lastSiegeShot);
    const impact = raster(state.time + 0.3);
    delete army.lastSiegeShot;
    const noShot = raster(state.time + 0.3);
    army.lastSiegeShot = shot;
    state.paused = true;
    const paused = raster(100) === raster(200);
    state.paused = false;
    const reduced = raster(100, true) === raster(200, true);
    advance(9);
    const noWalls = walls.hp;
    advance(15);
    const midway = deriveSiegePresentation(state, army);
    const halfway = army.occupation;
    advance(14);
    const beforeFinal = army.occupation;
    const stillForeign = city.factionId === 'foreign';
    advance(1);
    const ended = deriveSiegePresentation(state, army);
    return {
      ready,
      unconfirmed,
      actualDamage,
      shot,
      paintsImpact: noShot !== impact,
      paused,
      reduced,
      noWalls,
      midway,
      halfway,
      beforeFinal,
      stillForeign,
      conquered: city.factionId === 'player' && army.action === 'idle',
      ended,
    };
  });
  expect(result.ready?.phase).toBe('walls');
  expect(result.unconfirmed).toBe(true);
  expect(result.actualDamage).toBe(200);
  expect(result.shot).toMatchObject({ cityId: 'siege-city', wallId: 'real-walls', damage: 200 });
  expect(result.paintsImpact).toBe(true);
  expect(result.paused).toBe(true);
  expect(result.reduced).toBe(true);
  expect(result.noWalls).toBe(0);
  expect(result.midway?.phase).toBe('occupation');
  expect(result.midway?.occupationRatio).toBe(0.5);
  expect(result.halfway).toBe(15);
  expect(result.beforeFinal).toBe(29);
  expect(result.stillForeign).toBe(true);
  expect(result.conquered).toBe(true);
  expect(result.ended).toBeUndefined();
});

async function showRegionalTarget(page: Page, scene: 'city' | 'army') {
  await page.goto('/');
  const target = await page.evaluate(async (scene) => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { createGame } = await import('/src/game/engine.ts');
    const { WORD_ORDER, BUILDING_SPECS, emptyInventory } = await import('/src/game/content.ts');
    const { WorldMap } = await import('/src/components/WorldMap.tsx');
    const { getBattalionDisplayPoint } = await import('/src/components/regionalLayout.ts');
    const state = createGame(6842);
    Object.assign(state, { tier: 5, urbanized: true, started: true, paused: true, time: 20 });
    state.units = [];
    state.entities = [];
    state.factions = [];
    state.caravans = [];
    state.sparks = [];
    for (const id of WORD_ORDER) state.words[id] = { retention: 100, custodians: [], uses: 0 };
    const city = state.cities[0];
    Object.assign(city, {
      id: 'regional-city',
      name: 'La Città Regionale',
      x: 250,
      y: 250,
      sectorX: 2,
      sectorY: 2,
      capital: true,
      factionId: scene === 'city' ? 'player' : 'foreign',
      cohorts: { workers: 120, warriors: 20, sages: 20, slaves: 0 },
      garrisonHp: 0,
      resources: { ...emptyInventory(), food: 100, ore: 10, wood: 20 },
      vocations: [
        {
          id: 'granary',
          name: 'Granaio dell’Impero',
          tokens: ['C_02', 'S_09', 'V_09', 'O_04'],
          createdAt: 0,
        },
      ],
    });
    state.cities = [city];
    state.buildings = ['walls', 'palace', 'farm'].map((kind) => ({
      id: `regional-${kind}`,
      kind,
      x: city.x,
      y: city.y,
      cityId: city.id,
      hp: BUILDING_SPECS[kind].maxHp,
      active: true,
      completed: true,
    }));
    const army = {
      id: 'regional-army',
      name: 'La Legione',
      x: 248,
      y: 250,
      factionId: 'player',
      cityId: 'origin',
      hp: 2000,
      maxHp: 2000,
      morale: 1,
      action: 'conquering',
      catapult: true,
      targetId: city.id,
      occupation: 0,
    };
    state.battalions = scene === 'army' ? [army] : [];
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;overflow:hidden';
    const host = document.createElement('div');
    host.style.cssText = 'width:100vw;height:100vh';
    document.body.append(host);
    ReactDOM.createRoot(host).render(
      React.createElement(WorldMap, {
        state,
        selectedTarget: null,
        onSelect: (target: { type: string; id?: string; x: number; y: number }) => {
          document.body.dataset.selection = JSON.stringify(target);
        },
      }),
    );
    return { city, army, display: getBattalionDisplayPoint(state, army) };
  }, scene);
  await expect(page.getByRole('img', { name: /Mappa della valle/ })).toBeVisible();
  return target;
}

async function regionalZoom(page: Page, zoom: number) {
  const canvas = page.getByRole('img', { name: /Mappa della valle/ });
  const bounds = (await canvas.boundingBox())!;
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
    // A centred pinch tests painted hit areas without also translating the camera.
    touchPoints: [finger(1, x - 20 * zoom), finger(2, x + 20 * zoom)],
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
  await expect(page.locator('.lingus-world__control-stack > span')).toHaveText(`${zoom * 100}%`);
}

for (const mobile of [false, true]) {
  test(`regional city roofs and offset siege formations remain selectable on ${mobile ? 'mobile' : 'desktop'}`, async ({
    page,
  }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 780 } : { width: 1080, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const cityScene = await showRegionalTarget(page, 'city');
    await regionalZoom(page, 3);
    const canvas = page.getByRole('img', { name: /Mappa della valle/ });
    const bounds = (await canvas.boundingBox())!;
    const scale = Math.min(bounds.width / 1200, bounds.height / 800) * 3;
    await canvas.click({
      position: { x: bounds.width / 2 - 2 * scale, y: bounds.height / 2 - 39 * scale },
    });
    expect(
      await page.evaluate(() => JSON.parse(document.body.dataset.selection ?? '{}')),
    ).toMatchObject({
      type: 'city',
      id: cityScene.city.id,
      x: cityScene.city.x,
      y: cityScene.city.y,
    });
    const armyScene = await showRegionalTarget(page, 'army');
    await regionalZoom(page, 3);
    const armyBounds = (await canvas.boundingBox())!;
    const armyScale = Math.min(armyBounds.width / 1200, armyBounds.height / 800) * 3;
    expect(
      Math.hypot(armyScene.display.x - armyScene.army.x, armyScene.display.y - armyScene.army.y),
    ).toBeGreaterThan(10);
    await canvas.click({
      position: {
        x: armyBounds.width / 2 + (armyScene.display.x - 250) * 2.4 * armyScale,
        y: armyBounds.height / 2 + ((armyScene.display.y - 250) * 1.6 - 8) * armyScale,
      },
    });
    expect(
      await page.evaluate(() => JSON.parse(document.body.dataset.selection ?? '{}')),
    ).toMatchObject({
      type: 'battalion',
      id: armyScene.army.id,
      x: armyScene.army.x,
      y: armyScene.army.y,
    });
    const paused = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
    await page.waitForTimeout(150);
    expect(await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(
      paused,
    );
    expect(errors).toEqual([]);
  });
}
