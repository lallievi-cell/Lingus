import { expect, test, type Page } from '@playwright/test';

const SAVE_KEY = 'lingus.save.v2';
const details = (page: Page) => page.getByRole('status', { name: 'Dettagli del bersaglio' });

type Fixture = 'known' | 'unknown' | 'numbered' | 'transport';

async function seedResources(page: Page, scenario: Fixture = 'known') {
  await page.goto('/');
  const raw = await page.evaluate(async (scenario) => {
    const { createGame } = await import('/src/game/engine.ts');
    const { emptyInventory } = await import('/src/game/content.ts');
    const s = createGame(6842);
    s.started = true;
    s.paused = true;
    s.tier = 2;
    s.cities = [];
    s.factions = [];
    s.resources = emptyInventory();
    s.units = s.units.slice(0, 3);
    s.units.forEach((u, i) =>
      Object.assign(u, {
        x: 248 + i * 2,
        y: 258,
        hp: 100,
        hunger: 20,
        temp: 100,
        age: 6,
        action: 'idle',
        progress: 0,
      }),
    );
    const learn = (id: string) => {
      s.words[id] = { retention: 100, custodians: [s.units[0].id], uses: 0 };
      if (!s.units[0].knows.includes(id)) s.units[0].knows.push(id);
    };
    for (const id of ['S_02', 'O_02', 'O_04', 'M_02']) learn(id);
    if (scenario !== 'unknown') learn('O_03');
    if (scenario === 'numbered' || scenario === 'transport') learn('O_08');
    if (scenario === 'transport') for (const id of ['V_04', 'O_01']) learn(id);
    s.entities = [
      {
        id: 'source-tree',
        kind: 'tree',
        x: 232,
        y: 245,
        amount: 20,
        maxAmount: 20,
        hp: 100,
        maxHp: 100,
      },
      {
        id: 'source-stone',
        kind: 'stone',
        x: 264,
        y: 245,
        amount: 30,
        maxAmount: 30,
        hp: 100,
        maxHp: 100,
      },
      {
        id: 'wood-a',
        kind: 'ground',
        resource: 'wood',
        x: 232,
        y: 245,
        amount: 4,
        maxAmount: 4,
        hp: 0,
        maxHp: 1,
      },
      {
        id: 'wood-b',
        kind: 'ground',
        resource: 'wood',
        x: 232,
        y: 245,
        amount: 3,
        maxAmount: 3,
        hp: 0,
        maxHp: 1,
      },
      {
        id: 'stone-pile',
        kind: 'ground',
        resource: 'stone',
        x: 264,
        y: 245,
        amount: 5,
        maxAmount: 5,
        hp: 0,
        maxHp: 1,
      },
      {
        id: 'deer-carcass',
        kind: 'deer',
        x: 250,
        y: 243,
        amount: 2,
        maxAmount: 2,
        hp: 0,
        maxHp: 30,
      },
    ];
    return JSON.stringify(s);
  }, scenario);
  await page.addInitScript(
    ({ raw, marker, key }) => {
      if (!sessionStorage.getItem(marker)) {
        localStorage.setItem(key, raw);
        sessionStorage.setItem(marker, 'applied');
      }
    },
    { raw, marker: `lingus.resources.${scenario}.${Date.now()}`, key: SAVE_KEY },
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Riprendi il tempo' })).toBeVisible();
}

async function mapClick(page: Page, point: { x: number; y: number }, offset = 0) {
  const map = page.getByRole('img', { name: /Mappa della valle/ });
  const bounds = await map.boundingBox();
  expect(bounds).not.toBeNull();
  const scale = Math.max(bounds!.width / 1200, bounds!.height / 800) * 4.5;
  await map.click({
    position: {
      x: bounds!.width / 2 + (point.x - 250) * 2.4 * scale,
      y: bounds!.height / 2 + ((point.y - 250) * 1.6 - offset) * scale,
    },
  });
  await page.mouse.move(1, 1);
}

async function pilePoint(page: Page, resource: string) {
  return page.evaluate(
    async ({ resource, key }) => {
      const { getGroundPiles } = await import('/src/components/mapResourceLayout.ts');
      const s = JSON.parse(localStorage.getItem(key)!);
      const pile = getGroundPiles(s).find((p) => p.resource === resource);
      if (!pile) throw new Error(`No ${resource} pile in fixture`);
      return { x: pile.x, y: pile.y };
    },
    { resource, key: SAVE_KEY },
  );
}

async function saveAndRead(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  return saved;
}

test('extracted wood and stone can be selected separately from their source and are not stored goods', async ({
  page,
}) => {
  await seedResources(page, 'numbered');
  await mapClick(page, await pilePoint(page, 'wood'));
  await expect(details(page)).toContainText(/Legno/i);
  await expect(details(page)).toContainText(/a terra/i);
  await expect(details(page)).toContainText(/7/);
  await expect(details(page)).toContainText(/consegnat|scorte/i);
  await expect(page.locator('.map-toolbar')).toContainText(/Legno/i);
  await mapClick(page, await pilePoint(page, 'stone'));
  await expect(details(page)).toContainText(/Pietra/i);
  await expect(details(page)).toContainText(/a terra/i);
  await mapClick(page, { x: 232, y: 245 }, 3);
  await expect(details(page)).toContainText(/estrarr|estrazione/i);
  const saved = await saveAndRead(page);
  expect(saved.resources.wood).toBe(0);
  expect(saved.resources.stone).toBe(0);
  expect(saved.entities.find((e: { id: string }) => e.id === 'wood-a').amount).toBe(4);
});

test('an unknown material and exact pile counts stay hidden until the relevant concepts are known', async ({
  page,
}) => {
  await seedResources(page, 'unknown');
  await mapClick(page, await pilePoint(page, 'wood'));
  await expect(details(page)).toContainText(/a terra/i);
  await expect(details(page)).not.toContainText(/Legno|Pietra|\b7\b/i);
  await expect(details(page)).not.toContainText(/Portare/);
  await expect(page.locator('.map-toolbar')).not.toContainText(/Legno/i);
  await seedResources(page, 'known');
  await mapClick(page, await pilePoint(page, 'wood'));
  await expect(details(page)).toContainText(/Legno/i);
  await expect(details(page)).not.toContainText(/\b7\b/);
  await page.screenshot({
    path: '/workspace/artifacts/lingus-resource-readability-desktop.png',
    fullPage: true,
  });
});

test('an animal carcass is presented as food on the spot rather than as a living animal', async ({
  page,
}) => {
  await seedResources(page);
  await mapClick(page, { x: 250, y: 243 });
  await expect(details(page)).toContainText(/Carcassa/i);
  await expect(details(page)).toContainText(/mangiar|consum|nutrimento/i);
  await expect(details(page)).not.toContainText(/da abbattere|da cacciare/i);
  const saved = await saveAndRead(page);
  expect(saved.resources.meat).toBe(0);
});

test('carrying an extracted pile through a real order increases stocks only after delivery', async ({
  page,
}) => {
  await seedResources(page, 'transport');
  await mapClick(page, await pilePoint(page, 'wood'));
  await expect(details(page)).toContainText(/Portare/i);
  await page.getByRole('button', { name: /^Gruppo:/ }).click();
  await page.getByRole('button', { name: /^Portare:/ }).click();
  await page.getByRole('button', { name: /^Legno:/ }).click();
  await page.getByRole('button', { name: 'Pronuncia', exact: true }).click();
  const assigned = await saveAndRead(page);
  expect(assigned.resources.wood).toBe(0);
  expect(assigned.stats.commands).toBe(1);
  expect(assigned.units.some((u: { targetId?: string }) => u.targetId === 'wood-a')).toBe(true);
  await page.getByRole('button', { name: 'Velocità 4x' }).click();
  await page.getByRole('button', { name: 'Riprendi il tempo' }).click();
  await expect
    .poll(
      async () =>
        page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).resources.wood, SAVE_KEY),
      { timeout: 12_000 },
    )
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Metti in pausa' }).click();
  const delivered = await saveAndRead(page);
  expect(delivered.entities.find((e: { id: string }) => e.id === 'wood-a').amount).toBeLessThan(4);
  expect(delivered.resources.wood).toBeGreaterThan(0);
});

