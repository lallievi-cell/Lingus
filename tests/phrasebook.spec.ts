import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../src/game/engine';
import type { GameState } from '../src/game/types';

function camp(builder = true) {
  const state = createGame(6842, 'guided');
  Object.assign(state, { started: true, paused: true, tier: builder ? 2 : 0 });
  if (builder)
    for (const id of [
      'S_02',
      'O_01',
      'O_02',
      'O_03',
      'O_04',
      'O_05',
      'V_04',
      'V_05',
      'V_06',
      'V_08',
    ]) {
      state.words[id] = { retention: 100, custodians: state.units.map((unit) => unit.id), uses: 0 };
      for (const unit of state.units) if (!unit.knows.includes(id)) unit.knows.push(id);
    }
  return state;
}
async function load(page: Page, state: GameState) {
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem('phrasebook-fixture')) return;
    localStorage.setItem('lingus.save.v2', raw);
    sessionStorage.setItem('phrasebook-fixture', 'yes');
  }, JSON.stringify(state));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
}
async function saved(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const result = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
  await page.getByRole('button', { name: 'Chiudi finestra', exact: true }).click();
  return result as GameState;
}
async function point(page: Page) {
  const canvas = page.getByRole('img', { name: /Mappa della valle/ });
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * 0.28, y: box.height * 0.52 } });
}
async function word(page: Page, label: string, mobile: boolean) {
  if (mobile && !(await page.getByRole('region', { name: 'Parole per comporre' }).isVisible()))
    await page.getByRole('button', { name: 'Mostra parole', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`^${label}:`) }).click();
}
const book = (page: Page) =>
  page
    .getByRole('region', { name: 'Frasario', exact: true })
    .or(page.getByRole('dialog', { name: 'Frasario', exact: true }));

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1440, height: 1050 },
]) {
  test(`construction shortcuts explain real benefits and prepare a saved favorite without spending at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    if (viewport.width === 320)
      await page.addInitScript(() =>
        localStorage.setItem(
          'lingus.interface.v1',
          JSON.stringify({ textSize: 'large', contrast: 'high' }),
        ),
      );
    const state = camp();
    await load(page, state);
    const trigger = page.getByRole('button', {
      name: 'Costruisci: apri le frasi degli edifici',
      exact: true,
    });
    await expect(trigger).toBeVisible();
    expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      await trigger.evaluate((element) => {
        const b = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2));
      }),
    ).toBe(true);
    await point(page);
    await trigger.click();
    const library = book(page);
    await page.screenshot({ path: test.info().outputPath('library-in-game.png') });
    await expect(library.getByRole('tab', { name: 'Costruzioni', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const house = library.getByRole('article', { name: 'Casa in muratura', exact: true });
    await expect(house.locator('.phrasebook-description')).toContainText('Ospita famiglie');
    await expect(house.locator('.phrasebook-description')).not.toContainText(/\d|%/);
    await expect(library).not.toContainText('Archivio reale');
    if (viewport.width < 600) {
      const canvas = (await page.getByRole('img', { name: /Mappa della valle/ }).boundingBox())!;
      const panel = (await library.boundingBox())!;
      const clearHeight = Math.max(0, Math.min(canvas.y + canvas.height, panel.y) - canvas.y);
      expect(
        clearHeight,
        'a useful strip of the actual map must remain visible',
      ).toBeGreaterThanOrEqual(70);
    }
    await house
      .getByRole('button', { name: 'Aggiungi Casa in muratura alle preferite', exact: true })
      .click();
    await library.screenshot({ path: test.info().outputPath('construction-book.png') });
    await house
      .getByRole('button', { name: 'Prepara la frase: Casa in muratura', exact: true })
      .click();
    await expect(library).toHaveCount(0);
    await expect(page.locator('.sentence-slot.filled')).toHaveCount(4);
    if (viewport.width <= 860)
      await expect(page.getByRole('status', { name: 'Bersaglio del comando' })).toContainText(
        'Scegli sulla mappa',
      );
    const after = await saved(page);
    expect(after.stats.commands).toBe(0);
    expect(after.resources).toEqual(state.resources);
    expect(after.seed).toBe(state.seed);
    expect(after.phrasebook).toContainEqual({
      id: 'S_01|V_08|O_02|O_01',
      tokens: ['S_01', 'V_08', 'O_02', 'O_01'],
      favorite: true,
    });
    await page.reload();
    await page.getByRole('button', { name: 'Apri frasario', exact: true }).click();
    await book(page).getByRole('tab', { name: 'Preferite', exact: true }).click();
    await expect(
      book(page).getByRole('article', { name: 'Casa in muratura', exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('accepted phrases survive reload and can be recalled without their old target or another Voice charge', async ({
  page,
}) => {
  await load(page, camp(false));
  await word(page, 'Gruppo', false);
  await word(page, 'Andare', false);
  await point(page);
  await page.getByRole('button', { name: 'Pronuncia', exact: true }).click();
  const first = await saved(page);
  expect(first.phrasebook?.[0]).toMatchObject({ id: 'S_01|V_01', lastUsedAt: 0, firstUsedAt: 0 });
  expect(first.stats.commands).toBe(1);
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: /Esporta partita/ }).click();
  const downloaded = await downloading;
  const stream = (await downloaded.createReadStream())!;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  const exported = Buffer.concat(chunks);
  expect(JSON.parse(exported.toString()).phrasebook).toEqual(first.phrasebook);
  await page.keyboard.press('Escape');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'phrasebook-story.json',
    mimeType: 'application/json',
    buffer: exported,
  });
  await expect(page.locator('.toast')).toContainText('Partita importata in pausa');
  await page.reload();
  await page.getByRole('button', { name: 'Apri frasario', exact: true }).click();
  await book(page).getByRole('tab', { name: 'Recenti', exact: true }).click();
  const order = book(page).getByRole('article', { name: 'Raggiungi un luogo', exact: true });
  await expect(order).toContainText('luogo o il bersaglio');
  await order
    .getByRole('button', { name: 'Prepara la frase: Raggiungi un luogo', exact: true })
    .click();
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(2);
  const next = await saved(page);
  expect(next.voice).toBe(first.voice);
  expect(next.stats.commands).toBe(1);
  expect(next.time).toBe(0);
});

test('a recorded lost phrase stays explainable and its favorite can be removed without restoring the word', async ({
  page,
}) => {
  const state = camp();
  state.words.O_02.retention = 0;
  state.words.O_02.custodians = [];
  for (const unit of state.units) unit.knows = unit.knows.filter((id) => id !== 'O_02');
  state.phrasebook = [
    {
      id: 'S_01|V_08|O_02|O_01',
      tokens: ['S_01', 'V_08', 'O_02', 'O_01'],
      favorite: true,
      firstUsedAt: 0,
      lastUsedAt: 0,
    },
  ];
  await load(page, state);
  await page.getByRole('button', { name: 'Apri frasario', exact: true }).click();
  await book(page).getByRole('tab', { name: 'Preferite', exact: true }).click();
  const house = book(page).getByRole('article', { name: 'Casa in muratura', exact: true });
  await expect(house).toContainText('Da riscoprire: Pietra');
  await expect(
    house.getByRole('button', { name: 'Prepara la frase: Casa in muratura', exact: true }),
  ).toBeDisabled();
  await house
    .getByRole('button', { name: 'Rimuovi Casa in muratura dalle preferite', exact: true })
    .click();
  await expect(book(page)).toContainText('Aggiungi una stella alle frasi');
  await page.keyboard.press('Escape');
  const next = await saved(page);
  expect(next.words.O_02.retention).toBe(0);
  expect(next.phrasebook![0].favorite).toBe(false);
});

test('a composed phrase can be saved as a favorite without inventing a use or spending anything', async ({
  page,
}) => {
  const state = camp(false);
  await load(page, state);
  await word(page, 'Gruppo', false);
  await word(page, 'Andare', false);
  await page.getByRole('button', { name: 'Apri frasario', exact: true }).click();
  await book(page).getByRole('button', { name: 'Salva la frase composta', exact: true }).click();
  await book(page).getByRole('tab', { name: 'Preferite', exact: true }).click();
  await expect(
    book(page).getByRole('article', { name: 'Raggiungi un luogo', exact: true }),
  ).toBeVisible();
  await book(page).getByRole('tab', { name: 'Recenti', exact: true }).click();
  await expect(book(page)).toContainText('Le frasi già pronunciate compariranno qui');
  await page.keyboard.press('Escape');
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(2);
  const next = await saved(page);
  expect(next.phrasebook).toEqual([{ id: 'S_01|V_01', tokens: ['S_01', 'V_01'], favorite: true }]);
  expect(next.stats.commands).toBe(0);
  expect(next.voice).toBe(state.voice);
  expect(next.resources).toEqual(state.resources);
});

test('an order refused by the real handler does not become a remembered success', async ({
  page,
}) => {
  const state = camp(false);
  // Prepared absence of adults isolates the distinction between a grammatical
  // phrase and an order that the tribe can actually acknowledge.
  for (const unit of state.units) unit.age = 2;
  await load(page, state);
  await word(page, 'Gruppo', false);
  await word(page, 'Andare', false);
  await point(page);
  await page.getByRole('button', { name: 'Pronuncia', exact: true }).click();
  const next = await saved(page);
  expect(next.stats.commands).toBe(0);
  expect(next.phrasebook).toBeUndefined();
  expect(next.voice).toBe(state.voice);
});

test('switching libraries starts with a complete row and details open without preparing or spending', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = camp();
  await load(page, state);
  await page.getByRole('button', { name: 'Apri frasario', exact: true }).click();
  const library = book(page);
  await library.locator('.phrasebook-results').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await library.getByRole('tab', { name: 'Costruzioni', exact: true }).click();
  const results = library.getByRole('tabpanel');
  await expect.poll(() => results.evaluate((element) => element.scrollTop)).toBe(0);
  const first = library.getByRole('article').first();
  const panelBounds = (await results.boundingBox())!;
  const rowBounds = (await first.boundingBox())!;
  expect(rowBounds.y).toBeGreaterThanOrEqual(panelBounds.y);
  await page.screenshot({ path: test.info().outputPath('compact-construction-library.png') });
  const toggle = first.getByRole('button', { name: /^Dettagli della frase:/ });
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(first.getByRole('region', { name: 'Materiali e gestione' })).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(first.getByRole('region', { name: 'Materiali e gestione' })).toBeVisible();
  await expect(first.getByLabel('Parole della frase')).toBeVisible();
  await library.screenshot({ path: test.info().outputPath('expanded-building-recipe.png') });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await library.getByRole('button', { name: 'Chiudi frasario', exact: true }).click();
  const after = await saved(page);
  expect(after.voice).toBe(state.voice);
  expect(after.stats.commands).toBe(0);
  expect(after.resources).toEqual(state.resources);
  expect(after.phrasebook).toBeUndefined();
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`the library expands into a useful catalogue and prepares freely at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    if (viewport.width === 320)
      await page.addInitScript(() =>
        localStorage.setItem(
          'lingus.interface.v1',
          JSON.stringify({ textSize: 'large', contrast: 'high' }),
        ),
      );
    const state = camp();
    await load(page, state);
    await page.getByRole('button', { name: 'Apri frasario', exact: true }).click();
    const library = book(page);
    const results = library.getByRole('tabpanel');
    const compactHeight = (await results.boundingBox())!.height;
    await library.getByRole('button', { name: 'Espandi frasario', exact: true }).click();
    await expect(library).toHaveAttribute('data-expanded', 'true');
    const readingHeight = (await results.boundingBox())!.height;
    expect(readingHeight - compactHeight).toBeGreaterThanOrEqual(80);
    const completeRows = await results.getByRole('article').evaluateAll((rows) => {
      const frame = rows[0].parentElement!.getBoundingClientRect();
      return rows.filter((row) => {
        const box = row.getBoundingClientRect();
        return box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1;
      }).length;
    });
    expect(completeRows).toBeGreaterThanOrEqual(viewport.width === 390 ? 4 : 2);
    await page.screenshot({ path: test.info().outputPath('expanded-reading-catalogue.png') });
    const search = library.getByRole('searchbox', { name: 'Cerca nel frasario', exact: true });
    await search.fill('Casa');
    const house = library.getByRole('article', { name: 'Casa in muratura', exact: true });
    const details = house.getByRole('button', {
      name: 'Dettagli della frase: Casa in muratura',
      exact: true,
    });
    await details.click();
    await library.getByRole('button', { name: 'Riduci frasario', exact: true }).click();
    await expect(search).toHaveValue('Casa');
    await expect(details).toHaveAttribute('aria-expanded', 'true');
    await library.getByRole('button', { name: 'Espandi frasario', exact: true }).click();
    const row = (await house.boundingBox())!;
    const body = (await results.boundingBox())!;
    expect(row.y).toBeGreaterThanOrEqual(body.y - 1);
    await house
      .getByRole('button', { name: 'Prepara la frase: Casa in muratura', exact: true })
      .click();
    await expect(library).toHaveCount(0);
    await expect(page.locator('.sentence-slot.filled')).toHaveCount(4);
    const after = await saved(page);
    expect(after.stats.commands).toBe(state.stats.commands);
    expect(after.voice).toBe(state.voice);
    expect(after.resources).toEqual(state.resources);
    expect(after.time).toBe(state.time);
  });
}

