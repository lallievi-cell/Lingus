import { expect, test, type Page } from '@playwright/test';

const SAVE_KEY = 'lingus.save.v2';
type StockScene =
  | 'early'
  | 'known-summary'
  | 'all-materials'
  | 'returning'
  | 'fraction'
  | 'depleted';

async function restore(page: Page, raw: string) {
  await page.addInitScript(
    ({ key, raw, marker }) => {
      if (!sessionStorage.getItem(marker)) {
        localStorage.setItem(key, raw);
        sessionStorage.setItem(marker, 'applied');
      }
    },
    { key: SAVE_KEY, raw, marker: `camp-stocks.${Date.now()}.${Math.random()}` },
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Riprendi il tempo' })).toBeVisible();
}

async function seedStocks(page: Page, scene: StockScene = 'early') {
  await page.goto('/');
  const raw = await page.evaluate(async (scene) => {
    const { createGame, issueCommand, tick } = await import('/src/game/engine.ts');
    const { emptyInventory, RESOURCE_ORDER } = await import('/src/game/content.ts');
    let s = createGame(6842);
    s.started = true;
    s.paused = true;
    s.resources = emptyInventory();
    s.entities = [];
    s.buildings = [];
    s.cities = [];
    s.factions = [];
    s.units.forEach((u, index) => {
      u.x = 248 + (index % 3) * 2;
      u.y = 250 + Math.floor(index / 3) * 2;
      u.hunger = 20;
      u.temp = 100;
    });
    const learn = (id: string) => {
      s.words[id] = { retention: 100, custodians: [s.units[0].id], uses: 0 };
      if (!s.units[0].knows.includes(id)) s.units[0].knows.push(id);
    };
    if (scene === 'known-summary') {
      learn('M_02');
      learn('C_01');
      Object.assign(s.resources, { food: 12, wood: 12, stone: 12, pelt: 3 });
    } else if (scene === 'all-materials') {
      // A presentation fixture: held goods must remain inspectable even without
      // the corresponding words. This does not claim an ordinary opening route.
      for (const [index, resource] of RESOURCE_ORDER.entries()) s.resources[resource] = index + 1;
    } else if (scene === 'fraction' || scene === 'depleted') {
      learn('O_08');
      s.resources.pelt = scene === 'fraction' ? 0.01 : 0;
    } else if (scene === 'returning') {
      s.tier = 1;
      for (const id of ['O_01', 'O_03', 'V_04', 'V_05']) learn(id);
      s.units = s.units.slice(0, 1);
      Object.assign(s.units[0], { x: 250, y: 250 });
      s.entities = [
        {
          id: 'stock-transport-tree',
          kind: 'tree',
          x: 264,
          y: 250,
          amount: 20,
          maxAmount: 20,
          hp: 100,
          maxHp: 100,
        },
      ];
      s.paused = false;
      s = issueCommand(s, ['S_01', 'V_04', 'O_03'], {
        type: 'entity',
        id: 'stock-transport-tree',
        x: 264,
        y: 250,
      });
      for (let step = 0; step < 100 && !s.units[0].carry; step++) s = tick(s, 0.25);
      if (s.units[0].action !== 'returning' || !s.units[0].carry)
        throw new Error('The transport fixture never collected a real load.');
      s.paused = true;
    } else {
      Object.assign(s.resources, { food: 7, meat: 2, wood: 8, stone: 5, pelt: 3 });
    }
    return JSON.stringify(s);
  }, scene);
  await restore(page, raw);
  return JSON.parse(raw);
}

const stocksDialog = (page: Page) => page.getByRole('dialog', { name: 'Scorte del campo' });
const stockRow = (page: Page, resource: string) =>
  stocksDialog(page).locator(`.camp-inventory-row[data-resource="${resource}"]`);

async function openStocks(page: Page) {
  await page.getByRole('button', { name: 'Scorte del campo', exact: true }).click();
  await expect(stocksDialog(page)).toBeVisible();
}

async function clickStoredPelts(page: Page) {
  const point = await page.evaluate(async () => {
    const { getCampStockSlots } = await import('/src/components/campInventory.ts');
    const s = JSON.parse(localStorage.getItem('lingus.save.v2')!);
    const slot = getCampStockSlots(s).find((slot) => slot.group === 'pelt');
    if (!slot) throw new Error('The camp has no stored pelts to inspect.');
    return { x: slot.x, y: slot.y };
  });
  const canvas = page.getByRole('img', { name: /Mappa della valle/ });
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const scale = Math.max(bounds!.width / 1200, bounds!.height / 800) * 4.5;
  await canvas.click({
    position: {
      x: bounds!.width / 2 + (point.x - 250) * 2.4 * scale,
      y: bounds!.height / 2 + (point.y - 250) * 1.6 * scale,
    },
  });
}

for (const width of [1440, 390]) {
  test(`camp goods remain visible and inspectable before Domani at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1050 });
    const initial = await seedStocks(page);
    expect(initial.words.M_02).toBeUndefined();
    expect(initial.words.V_06).toBeUndefined();
    await expect(page.getByRole('button', { name: 'Scorte del campo', exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`camp-stocks-map-${width}.png`) });

    await clickStoredPelts(page);
    await expect(stocksDialog(page)).toBeVisible();
    for (const resource of ['food', 'meat', 'wood', 'stone', 'pelt']) {
      const row = stockRow(page, resource);
      await expect(row).toBeVisible();
      await expect(row.locator('.camp-inventory-quantity')).not.toContainText(/\d/);
      await expect(row).not.toHaveClass(/is-empty/);
    }
    await expect(stockRow(page, 'pelt')).toContainText('Pelli');
    await expect(stocksDialog(page).locator('.camp-inventory-capacity')).not.toContainText(/\d/);
    await expect(stocksDialog(page)).not.toContainText('Quanto basta');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: test.info().outputPath(`camp-stocks-inventory-${width}.png`) });

    await stocksDialog(page).getByRole('button', { name: 'Chiudi finestra' }).click();
    await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
    await page.getByRole('button', { name: /Salva adesso/ }).click();
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
    expect(saved.resources).toEqual(initial.resources);
    expect(saved.entities).toEqual(initial.entities);
    expect(saved.stats.commands).toBe(initial.stats.commands);
  });
}

test('the qualitative stock summary stays compact after Domani on a narrow phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const initial = await seedStocks(page, 'known-summary');
  expect(initial.words.O_08).toBeUndefined();
  const summary = page.locator('.world-resources');
  const resources = summary.locator('> span[title]');
  await expect(resources).toHaveCount(3);
  for (const chip of await resources.all()) {
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('Discreta');
    await expect(chip).not.toContainText(/\d|Quanto basta|Una discreta scorta/);
  }
  await expect(summary.locator('.season-chip')).toBeVisible();
  await expect(summary.locator('.season-chip')).not.toContainText(/\d/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('camp-stocks-summary-360.png') });

  await openStocks(page);
  for (const resource of ['food', 'wood', 'stone'])
    await expect(stockRow(page, resource).locator('.camp-inventory-quantity')).toHaveText(
      'Una discreta scorta',
    );
  await expect(stockRow(page, 'pelt')).toBeVisible();
  await expect(stockRow(page, 'pelt')).toContainText('Pelli');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('stored goods remain an ordinary destination while an order is ready', async ({ page }) => {
  await seedStocks(page);
  await page.getByRole('button', { name: /^Gruppo:/ }).click();
  await page.getByRole('button', { name: /^Andare:/ }).click();
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(2);
  await expect(page.locator('.lingus-world')).toHaveClass(/is-targeting/);

  await clickStoredPelts(page);
  await expect(stocksDialog(page)).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Deseleziona bersaglio', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.sentence-slot.filled').nth(0)).toContainText('Gruppo');
  await expect(page.locator('.sentence-slot.filled').nth(1)).toContainText('Andare');
  await expect(page.getByRole('button', { name: 'Pronuncia', exact: true })).toBeEnabled();
  await expect(page.locator('.lingus-world')).toHaveClass(/is-targeting/);
});

test('all fourteen held materials are listed without granting their words or revealing counts', async ({
  page,
}) => {
  const initial = await seedStocks(page, 'all-materials');
  await openStocks(page);
  await expect(stocksDialog(page).locator('.camp-inventory-row')).toHaveCount(14);
  for (const resource of Object.keys(initial.resources)) {
    await expect(stockRow(page, resource).locator('.camp-inventory-quantity')).not.toContainText(
      /\d/,
    );
    await expect(stockRow(page, resource)).not.toHaveClass(/is-empty/);
  }
  expect(initial.words.O_07).toBeUndefined();
  await expect(stocksDialog(page)).toContainText(/Pelli/);
});

test('a real returning load stays separate from stocks until it is delivered', async ({ page }) => {
  await seedStocks(page, 'returning');
  await openStocks(page);
  await expect(stockRow(page, 'wood')).toHaveClass(/is-empty/);
  await expect(stockRow(page, 'wood').locator('.camp-inventory-incoming')).toContainText(
    /In arrivo/i,
  );
  const before = await page.evaluate(async () => {
    const { getCampStockSlots } = await import('/src/components/campInventory.ts');
    const s = JSON.parse(localStorage.getItem('lingus.save.v2')!);
    return getCampStockSlots(s).map((slot) => slot.group);
  });
  expect(before).not.toContain('wood');

  const delivered = await page.evaluate(async () => {
    const { tick } = await import('/src/game/engine.ts');
    let s = JSON.parse(localStorage.getItem('lingus.save.v2')!);
    s.paused = false;
    for (let step = 0; step < 120 && s.resources.wood === 0; step++) s = tick(s, 0.25);
    if (s.resources.wood <= 0) throw new Error('The returning load never reached camp.');
    s.paused = true;
    return JSON.stringify(s);
  });
  await restore(page, delivered);
  await openStocks(page);
  await expect(stockRow(page, 'wood')).not.toHaveClass(/is-empty/);
  await expect(stockRow(page, 'wood').locator('.camp-inventory-incoming')).toHaveCount(0);
  const after = await page.evaluate(async () => {
    const { getCampStockSlots } = await import('/src/components/campInventory.ts');
    return getCampStockSlots(JSON.parse(localStorage.getItem('lingus.save.v2')!)).map(
      (slot) => slot.group,
    );
  });
  expect(after).toContain('wood');
});

test('Numero distinguishes a positive remainder from an empty stock and empty piles disappear', async ({
  page,
}) => {
  await seedStocks(page, 'fraction');
  await openStocks(page);
  const remainder = stockRow(page, 'pelt').locator('.camp-inventory-quantity');
  await expect(remainder).toContainText(/\d/);
  await expect(remainder).not.toHaveText(/^0(?:[,.]0+)?$/);
  await expect(stockRow(page, 'pelt')).not.toHaveClass(/is-empty/);

  await seedStocks(page, 'depleted');
  await openStocks(page);
  await expect(stockRow(page, 'pelt')).toHaveClass(/is-empty/);
  const slots = await page.evaluate(async () => {
    const { getCampStockSlots } = await import('/src/components/campInventory.ts');
    return getCampStockSlots(JSON.parse(localStorage.getItem('lingus.save.v2')!)).map(
      (slot) => slot.group,
    );
  });
  expect(slots).not.toContain('pelt');
});
