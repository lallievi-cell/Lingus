import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 1.5 });

/** Prepared UI scenes isolate the editing flow; no advanced campaign is implied. */
async function scene(page: Page, tier: 0 | 2 | 5 = 0) {
  await page.goto('/');
  const raw = await page.evaluate(async (tier) => {
    const { createGame } = await import('/src/game/engine.ts');
    const { WORD_ORDER, emptyInventory } = await import('/src/game/content.ts');
    const state = createGame(6842, 'guided');
    Object.assign(state, {
      started: true,
      paused: true,
      time: 20,
      tier,
      entities: [],
      cities: [],
      factions: [],
      sparks: [],
      campfirePending: false,
    });
    for (const unit of state.units) Object.assign(unit, { hp: 100, hunger: 20, temp: 100 });
    if (tier > 0) {
      state.resources = { ...emptyInventory(), food: 30, wood: 20, stone: 20, coin: 20 };
      for (const id of WORD_ORDER) {
        state.words[id] = { retention: 100, custodians: state.units.map((u) => u.id), uses: 0 };
        for (const unit of state.units) if (!unit.knows.includes(id)) unit.knows.push(id);
      }
      state.buildings = [
        {
          id: 'flow-fire',
          kind: 'campfire',
          ...state.home,
          hp: 100,
          active: true,
          completed: true,
        },
        {
          id: 'flow-palace',
          kind: 'palace',
          ...state.home,
          hp: 500,
          active: true,
          completed: true,
        },
      ];
    }
    return JSON.stringify(state);
  }, tier);
  // Apply once on the next navigation: the outgoing App may persist its previous
  // state during beforeunload, and must not overwrite this prepared fixture.
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem('mobile-composer-flow-loaded')) return;
    localStorage.setItem('lingus.save.v2', raw);
    sessionStorage.setItem('mobile-composer-flow-loaded', 'yes');
  }, raw);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
}

const palette = (page: Page) => page.getByRole('region', { name: 'Parole per comporre' });
const map = (page: Page) => page.getByRole('img', { name: /Mappa della valle/ });

async function pick(page: Page, label: string) {
  const word = palette(page).getByRole('button', { name: new RegExp(`^${label}:`) });
  await word.scrollIntoViewIfNeeded();
  await word.tap();
}

async function saved(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).tap();
  await page.getByRole('button', { name: /Salva adesso/ }).tap();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
  await page.getByRole('button', { name: 'Chiudi finestra', exact: true }).tap();
  return state;
}

async function expectTappable(control: Locator) {
  await expect(control).toBeInViewport();
  const box = (await control.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(43.5);
  expect(
    await control.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return !!hit && element.contains(hit);
    }),
    'the control must receive touch rather than sit behind a panel',
  ).toBe(true);
}

async function expectPlayableMap(page: Page, viewport: { width: number; height: number }) {
  const sheet = palette(page);
  await expect(sheet).toHaveAttribute('data-mode', 'compact');
  const p = (await sheet.boundingBox())!;
  const world = map(page);
  const m = (await world.boundingBox())!;
  expect(
    p.height,
    'the contextual palette must not recreate the large empty sheet',
  ).toBeLessThanOrEqual(116);
  const landscape = viewport.width > viewport.height;
  if (landscape) {
    expect(p.width).toBeLessThanOrEqual(viewport.width * 0.46);
    expect(p.x - m.x).toBeGreaterThanOrEqual(m.width * 0.5);
  } else {
    const unobscuredHeight = Math.min(m.y + m.height, p.y) - m.y;
    expect(
      unobscuredHeight,
      'the map needs a usable exposed area while choosing words',
    ).toBeGreaterThanOrEqual(viewport.height * 0.25);
  }
  const point = {
    x: m.width * 0.22,
    y: landscape ? m.height * 0.32 : Math.min(m.height * 0.32, p.y - m.y - 18),
  };
  expect(point.y).toBeGreaterThan(8);
  expect(
    await world.evaluate((element, point) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + point.x, box.y + point.y);
      return !!hit && element.contains(hit);
    }, point),
    'the exposed map must actually receive the touch',
  ).toBe(true);
  return point;
}

