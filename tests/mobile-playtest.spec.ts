import { expect, test, type Locator, type Page } from '@playwright/test';

// A phone viewport is the space left by the browser chrome, not the entire
// physical display. In particular, 384×720 approximates the reported screenshot.
test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 1.5 });

/** Prepared UI states isolate ergonomics; they are not campaign-balance proofs. */
async function loadPhone(page: Page, late = false) {
  await page.goto('/');
  const raw = await page.evaluate(async (late) => {
    const { createGame } = await import('/src/game/engine.ts');
    const { WORD_ORDER, emptyInventory } = await import('/src/game/content.ts');
    const state = createGame(6842, 'guided');
    Object.assign(state, {
      started: true,
      paused: true,
      time: 20,
      tier: late ? 5 : 0,
      entities: [],
      cities: [],
      factions: [],
      sparks: [],
      campfirePending: false,
    });
    for (const unit of state.units) Object.assign(unit, { hunger: 20, temp: 100, hp: 100 });
    if (late) {
      state.resources = { ...emptyInventory(), food: 30, wood: 20, stone: 20, coin: 20 };
      for (const id of WORD_ORDER) {
        state.words[id] = { retention: 100, custodians: state.units.map((u) => u.id), uses: 0 };
        for (const unit of state.units) if (!unit.knows.includes(id)) unit.knows.push(id);
      }
      state.buildings = [
        {
          id: 'phone-palace',
          kind: 'palace',
          ...state.home,
          hp: 500,
          active: true,
          completed: true,
        },
        {
          id: 'phone-fire',
          kind: 'campfire',
          ...state.home,
          hp: 100,
          active: true,
          completed: true,
        },
      ];
    }
    return JSON.stringify(state);
  }, late);
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem('phone-playtest-loaded')) return;
    localStorage.setItem('lingus.save.v2', raw);
    sessionStorage.setItem('phone-playtest-loaded', 'yes');
  }, raw);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
}

/** A box inside the viewport may still be clipped or covered by another panel. */
async function expectTappable(control: Locator, viewport: { width: number; height: number }) {
  await expect(control).toBeVisible();
  const box = (await control.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(-0.5);
  expect(box.y).toBeGreaterThanOrEqual(-0.5);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5);
  expect(box.height).toBeGreaterThanOrEqual(43.5);
  expect(
    await control.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return !!hit && (hit === element || element.contains(hit));
    }),
    'the visible control must receive a real touch, not sit underneath a drawer',
  ).toBe(true);
}

async function expectMapFirst(page: Page, viewport: { width: number; height: number }) {
  await expect(page.locator('.mobile-word-sheet')).not.toBeVisible();
  const map = (await page.locator('.map-frame').boundingBox())!;
  const composer = (await page
    .getByRole('region', { name: 'Costruttore di frasi' })
    .boundingBox())!;
  const fraction = viewport.width > viewport.height ? 0.25 : 0.4;
  expect(
    map.height,
    'the map must be a usable play area, not a token 80px strip',
  ).toBeGreaterThanOrEqual(viewport.height * fraction);
  expect(map.y + map.height).toBeLessThanOrEqual(composer.y);
  expect(composer.height).toBeLessThanOrEqual(viewport.width > viewport.height ? 140 : 180);
  for (const control of [
    page.getByRole('button', { name: 'Tutti gli adulti', exact: true }),
    page.getByRole('button', { name: 'Raduna al campo', exact: true }),
    page.getByRole('button', { name: 'Mostra parole', exact: true }),
    page.getByRole('button', { name: 'Ingrandisci la mappa', exact: true }),
    page.getByRole('button', { name: 'Riduci la mappa', exact: true }),
  ])
    await expectTappable(control, viewport);
  const dimensions = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    view: innerWidth,
    available: innerHeight,
    strip: (() => {
      const row = document.querySelector('.workbench-tools-row')!;
      return { content: row.scrollWidth, available: row.clientWidth };
    })(),
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.view);
  expect(dimensions.height).toBeLessThanOrEqual(dimensions.available);
  expect(
    dimensions.strip.content,
    'primary actions must not share a horizontally scrolling strip',
  ).toBeLessThanOrEqual(dimensions.strip.available + 1);
}

async function saved(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).tap();
  await page.getByRole('button', { name: /Salva adesso/ }).tap();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
  await page.getByRole('button', { name: 'Chiudi finestra' }).tap();
  return state;
}

