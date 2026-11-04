import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../src/game/engine';
import { WORDS, emptyInventory } from '../src/game/content';

/** Prepared UI scenes: these exercise reading and actual public controls,
 * without claiming a campaign or granting anything during the interaction. */
async function load(
  page: Page,
  scenario: 'overview' | 'lesson' | 'stocks' | 'puzzle' = 'overview',
) {
  const state = createGame(6842, 'guided');
  Object.assign(state, { started: true, paused: true, tier: 2, time: 610 });
  state.stats.seasonsSurvived = 4;
  state.entities = state.entities.filter((entity) => !['alpha', 'wolf'].includes(entity.kind));
  state.sparks = [];
  state.resources = { ...emptyInventory(), wood: 2, food: 12 };
  if (scenario === 'stocks') Object.assign(state.resources, { food: 30, wood: 30, stone: 30 });
  state.buildings = [
    {
      id: 'interface-fire',
      kind: 'campfire',
      ...state.home,
      hp: 100,
      active: true,
      completed: true,
    },
  ];
  const words = Object.keys(WORDS).filter((id) => WORDS[id].tier <= 2);
  for (const id of words) {
    state.words[id] = {
      retention: 75,
      custodians: state.units.slice(0, 2).map((unit) => unit.id),
      uses: 0,
    };
    for (const unit of state.units.slice(0, 2)) if (!unit.knows.includes(id)) unit.knows.push(id);
  }
  for (const unit of state.units)
    Object.assign(unit, { ...state.home, hunger: 65, hp: 95, temp: 100, action: 'idle' });
  if (scenario === 'puzzle') {
    delete state.words.O_04;
    for (const unit of state.units) unit.knows = unit.knows.filter((id) => id !== 'O_04');
    state.tension.O_04 = 100;
    state.units[0].tension = { O_04: 100 };
    state.sparks = [
      {
        id: 'interface-puzzle',
        wordId: 'O_04',
        unitId: state.units[0].id,
        eventLabel: WORDS.O_04.event,
        expiresAt: state.time + 45,
        recipe: [...WORDS.O_04.recipe],
        hint: WORDS.O_04.hint,
      },
    ];
  }
  if (scenario === 'lesson') {
    state.time = 110;
    state.units = state.units.filter((unit) => ['Uma', 'Ilo', 'Ayla'].includes(unit.name));
    const teacher = state.units.find((unit) => unit.name === 'Uma')!;
    teacher.age = 14;
    state.words = Object.fromEntries(
      Object.entries(state.words).filter(
        ([id]) => WORDS[id].tier === 0 || id === 'O_05' || id === 'S_02',
      ),
    );
    for (const unit of state.units)
      Object.assign(unit, { hunger: 20, knows: unit.knows.filter((id) => id !== 'O_05') });
    teacher.knows.push('O_05');
    state.words.O_05 = { retention: 25, custodians: [teacher.id], uses: 0 };
    state.words.S_02 = { retention: 100, custodians: state.units.map((unit) => unit.id), uses: 0 };
    state.attention = 0;
  }
  await page.addInitScript(
    (raw) => localStorage.setItem('lingus.save.v2', raw),
    JSON.stringify(state),
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return state;
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Sezioni di gioco' });

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 640 },
]) {
  test.describe(`premium interface at ${viewport.width}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });
    test.beforeEach(async ({ page }) => {
      if (viewport.width === 320)
        await page.addInitScript(() =>
          localStorage.setItem(
            'lingus.interface.v1',
            JSON.stringify({ textSize: 'large', contrast: 'high' }),
          ),
        );
    });

    test('starting a story remains reachable while reviewing choices and saves the actual start', async ({
      page,
    }) => {
      await page.goto('/');
      const welcome = page.getByRole('dialog', { name: 'Benvenuto in Lingus', exact: true });
      const start = welcome.getByRole('button', { name: 'Dai inizio alla storia', exact: true });
      await expect(start).toBeInViewport({ ratio: 1 });
      await welcome.evaluate((element) => (element.scrollTop = element.scrollHeight));
      await expect(start).toBeInViewport({ ratio: 1 });
      await welcome.evaluate((element) => (element.scrollTop = 0));
      await start.click();
      await expect(welcome).toHaveCount(0);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
      expect(saved.started).toBe(true);
      expect(saved.playMode).toBe('guided');
      expect(saved.units).toHaveLength(7);
    });

    test('puzzle words keep their full names with readable instructions and solve the actual intuition', async ({
      page,
    }) => {
      const before = await load(page, 'puzzle');
      await page.getByRole('button', { name: 'Nuova intuizione disponibile', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'La Scintilla Cognitiva' });
      expect(
        await dialog
          .locator('.puzzle-label')
          .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
      ).toBeGreaterThanOrEqual(12);
      for (const label of await dialog.locator('.puzzle-words .word-label').all()) {
        expect(
          await label.evaluate(
            (element) =>
              element.scrollWidth <= element.clientWidth + 1 &&
              getComputedStyle(element).textOverflow !== 'ellipsis',
          ),
        ).toBe(true);
      }
      for (const id of WORDS.O_04.recipe)
        await dialog.getByRole('button', { name: new RegExp(`^${WORDS[id].label}:`) }).click();
      await dialog.getByRole('button', { name: 'Dai un nome all’intuizione', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await page.getByRole('button', { name: 'Impostazioni e salvataggi', exact: true }).click();
      await page.getByRole('button', { name: /Salva adesso/ }).click();
      const after = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
      expect(after.words.O_04.learnedRecipe).toEqual(WORDS.O_04.recipe);
      expect(after.words.O_04.custodians).toEqual([before.units[0].id]);
      expect(after.time).toBe(before.time);
      expect(after.voice).toBe(before.voice);
      expect(after.stats.commands).toBe(before.stats.commands);
    });

    test('the current objective and all composer controls are readable inside the phone', async ({
      page,
    }) => {
      await load(page);
      const objective = page.locator('.opening-guide > div > strong');
      await expect(objective).toHaveText('Un pasto per la prossima generazione');
      expect(
        await objective.evaluate((element) => {
          const style = getComputedStyle(element);
          return (
            element.scrollWidth <= element.clientWidth + 1 && style.textOverflow !== 'ellipsis'
          );
        }),
      ).toBe(true);
      await page.getByRole('button', { name: 'Mostra parole', exact: true }).click();
      await page.getByRole('button', { name: /^Gruppo:/ }).click();
      await page.getByRole('button', { name: /^Colpire:/ }).click();
      const close = page.getByRole('button', { name: 'Chiudi parole', exact: true });
      if (await close.isVisible()) await close.click();
      for (const locator of [
        page.getByRole('button', { name: 'Pronuncia', exact: true }),
        page.getByRole('button', { name: 'Apri frasario', exact: true }),
        page.getByRole('button', { name: 'Costruisci: apri le frasi degli edifici', exact: true }),
        page.getByLabel('Dettagli dell’ordine', { exact: true }),
      ]) {
        await expect(locator).toBeVisible();
        const bounds = (await locator.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });

    test('the lexicon exposes compact words and keeps innate detail free of false memory risk', async ({
      page,
    }) => {
      await load(page);
      await nav(page).getByRole('button', { name: 'Pensiero', exact: true }).click();
      await page.getByRole('button', { name: /Il lessico della tribù/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Il lessico della tribù' });
      await expect(dialog.getByText('Il lessico della tribù', { exact: true })).toHaveCount(1);
      const visibleRows = await dialog.locator('.lexicon-panel-word').evaluateAll(
        (rows) =>
          rows.filter((row) => {
            const rect = row.getBoundingClientRect();
            return rect.top >= 0 && rect.bottom <= innerHeight;
          }).length,
      );
      expect(visibleRows).toBeGreaterThanOrEqual(viewport.width === 390 ? 6 : 4);
      await dialog
        .getByRole('searchbox', { name: 'Cerca nel lessico', exact: true })
        .fill('Gruppo');
      const row = dialog.locator('.lexicon-panel-word').first();
      await row.click();
      await expect(row).toHaveAttribute('aria-expanded', 'true');
      const detail = dialog.locator('.lexicon-panel-detail');
      await expect(detail).toContainText('da sempre');
      await expect(detail).not.toContainText(/Memoria|custodi|Tier/);
      await row.click();
      await expect(detail).toHaveCount(0);
    });

    test('abundant stock labels stay fully inside the narrow HUD without hiding their names', async ({
      page,
    }) => {
      await load(page, 'stocks');
      const stocks = page.locator('.world-resources > span[title]');
      await expect(stocks).toHaveCount(3);
      for (const [index, stock] of (await stocks.all()).entries()) {
        await expect(stock.locator('small')).toHaveText(['Cibo', 'Legno', 'Pietra'][index]);
        await expect(stock).toContainText('Abbondante');
        const bounds = (await stock.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
        expect(
          await stock.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        ).toBe(true);
      }
      await expect(page.locator('.world-resources .season-chip')).toBeInViewport({ ratio: 1 });
    });

    test('a first useful teaching action is visible and pays actual fuel and Attention', async ({
      page,
    }) => {
      const before = await load(page, 'lesson');
      await nav(page).getByRole('button', { name: 'Pensiero', exact: true }).click();
      await page.getByRole('button', { name: /Attorno al falò/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Attorno al falò' });
      const fuel = dialog.getByRole('button', {
        name: 'Alimenta il Falò · consuma legno',
        exact: true,
      });
      await expect(fuel).toBeInViewport({ ratio: 1 });
      await expect(dialog).not.toContainText(/Poco attenzione|Nulla attenzione/);
      await fuel.click();
      const lesson = dialog.getByLabel('Parola da tramandare: Fuoco', { exact: true });
      await expect(lesson).toContainText('Uma');
      await expect(lesson).toContainText('Ilo');
      const teach = lesson.getByRole('button', { name: /Tramanda/ });
      await expect(teach).toBeInViewport({ ratio: 1 });
      await page.screenshot({
        path: test.info().outputPath(`paid-first-lesson-${viewport.width}.png`),
      });
      await teach.click();
      await expect(dialog.locator('.teaching-outcome')).toContainText('Ilo');
      await dialog.getByRole('button', { name: 'Chiudi finestra', exact: true }).click();
      await page.getByRole('button', { name: 'Impostazioni e salvataggi', exact: true }).click();
      await page.getByRole('button', { name: /Salva adesso/ }).click();
      const after = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
      expect(after.resources.wood).toBe(before.resources.wood - 2);
      expect(after.attention).toBe(0);
      expect(after.stats.taught).toBe(1);
      expect(after.words.O_05.custodians).toHaveLength(2);
      expect(after.time).toBe(before.time);
    });

    test('new game modes are legible full-width choices rather than narrow paragraphs', async ({
      page,
    }) => {
      await load(page);
      await page.getByRole('button', { name: 'Impostazioni e salvataggi', exact: true }).click();
      await page.getByRole('button', { name: /Una nuova storia/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Cominciare una nuova storia' });
      const guided = dialog.getByRole('button', { name: /^Guidata/ });
      const classic = dialog.getByRole('button', { name: /^Classica/ });
      const first = (await guided.boundingBox())!;
      const second = (await classic.boundingBox())!;
      expect(second.y).toBeGreaterThanOrEqual(first.y + first.height - 1);
      expect(Math.abs(first.x - second.x)).toBeLessThanOrEqual(1);
      expect(first.width).toBeGreaterThan(viewport.width * 0.75);
      await classic.click();
      await expect(classic).toHaveAttribute('aria-pressed', 'true');
      await expect(guided).toHaveAttribute('aria-pressed', 'false');
      await guided.click();
      await expect(guided).toHaveAttribute('aria-pressed', 'true');
      await expect(
        dialog.getByRole('button', { name: 'Chiudi finestra', exact: true }),
      ).toBeInViewport();
      expect(
        await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      ).toBe(true);
    });
  });
}