for (const viewport of [
  { width: 360, height: 640 },
  { width: 390, height: 744 },
  { width: 844, height: 390 },
]) {
  test(`compact suggestions keep the map selectable throughout composition at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await scene(page);
    await page.getByRole('button', { name: 'Spazio 1: chi?', exact: true }).tap();
    const point = await expectPlayableMap(page, viewport);
    await pick(page, 'Gruppo');
    await expectPlayableMap(page, viewport);
    await map(page).tap({ position: point });
    await expect(palette(page)).toBeVisible();
    await expect(page.locator('.sentence-slot.filled')).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: 'Rimuovi bersaglio del comando', exact: true }),
    ).toBeVisible();
    await expectTappable(page.getByRole('button', { name: 'Pronuncia', exact: true }));
    await page.screenshot({
      path: test.info().outputPath('map-with-suggestions.png'),
      animations: 'disabled',
    });
  });

  test(`a completed opening phrase closes its suggestions and can be reused on another map target at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await scene(page);
    const before = await saved(page);
    await page.getByRole('button', { name: 'Tutti gli adulti', exact: true }).tap();
    await page.getByRole('button', { name: 'Mostra parole', exact: true }).tap();
    await pick(page, 'Gruppo');
    await pick(page, 'Andare');
    await expect(palette(page)).not.toBeVisible();
    await expect(page.locator('.sentence-slot.filled')).toHaveCount(2);
    const composed = await saved(page);
    expect(composed.stats.commands).toBe(before.stats.commands);
    expect(composed.voice).toBe(before.voice);
    const canvas = map(page),
      bounds = (await canvas.boundingBox())!;
    await canvas.tap({ position: { x: bounds.width * 0.2, y: bounds.height * 0.3 } });
    await page.getByRole('button', { name: 'Pronuncia', exact: true }).tap();
    const first = await saved(page);
    expect(first.stats.commands).toBe(before.stats.commands + 1);
    expect(first.voice).toBe(before.voice - 1);
    expect(
      first.units.filter((u: { command?: string[] }) => u.command?.join('|') === 'S_01|V_01'),
    ).toHaveLength(6);
    await canvas.tap({ position: { x: bounds.width * 0.33, y: bounds.height * 0.25 } });
    await page.getByRole('button', { name: 'Pronuncia', exact: true }).tap();
    const second = await saved(page);
    expect(second.stats.commands).toBe(before.stats.commands + 2);
    expect(second.voice).toBe(before.voice - 2);
    expect(second.units.map((u: { x: number; y: number }) => [u.x, u.y])).toEqual(
      before.units.map((u: { x: number; y: number }) => [u.x, u.y]),
    );
    await expect(page.locator('.sentence-slot.filled')).toHaveCount(2);
    await expect(palette(page)).not.toBeVisible();
  });
}

test('a grammatically ready hunt keeps its optional large-prey detail available', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 744 });
  await scene(page, 2);
  await page.getByRole('button', { name: 'Mostra parole', exact: true }).tap();
  for (const word of ['Gruppo', 'Colpire', 'Preda']) {
    await pick(page, word);
    await expect(palette(page)).toBeVisible();
    await expect(palette(page)).toHaveAttribute('data-mode', 'compact');
  }
  await pick(page, 'Pericolo');
  await expect(palette(page)).not.toBeVisible();
  for (const [index, word] of ['Gruppo', 'Colpire', 'Preda', 'Pericolo'].entries())
    await expect(page.locator('.sentence-slot').nth(index)).toContainText(word);
  const state = await saved(page);
  expect(state.stats.commands).toBe(0);
  expect(state.voice).toBe(3);
});

