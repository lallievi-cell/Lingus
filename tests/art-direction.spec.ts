import { expect, test, type Page } from '@playwright/test';

/** Prepared art-review scenes use the actual renderer and picking handlers.
 * Their materials, buildings and actions are not evidence of campaign progress. */
async function showArtScene(page: Page, season = 0, night = false, regional = false) {
  await page.goto('/');
  return page.evaluate(
    async ({ season, night, regional }) => {
      const { default: React } = await import('/node_modules/.vite/deps/react.js');
      const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
      const { WorldMap } = await import('/src/components/WorldMap.tsx');
      const { createGame } = await import('/src/game/engine.ts');
      const { BUILDING_SPECS, WORD_ORDER } = await import('/src/game/content.ts');
      const { getCalendar, seasonStart } = await import('/src/game/calendar.ts');
      const { drawNaturalAtlas, ensureNaturalAtlas } = await import(
        '/src/components/mapNaturalAtlas.ts'
      );
      const state = createGame(6842);
      Object.assign(state, {
        started: true,
        paused: true,
        tier: regional ? 5 : 2,
        urbanized: regional,
        sparks: [],
        cities: regional ? state.cities.slice(0, 3) : [],
        factions: [],
        campfirePending: false,
      });
      state.time = seasonStart(state, season) + 20;
      if (night) state.time = getCalendar(state).seasonStart + getCalendar(state).dayLength + 8;
      state.seasonIndex = season;
      for (const id of WORD_ORDER)
        state.words[id] = { retention: 100, custodians: state.units.map((u) => u.id), uses: 1 };
      Object.assign(state.resources, {
        food: 12,
        cooked: 4,
        wood: 8,
        stone: 6,
        pelt: 3,
        tool: 3,
        spear: 2,
        ore: 4,
        ingot: 2,
      });
      state.entities = [];
      const add = (
        kind: (typeof state.entities)[number]['kind'],
        x: number,
        y: number,
        amount = 20,
        hp = 100,
      ) => {
        const entity = {
          id: `art-${kind}-${state.entities.length}`,
          kind,
          x,
          y,
          amount,
          maxAmount: amount,
          hp,
          maxHp: Math.max(1, hp),
          originX: x,
          originY: y,
        };
        state.entities.push(entity);
        return entity;
      };
      const tree = add('tree', 238, 242);
      add('tree', 260, 232);
      add('tree', 242, 226);
      add('tree', 266, 273);
      add('tree', 234, 273, 0);
      const stone = add('stone', 264, 246);
      add('ore', 266, 236);
      add('berries', 236, 255);
      add('berries', 264, 260);
      const deer = add('deer', 259, 270);
      add('wolf', 265, 256);
      add('mammoth', 238, 277);
      add('seedling', 245, 269, 1, 1);
      const fire = {
        id: 'art-campfire',
        kind: 'campfire' as const,
        x: 250,
        y: 248,
        hp: BUILDING_SPECS.campfire.maxHp,
        active: true,
      };
      state.buildings = [
        fire,
        { id: 'art-hut', kind: 'hut', x: 255, y: 236, hp: 100, active: true },
      ];
      state.units.forEach((unit, index) => {
        Object.assign(unit, {
          x: 247 + (index % 3) * 3,
          y: 253 + Math.floor(index / 3) * 3,
          hp: 100,
          hunger: 20,
          temp: 100,
          action: 'idle',
          progress: 0,
          age: index === 5 ? 15 : index === 6 ? 2 : 7,
          knows: [...WORD_ORDER],
        });
      });
      Object.assign(state.units[0], {
        x: 240,
        y: 244,
        action: 'gathering',
        progress: 1,
        targetId: tree.id,
        command: ['S_01', 'V_03', 'O_03'],
      });
      Object.assign(state.units[1], {
        x: 261,
        y: 247,
        action: 'gathering',
        progress: 1,
        targetId: stone.id,
        command: ['S_01', 'V_03', 'O_02'],
      });
      Object.assign(state.units[2], {
        x: 257,
        y: 268,
        action: 'hunting',
        progress: 1,
        targetId: deer.id,
        command: ['S_01', 'V_03', 'O_04'],
      });
      Object.assign(state.units[3], {
        x: 253,
        y: 259,
        action: 'returning',
        carry: { resource: 'wood', amount: 1 },
      });
      Object.assign(state.units[4], {
        x: 252,
        y: 249,
        age: 0,
        action: 'idle',
      });
      if (regional) {
        state.sectors.forEach((sector) => (sector.explored = true));
        state.units = [];
        state.cities.forEach((city, index) => {
          Object.assign(city, {
            name: ['La Valle', 'Le Fucine', 'Le Spighe'][index],
            x: [210, 290, 260][index],
            y: [230, 250, 320][index],
            capital: index === 0,
            factionId: index < 2 ? 'player' : 'foreign-art',
            cohorts: { workers: 160, warriors: 20, sages: 12, slaves: 0 },
            vocations: [
              {
                id: `art-vocation-${index}`,
                createdAt: 0,
                tokens:
                  index === 1 ? ['C_02', 'S_09', 'V_12', 'O_07'] : ['C_02', 'S_09', 'V_09', 'O_04'],
              },
            ],
          });
        });
        state.buildings = state.cities.flatMap((city, index) =>
          (
            ['walls', index === 1 ? 'foundry' : 'farm', index === 0 ? 'palace' : 'market'] as const
          ).map((kind) => ({
            id: `${city.id}-${kind}`,
            kind,
            cityId: city.id,
            x: city.x,
            y: city.y,
            hp: BUILDING_SPECS[kind].maxHp,
            active: true,
            completed: true,
            lastEfficiency: 1,
          })),
        );
        state.battalions = [
          {
            id: 'art-battalion',
            name: 'Le Lance della Valle',
            x: 241,
            y: 245,
            cityId: state.cities[0].id,
            factionId: 'player',
            hp: 2000,
            maxHp: 2000,
            morale: 1,
            action: 'idle',
            catapult: true,
            cavalry: true,
            occupation: 0,
          },
        ];
        state.caravans = [
          {
            id: 'art-caravan',
            kind: 'trade',
            x: 251,
            y: 234,
            fromCityId: state.cities[0].id,
            toCityId: state.cities[1].id,
            factionId: 'player',
            resources: { ...state.resources },
            population: 0,
            hp: 100,
          },
        ];
      }
      const atlasLoaded = await ensureNaturalAtlas();
      const probe = document.createElement('canvas');
      probe.width = probe.height = 180;
      const paintedKindsReady = (['tree', 'berries', 'stone', 'ore', 'seedling'] as const).every(
        (kind) =>
          [0, 3].every((season) =>
            [false, true].every((unknown) =>
              drawNaturalAtlas(probe.getContext('2d')!, { ...tree, kind }, 0, season, unknown),
            ),
          ),
      );
      document.body.innerHTML = '';
      document.body.style.cssText = 'margin:0;overflow:hidden';
      const host = document.createElement('div');
      host.style.cssText = 'width:100vw;height:100dvh;position:relative';
      document.body.append(host);
      (window as unknown as { artReviewState: typeof state }).artReviewState = state;
      ReactDOM.createRoot(host).render(
        React.createElement(WorldMap, {
          state,
          selectedTarget: null,
          onSelect: (target: { type: string; id?: string }) => {
            document.body.dataset.artSelection = JSON.stringify(target);
          },
        }),
      );
      return {
        atlasLoaded,
        paintedKindsReady,
        before: JSON.stringify(state),
        adult: state.units[0]?.id,
      };
    },
    { season, night, regional },
  );
}