test('the resource explanation remains readable and selectable on a narrow screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seedResources(page);
  const point = await pilePoint(page, 'stone');
  await mapClick(page, point);
  await expect(details(page)).toBeVisible();
  await expect(details(page)).toContainText(/Pietra/i);
  const map = await page.getByRole('img', { name: /Mappa della valle/ }).boundingBox();
  const card = await details(page).boundingBox();
  expect(map).not.toBeNull();
  expect(card).not.toBeNull();
  const scale = Math.max(map!.width / 1200, map!.height / 800) * 4.5;
  const selected = {
    x: map!.x + map!.width / 2 + (point.x - 250) * 2.4 * scale,
    y: map!.y + map!.height / 2 + (point.y - 250) * 1.6 * scale,
  };
  const coversSelectedResource =
    selected.x >= card!.x &&
    selected.x <= card!.x + card!.width &&
    selected.y >= card!.y &&
    selected.y <= card!.y + card!.height;
  expect(coversSelectedResource, 'the explanation must leave the selected pile visible').toBe(
    false,
  );
  const width = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    view: window.innerWidth,
  }));
  expect(width.page).toBeLessThanOrEqual(width.view);
  await page.screenshot({
    path: '/workspace/artifacts/lingus-resource-readability-mobile.png',
    fullPage: true,
  });
});