test('catalog results remain reachable after width and height change together with search focused', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await scene(page, 5);
  await page.getByRole('button', { name: 'Mostra parole', exact: true }).tap();
  await page.getByRole('button', { name: 'Apri catalogo delle parole', exact: true }).tap();
  const search = palette(page).getByRole('searchbox', {
    name: 'Cerca parole nella barra',
    exact: true,
  });
  await search.fill('Portare');
  await page.setViewportSize({ width: 390, height: 480 });
  await expectTappable(search);
  const result = palette(page).getByRole('button', { name: /^Portare:/ });
  await expectTappable(result);
  await result.tap();
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(1);
  await expect(page.locator('.sentence-slot.filled')).toContainText('Portare');
});

test('six-slot law composition is not cut short and replacing its verb preserves the other words', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 744 });
  await scene(page, 5);
  await page.getByRole('button', { name: 'Mostra parole', exact: true }).tap();
  const phrase = ['Gruppo', 'Conservare', 'Preda', 'Domani', 'Altrimenti', 'Moneta'];
  for (const word of phrase.slice(0, -1)) {
    await pick(page, word);
    await expect(palette(page)).toBeVisible();
  }
  await pick(page, phrase.at(-1)!);
  await expect(palette(page)).not.toBeVisible();
  const verb = page.getByRole('button', { name: 'Modifica Conservare', exact: true });
  await verb.scrollIntoViewIfNeeded();
  await verb.tap();
  await pick(page, 'Portare');
  await expect(
    page.getByRole('button', { name: 'Modifica Portare', exact: true }),
  ).toBeInViewport();
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(6);
  for (const [index, word] of ['Gruppo', 'Portare', ...phrase.slice(2)].entries())
    await expect(page.locator('.sentence-slot').nth(index)).toContainText(word);
  // Undo remains available while editing. Removing the edited final slot must
  // turn the next choice into an append, rather than silently losing that tap.
  await page.getByRole('button', { name: 'Modifica Moneta', exact: true }).tap();
  await page.getByRole('button', { name: 'Rimuovi ultima parola', exact: true }).tap();
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(5);
  await pick(page, 'Moneta');
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Modifica Moneta', exact: true })).toBeVisible();
  const state = await saved(page);
  expect(state.stats.commands).toBe(0);
  expect(state.voice).toBe(3);
});

test('the full catalog is explicit and its search remains usable with a reduced keyboard viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await scene(page, 5);
  await page.getByRole('button', { name: 'Mostra parole', exact: true }).tap();
  await pick(page, 'Gruppo');
  await page.getByRole('button', { name: 'Apri catalogo delle parole', exact: true }).tap();
  await expect(palette(page)).toHaveAttribute('data-mode', 'catalog');
  const search = palette(page).getByRole('searchbox', {
    name: 'Cerca parole nella barra',
    exact: true,
  });
  await expect(search).toBeVisible();
  await search.fill('Portare');
  await page.setViewportSize({ width: 390, height: 480 });
  await expect(search).toBeFocused();
  await expectTappable(search);
  expect(
    await search.evaluate((input) => parseFloat(getComputedStyle(input).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await expectTappable(palette(page).getByRole('button', { name: 'Chiudi parole', exact: true }));
  await pick(page, 'Portare');
  await page.setViewportSize({ width: 390, height: 844 });
  await palette(page).getByRole('button', { name: 'Torna ai suggerimenti', exact: true }).tap();
  await expect(palette(page)).toHaveAttribute('data-mode', 'compact');
  await expect(page.locator('.sentence-slot.filled').nth(0)).toContainText('Gruppo');
  await expect(page.locator('.sentence-slot.filled').nth(1)).toContainText('Portare');
  await expectPlayableMap(page, { width: 390, height: 844 });
  await page.getByRole('button', { name: 'Chiudi parole', exact: true }).tap();
  const state = await saved(page);
  expect(state.stats.commands).toBe(0);
  expect(state.voice).toBe(3);
});