const map = (page: Page) => page.getByRole('img', { name: /Mappa della valle/ });

async function settledFrame(page: Page) {
  await expect(map(page)).toBeVisible();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
}

for (const width of [1440, 390]) {
  test(`the complete naturalistic camp remains stable and selectable at ${width}`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1050 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (let season = 0; season < 4; season++) {
      const review = await showArtScene(page, season);
      expect(review.atlasLoaded).toBe(true);
      expect(review.paintedKindsReady).toBe(true);
      await settledFrame(page);
      await page.screenshot({
        path: test.info().outputPath(`valley-season-${season}-${width}.png`),
      });
      const unchanged = await page.evaluate(() =>
        JSON.stringify((window as unknown as { artReviewState: unknown }).artReviewState),
      );
      expect(unchanged).toBe(review.before);
      if (season === 0) {
        const before = await map(page).evaluate((node) => (node as HTMLCanvasElement).toDataURL());
        await page.waitForTimeout(180);
        const after = await map(page).evaluate((node) => (node as HTMLCanvasElement).toDataURL());
        expect(after).toBe(before);
        const bounds = (await map(page).boundingBox())!;
        const scale = Math.max(bounds.width / 1200, bounds.height / 800) * 4.5;
        const unitScale = await page.evaluate(async () => {
          const { UNIT_ART_SCALE } = await import('/src/components/mapDrawing.ts');
          return UNIT_ART_SCALE;
        });
        await map(page).click({
          position: {
            x: bounds.width / 2 + (240 - 250) * 2.4 * scale,
            y: bounds.height / 2 + ((244 - 250) * 1.6 - 28 * unitScale) * scale,
          },
        });
        const choices = page.getByRole('group', { name: 'Scegli tra gli elementi sovrapposti' });
        if (await choices.isVisible()) await choices.getByRole('button', { name: /^Korg/ }).click();
        expect(
          await page.evaluate(() => JSON.parse(document.body.dataset.artSelection ?? '{}')),
        ).toMatchObject({ type: 'unit', id: review.adult });
      }
    }
    await showArtScene(page, 3, true);
    await settledFrame(page);
    await page.screenshot({ path: test.info().outputPath(`valley-winter-night-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}

test('all twenty building materials render consistently without changing their source state', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { BUILDING_ORDER, BUILDING_SPECS } = await import('/src/game/content.ts');
    const { drawPainterlyBuilding } = await import('/src/components/mapBuildingArt.ts');
    document.body.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = 1440;
    canvas.height = 1050;
    canvas.style.cssText = 'display:block;width:100vw;height:100vh';
    document.body.append(canvas);
    const ctx = canvas.getContext('2d')!;
    const buildings = BUILDING_ORDER.map((kind) => ({
      id: `gallery-${kind}`,
      kind,
      x: 0,
      y: 0,
      hp: BUILDING_SPECS[kind].maxHp,
      active: true,
      completed: true,
      livestock: kind === 'pen' ? 4 : undefined,
    }));
    const before = JSON.stringify(buildings);
    ctx.fillStyle = '#e5e6d2';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    buildings.forEach((building, index) => {
      const x = 144 + (index % 5) * 288;
      const y = 170 + Math.floor(index / 5) * 250;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1.9, 1.9);
      drawPainterlyBuilding(ctx, building, 20, {
        producing: building.kind === 'foundry',
        season: 0,
      });
      ctx.restore();
      ctx.fillStyle = '#334d3c';
      ctx.font = '600 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(BUILDING_SPECS[building.kind].label, x, y + 50);
    });
    return { count: buildings.length, unchanged: JSON.stringify(buildings) === before };
  });
  expect(result).toEqual({ count: 20, unchanged: true });
  await page.screenshot({ path: test.info().outputPath('valley-all-buildings.png') });
});

test('the regional illustration preserves cities, armies and real caravan cargo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  const review = await showArtScene(page, 1, false, true);
  expect(review.atlasLoaded).toBe(true);
  expect(review.paintedKindsReady).toBe(true);
  await settledFrame(page);
  await page.screenshot({ path: test.info().outputPath('valley-regional.png') });
  expect(
    await page.evaluate(() =>
      JSON.stringify((window as unknown as { artReviewState: unknown }).artReviewState),
    ),
  ).toBe(review.before);
});

test('the full phone interface keeps the illustrated camp readable in the actual play area', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const review = await showArtScene(page);
  const prepared = await page.evaluate((raw) => {
    const state = JSON.parse(raw);
    const known = new Set([
      'S_01',
      'S_02',
      'V_01',
      'V_02',
      'V_03',
      'V_04',
      'V_05',
      'V_06',
      'V_07',
      'O_01',
      'O_02',
      'O_03',
      'O_04',
      'O_05',
      'M_02',
      'C_01',
    ]);
    for (const id of Object.keys(state.words)) if (!known.has(id)) delete state.words[id];
    for (const unit of state.units) unit.knows = unit.knows.filter((id: string) => known.has(id));
    return JSON.stringify(state);
  }, review.before);
  await page.addInitScript((raw) => {
    if (!sessionStorage.getItem('art.prepared')) {
      localStorage.setItem('lingus.save.v2', raw);
      sessionStorage.setItem('art.prepared', 'yes');
    }
  }, prepared);
  await page.reload();
  const stocks = page.getByRole('button', { name: 'Scorte del campo', exact: true });
  await expect(stocks).toBeVisible();
  const playArea = (await map(page).boundingBox())!;
  expect(playArea.height).toBeLessThan(700);
  expect(playArea.height).toBeGreaterThan(200);
  await page.screenshot({ path: test.info().outputPath('valley-app-390.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await stocks.click();
  const inventory = page.getByRole('dialog', { name: 'Scorte del campo' });
  await expect(inventory.locator('[data-resource="pelt"]')).toContainText('Pelli');
  await expect(inventory.locator('.camp-inventory-list')).not.toContainText(/\d/);
  await page.keyboard.press('Escape');

  // Also inspect the unmodified new-game geography and neutral unknown materials.
  const fresh = await page.evaluate(async () => {
    const { createGame } = await import('/src/game/engine.ts');
    const state = createGame(6842, 'guided');
    state.started = true;
    state.paused = true;
    return JSON.stringify(state);
  });
  // The current app saves on pagehide. Apply the fixture in the next document,
  // after that handler, so this actually reviews a fresh game rather than the old save.
  await page.addInitScript((raw) => {
    if (!sessionStorage.getItem('art.fresh')) {
      localStorage.setItem('lingus.save.v2', raw);
      sessionStorage.setItem('art.fresh', 'yes');
    }
  }, fresh);
  await page.reload();
  await expect(stocks).toBeVisible();
  await expect(page.locator('.unit-card')).toHaveCount(7);
  await expect(page.locator('.world-resources')).not.toContainText('Cibo');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!).tier)).toBe(
    0,
  );
  await page.screenshot({ path: test.info().outputPath('valley-first-steps-390.png') });
});

test('a missing painted atlas leaves the procedural world playable', async ({ page }) => {
  await page.route('**/art/valley-natural-atlas.png', (route) => route.abort());
  const review = await showArtScene(page);
  expect(review.atlasLoaded).toBe(false);
  await settledFrame(page);
  const bounds = (await map(page).boundingBox())!;
  const scale = Math.max(bounds.width / 1200, bounds.height / 800) * 4.5;
  await map(page).click({
    position: {
      x: bounds.width / 2 + (240 - 250) * 2.4 * scale,
      y: bounds.height / 2 + ((244 - 250) * 1.6 - 28 * 0.3) * scale,
    },
  });
  const choices = page.getByRole('group', { name: 'Scegli tra gli elementi sovrapposti' });
  if (await choices.isVisible()) await choices.getByRole('button', { name: /^Korg/ }).click();
  expect(
    await page.evaluate(() => JSON.parse(document.body.dataset.artSelection ?? '{}')),
  ).toMatchObject({ type: 'unit', id: review.adult });
});