test('a fire explains its actual heat coverage and distinguishes a cold hearth without premature numbers', async ({
  page,
}) => {
  await seedResources(page);
  await page.addInitScript((key) => {
    const raw = sessionStorage.getItem('lingus.pending-fire-fixture');
    if (raw) {
      localStorage.setItem(key, raw);
      sessionStorage.removeItem('lingus.pending-fire-fixture');
    }
  }, SAVE_KEY);
  const showFire = async (x: number, active: boolean, numbered = false) => {
    await page.evaluate(
      ({ x, active, numbered, key }) => {
        const s = JSON.parse(localStorage.getItem(key)!);
        s.buildings = [{ id: 'fire', kind: 'campfire', x, y: 250, hp: 100, active }];
        if (numbered) s.words.O_08 = { retention: 100, custodians: [s.units[0].id], uses: 0 };
        sessionStorage.setItem('lingus.pending-fire-fixture', JSON.stringify(s));
      },
      { x, active, numbered, key: SAVE_KEY },
    );
    await page.reload();
    await mapClick(page, { x, y: 250 });
  };
  await showFire(250, true);
  await expect(details(page)).toContainText('Il calore raggiunge tutta la zona');
  await expect(details(page)).toContainText('cerchio dorato');
  await expect(details(page)).not.toContainText(/\d/);
  await showFire(260, true);
  await expect(details(page)).toContainText(
    'Una parte del giaciglio della tribù è fuori dal calore',
  );
  await page.screenshot({ path: '/workspace/artifacts/lingus-fire-coverage.png', fullPage: true });
  await showFire(250, false);
  await expect(details(page)).toContainText('Spento');
  await expect(details(page)).not.toContainText(/\d/);
  await expect(page.locator('.lingus-world__footer')).not.toContainText('1 legna');
  await showFire(250, true, true);
  await expect(details(page)).toContainText('15 metri');
  await showFire(250, false, true);
  await expect(details(page)).toContainText('Spento');
  await expect(details(page)).toContainText('non riscalda');
  await expect(details(page)).toContainText('Serve 1 legna');
  await page.setViewportSize({ width: 375, height: 812 });
  await showFire(260, true, true);
  const map = (await page.getByRole('img', { name: /Mappa della valle/ }).boundingBox())!;
  const card = (await details(page).boundingBox())!;
  const scale = Math.max(map.width / 1200, map.height / 800) * 4.5;
  const fire = { x: map.x + map.width / 2 + 10 * 2.4 * scale, y: map.y + map.height / 2 };
  expect(
    fire.x >= card.x &&
      fire.x <= card.x + card.width &&
      fire.y >= card.y &&
      fire.y <= card.y + card.height,
    'the coverage explanation must leave the selected fire visible',
  ).toBe(false);
});
