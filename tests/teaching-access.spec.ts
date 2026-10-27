import { expect, test, type Page } from '@playwright/test';

/** Prepared fire and knowledge isolate teaching; no claim of a full opening. */
async function seedLesson(page: Page, scenario: 'early' | 'anonymous' | 'already-known' = 'early') {
  await page.goto('/');
  const raw = await page.evaluate(async (scenario) => {
    const { createGame } = await import('/src/game/engine.ts');
    const { emptyInventory } = await import('/src/game/content.ts');
    const state = createGame(6842, 'guided');
    Object.assign(state, {
      started: true,
      paused: true,
      time: 110,
      tier: 2,
      cities: [],
      factions: [],
      entities: [],
      sparks: [],
      campfirePending: false,
    });
    state.units = state.units.filter((unit) => ['Uma', 'Ilo', 'Ayla'].includes(unit.name));
    for (const unit of state.units)
      Object.assign(unit, { x: 250, y: 250, hunger: 20, temp: 100, hp: 100, action: 'idle' });
    const teacher = state.units.find((unit) => unit.name === 'Uma')!;
    teacher.age = 14;
    teacher.knows.push('O_05');
    state.words.O_05 = { retention: 50, custodians: [teacher.id], uses: 0 };
    if (scenario !== 'anonymous') {
      state.words.S_02 = { retention: 100, custodians: state.units.map((u) => u.id), uses: 0 };
      for (const unit of state.units) if (!unit.knows.includes('S_02')) unit.knows.push('S_02');
    }
    state.resources = { ...emptyInventory(), wood: 2, food: 20 };
    state.attention = 0;
    state.buildings = [
      { id: 'fire', kind: 'campfire', ...state.home, hp: 100, active: true, completed: true },
    ];
    if (scenario === 'already-known') {
      state.attention = 10;
      state.words.O_05.retention = 100;
      state.words.O_05.custodians = state.units.map((u) => u.id);
      for (const unit of state.units) if (!unit.knows.includes('O_05')) unit.knows.push('O_05');
    }
    return JSON.stringify(state);
  }, scenario);
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem('teaching-fixture')) return;
    localStorage.setItem('lingus.save.v2', raw);
    sessionStorage.setItem('teaching-fixture', 'applied');
  }, raw);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
}
async function save(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  return state;
}

test('a first Guided lesson explains teacher, pupil and missing Attention then pays before the boundary', async ({
  page,
}) => {
  await seedLesson(page);
  const before = await save(page);
  await page.getByRole('button', { name: /Tramanda al falò/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Attorno al falò' }),
    word = dialog.getByLabel('Parola da tramandare: Fuoco', { exact: true });
  await expect(word).toContainText('Racconta: Uma');
  await expect(word).toContainText('Imparerà: Ilo');
  await expect(word).toContainText('Manca Attenzione');
  await expect(word.getByRole('button', { name: /Tramanda/ })).toBeDisabled();
  await dialog
    .getByRole('button', { name: 'Alimenta il Falò · consuma legna', exact: true })
    .click();
  await expect(word.getByRole('button', { name: /Tramanda/ })).toBeEnabled();
  await word.getByRole('button', { name: /Tramanda/ }).click();
  await expect(dialog.locator('.teaching-outcome')).toContainText('Ilo');
  await expect(word).not.toContainText('Ultimo custode');
  await dialog.getByRole('button', { name: 'Chiudi finestra' }).click();
  const after = await save(page);
  expect(after.resources.wood).toBe(0);
  expect(after.attention).toBe(0);
  expect(after.stats.taught).toBe(1);
  expect(after.words.O_05.custodians).toHaveLength(2);
  expect(after.words.O_05.retention).toBe(70);
  expect(after.burntWood).toBe(before.burntWood);
  expect(after.time).toBe(before.time);
  expect(after.campfirePending).toBe(false);
});

test('early teaching remains physically readable before Io and Numero, also on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedLesson(page, 'anonymous');
  await page
    .getByRole('navigation', { name: 'Sezioni di gioco' })
    .getByRole('button', { name: /^Pensiero/ })
    .click();
  await page.getByRole('button', { name: /Attorno al falò/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Attorno al falò' }),
    word = dialog.getByLabel('Parola da tramandare: Fuoco', { exact: true });
  await expect(word).not.toContainText(/Uma|Ilo|Ayla|\d|%/);
  await expect(word).toContainText('anziana');
  await expect(word).toContainText('bambino');
  await expect(word).toContainText('Manca Attenzione');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a fully shared full word explains why another lesson cannot be bought', async ({ page }) => {
  await seedLesson(page, 'already-known');
  await page.getByRole('button', { name: /Attorno al falò/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Attorno al falò' }),
    word = dialog.getByLabel('Parola da tramandare: Fuoco', { exact: true });
  await expect(word).toContainText(
    'Tutti gli allievi idonei conoscono la parola e la memoria è già piena',
  );
  await expect(word.getByRole('button', { name: /Tramanda/ })).toBeDisabled();
  await expect(
    dialog.getByRole('button', { name: 'Alimenta il Falò · consuma legna', exact: true }),
  ).toBeDisabled();
});