for (const viewport of [
  { width: 360, height: 640 },
  { width: 384, height: 720 },
  { width: 412, height: 740 },
  { width: 844, height: 390 },
])
  test(`the initial phone layout gives the map priority and keeps primary controls directly tappable at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await loadPhone(page);
    await expectMapFirst(page, viewport);
    await page.screenshot({
      path: `/tmp/lingus-mobile-audit-after-${viewport.width}.png`,
      fullPage: true,
    });
    if (viewport.width > viewport.height) {
      const person = await page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('lingus.save.v2')!);
        return state.units
          .filter((unit: { age: number; y: number }) => unit.age >= 4 && unit.y < state.home.y)
          .sort((a: { y: number }, b: { y: number }) => a.y - b.y)[0];
      });
      const map = page.getByRole('img', { name: /Mappa della valle/ });
      const bounds = (await map.boundingBox())!;
      const scale = Math.max(bounds.width / 1200, bounds.height / 800) * 4.5;
      await map.tap({
        position: {
          x: bounds.width / 2 + (person.x - 250) * 2.4 * scale,
          y: bounds.height / 2 + ((person.y - 250) * 1.6 - 28 * 0.2) * scale,
        },
      });
      const choices = page.locator('.map-target-choice-list > button');
      if (await choices.first().isVisible()) await choices.first().tap();
      const card = page.getByRole('status', { name: 'Dettagli del bersaglio' });
      await expect(card).toHaveAttribute('data-mobile-placement', 'bottom');
      const cardBounds = (await card.boundingBox())!;
      const minimap = page.locator('.lingus-world__minimap');
      const miniBounds = (await minimap.boundingBox())!;
      expect(
        cardBounds.x >= miniBounds.x + miniBounds.width ||
          cardBounds.x + cardBounds.width <= miniBounds.x,
        'the selected-person card must leave the landscape minimap uncovered',
      ).toBe(true);
      await expectTappable(minimap, viewport);
    }
  });

test('a touch-composed order returns to the map explicitly, keeps the target visible and charges one real Voice', async ({
  page,
}) => {
  const viewport = { width: 384, height: 720 };
  await page.setViewportSize(viewport);
  await loadPhone(page);
  const before = await saved(page);
  await page.getByRole('button', { name: 'Tutti gli adulti', exact: true }).tap();
  await page.getByRole('button', { name: 'Spazio 1: chi?', exact: true }).tap();
  const sheet = page.getByRole('region', { name: 'Parole per comporre' });
  await expect(sheet).toBeVisible();
  for (const word of ['Gruppo', 'Andare'])
    await sheet.getByRole('button', { name: new RegExp(`^${word}:`) }).tap();
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(2);
  await sheet.getByRole('button', { name: 'Scegli il bersaglio', exact: true }).tap();
  await expectMapFirst(page, viewport);
  const map = page.getByRole('img', { name: /Mappa della valle/ });
  const bounds = (await map.boundingBox())!;
  await map.tap({ position: { x: bounds.width * 0.78, y: bounds.height * 0.35 } });
  await expect(
    page.getByRole('button', { name: 'Deseleziona bersaglio', exact: true }),
  ).toBeVisible();
  await expectTappable(page.getByRole('button', { name: 'Pronuncia', exact: true }), viewport);
  await page.getByRole('button', { name: 'Pronuncia', exact: true }).tap();
  const after = await saved(page);
  expect(after.stats.commands).toBe(before.stats.commands + 1);
  expect(after.voice).toBe(before.voice - 1);
  expect(
    after.units.filter((unit: { command?: string[] }) => unit.command?.join('|') === 'S_01|V_01'),
  ).toHaveLength(6);
  expect(after.units.map((unit: { x: number; y: number }) => [unit.x, unit.y])).toEqual(
    before.units.map((unit: { x: number; y: number }) => [unit.x, unit.y]),
  );
  // Focusing a recent order used to scroll the shared primary-action strip,
  // leaving the start of Tutti gli adulti cut off as in the reported screenshot.
  await page.getByRole('button', { name: 'Mostra parole', exact: true }).tap();
  await sheet.getByText('Persone e ordini', { exact: true }).tap();
  await sheet
    .getByLabel('Frasi recenti')
    .getByRole('button', { name: 'Gruppo · Andare', exact: true })
    .tap();
  if (await sheet.isVisible())
    await sheet.getByRole('button', { name: /Torna alla mappa|Scegli il bersaglio/ }).tap();
  await expectMapFirst(page, viewport);
  const nav = page.getByRole('navigation', { name: 'Sezioni di gioco' });
  await nav.getByRole('button', { name: /^Tribù/ }).tap();
  await expect(page.getByLabel('Membri della tribù').getByRole('button')).toHaveCount(7);
  await nav.getByRole('button', { name: 'Pensiero', exact: true }).tap();
  await nav.getByRole('button', { name: 'Mappa', exact: true }).tap();
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(2);
  await expect(page.locator('.mobile-word-sheet')).not.toBeVisible();
});

test('browser-bar resizing and rotation preserve a composed phrase and reachable controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadPhone(page);
  await page.getByRole('button', { name: 'Mostra parole', exact: true }).tap();
  const sheet = page.getByRole('region', { name: 'Parole per comporre' });
  for (const word of ['Gruppo', 'Andare'])
    await sheet.getByRole('button', { name: new RegExp(`^${word}:`) }).tap();
  await sheet.getByRole('button', { name: 'Scegli il bersaglio', exact: true }).tap();
  for (const viewport of [
    { width: 390, height: 640 },
    { width: 844, height: 390 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expectMapFirst(page, viewport);
    await expect(page.locator('.sentence-slot.filled')).toHaveCount(2);
    await expect(page.locator('.sentence-slot.filled').nth(0)).toContainText('Gruppo');
    await expect(page.locator('.sentence-slot.filled').nth(1)).toContainText('Andare');
  }
});

test('all six late-game slots remain editable without deleting the following words', async ({
  page,
}) => {
  await page.setViewportSize({ width: 384, height: 720 });
  await loadPhone(page, true);
  await page.getByRole('button', { name: 'Mostra parole', exact: true }).tap();
  const sheet = page.getByRole('region', { name: 'Parole per comporre' });
  const words = ['Gruppo', 'Conservare', 'Preda', 'Domani', 'Altrimenti', 'Moneta'];
  for (const word of words) {
    const button = sheet.getByRole('button', { name: new RegExp(`^${word}:`) });
    await button.scrollIntoViewIfNeeded();
    await button.tap();
  }
  await sheet.getByRole('button', { name: 'Scegli il bersaglio', exact: true }).tap();
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(6);
  const verb = page.locator('.sentence-slot').nth(1);
  await verb.scrollIntoViewIfNeeded();
  await verb.tap();
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: /^Portare:/ }).tap();
  await sheet.getByRole('button', { name: 'Scegli il bersaglio', exact: true }).tap();
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(6);
  const expected = ['Gruppo', 'Portare', ...words.slice(2)];
  for (const [index, word] of expected.entries())
    await expect(page.locator('.sentence-slot').nth(index)).toContainText(word);
  const middle = page.locator('.sentence-slot').nth(2);
  await middle.scrollIntoViewIfNeeded();
  await middle.tap();
  await sheet.getByRole('button', { name: 'Rimuovi parola selezionata', exact: true }).tap();
  await expect(sheet).not.toBeVisible();
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(5);
  for (const [index, word] of expected.filter((_, index) => index !== 2).entries())
    await expect(page.locator('.sentence-slot').nth(index)).toContainText(word);
  const state = await saved(page);
  expect(state.stats.commands).toBe(0);
  expect(state.voice).toBe(3);
});

test('search and close stay visible while a reduced viewport simulates the on-screen keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadPhone(page, true);
  await page.getByRole('button', { name: 'Mostra parole', exact: true }).tap();
  const sheet = page.getByRole('region', { name: 'Parole per comporre' });
  await sheet.getByRole('button', { name: /^Gruppo:/ }).tap();
  await sheet.getByRole('button', { name: 'Cerca e filtra parole', exact: true }).tap();
  const search = sheet.getByRole('searchbox', { name: 'Cerca parole nella barra', exact: true });
  await search.fill('Portare');
  await page.setViewportSize({ width: 390, height: 480 });
  await expect(search).toBeFocused();
  await expectTappable(search, { width: 390, height: 480 });
  expect(
    await search.evaluate((input) => parseFloat(getComputedStyle(input).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await expectTappable(sheet.getByRole('button', { name: 'Chiudi parole', exact: true }), {
    width: 390,
    height: 480,
  });
  await expect(sheet.getByRole('button', { name: /^Portare:/ })).toBeVisible();
  await sheet.getByRole('button', { name: /^Portare:/ }).tap();
  await page.setViewportSize({ width: 390, height: 844 });
  await sheet.getByRole('button', { name: 'Scegli il bersaglio', exact: true }).tap();
  await expectMapFirst(page, { width: 390, height: 844 });
  await expect(page.locator('.sentence-slot.filled').nth(0)).toContainText('Gruppo');
  await expect(page.locator('.sentence-slot.filled').nth(1)).toContainText('Portare');
});