test('the expanded catalogue keeps its controls and first result readable through keyboard resize and rotation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page, camp());
  await page.getByRole('button', { name: 'Apri frasario', exact: true }).click();
  const library = book(page);
  await library.getByRole('button', { name: 'Espandi frasario', exact: true }).click();
  const search = library.getByRole('searchbox', { name: 'Cerca nel frasario', exact: true });
  await search.fill('Casa');
  for (const viewport of [
    { width: 390, height: 420 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(search).toBeInViewport({ ratio: 1 });
    await expect(
      library.getByRole('button', { name: 'Chiudi frasario', exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      library.getByRole('button', { name: 'Riduci frasario', exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await expect(search).toHaveValue('Casa');
    const first = (await library.getByRole('article').first().boundingBox())!;
    const results = (await library.getByRole('tabpanel').boundingBox())!;
    expect(first.y).toBeGreaterThanOrEqual(results.y - 1);
    expect(first.y + first.height).toBeLessThanOrEqual(results.y + results.height + 1);
    expect(await library.evaluate((element) => element.scrollTop)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await library.getByRole('button', { name: 'Chiudi frasario', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pronuncia', exact: true })).toBeInViewport();
});

test('a phone with browser bars retains a useful compact list and a clear map strip', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 744 });
  await load(page, camp());
  await page.getByRole('button', { name: 'Apri frasario', exact: true }).click();
  const library = book(page);
  const results = (await library.getByRole('tabpanel').boundingBox())!;
  expect(results.height).toBeGreaterThanOrEqual(230);
  const map = (await page.getByRole('img', { name: /Mappa della valle/ }).boundingBox())!;
  const sheet = (await library.boundingBox())!;
  expect(Math.min(map.y + map.height, sheet.y) - map.y).toBeGreaterThanOrEqual(70);
  const first = (await library.getByRole('article').first().boundingBox())!;
  expect(first.y).toBeGreaterThanOrEqual(results.y - 1);
  await page.screenshot({ path: test.info().outputPath('compact-with-browser-bars.png') });
  await library.getByRole('button', { name: 'Chiudi frasario', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apri frasario', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Pronuncia', exact: true })).toBeInViewport();
});

test('expanded reading contains keyboard focus and Escape returns through the compact catalogue', async ({
  page,
}) => {
  await load(page, camp());
  for (const viewport of [
    { width: 390, height: 744 },
    { width: 1440, height: 1050 },
  ]) {
    await page.setViewportSize(viewport);
    const trigger = page.getByRole('button', { name: 'Apri frasario', exact: true });
    await trigger.click();
    await book(page).getByRole('button', { name: 'Espandi frasario', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Frasario', exact: true });
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    if (viewport.width === 1440) {
      const audio = page.getByRole('button', { name: /^(Attiva|Disattiva) suoni$/ });
      const wasMuted = await audio.getAttribute('aria-pressed');
      const settings = page.getByRole('button', { name: 'Impostazioni e salvataggi' });
      for (const backgroundControl of [audio, settings]) {
        const bounds = (await backgroundControl.boundingBox())!;
        expect(
          await backgroundControl.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return document
              .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
              ?.classList.contains('phrasebook-scrim');
          }),
          'expanded reading must intercept clicks on controls outside the centered catalogue',
        ).toBe(true);
        await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await expect(dialog).toBeVisible();
      }
      await expect(audio).toHaveAttribute('aria-pressed', wasMuted!);
      await expect(page.getByRole('dialog', { name: 'Impostazioni e salvataggi' })).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath('expanded-desktop-with-scrim.png') });
    }
    const reduce = dialog.getByRole('button', { name: 'Riduci frasario', exact: true });
    const last = dialog.getByRole('button').last();
    await last.focus();
    await page.keyboard.press('Tab');
    await expect(reduce).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(last).toBeFocused();
    await page.keyboard.press('Escape');
    const compact = page.getByRole('region', { name: 'Frasario', exact: true });
    await expect(compact).not.toHaveAttribute('aria-modal');
    await expect(page.locator('.phrasebook-scrim')).toHaveCount(0);
    await expect(
      compact.getByRole('button', { name: 'Espandi frasario', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(compact).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});
