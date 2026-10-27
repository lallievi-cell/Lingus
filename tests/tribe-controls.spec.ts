import { expect, test, type Page } from '@playwright/test';

/** Prepared scattered village; selection and the paid order use the real engine. */
async function scatteredVillage(page: Page, cargo = false) {
  await page.goto('/');
  const raw = await page.evaluate(async (cargo) => {
    const { createGame } = await import('/src/game/engine.ts');
    const { WORD_ORDER, emptyInventory } = await import('/src/game/content.ts');
    const state = createGame(6842, 'guided');
    Object.assign(state, {
      started: true,
      paused: true,
      tier: 3,
      time: 20,
      entities: [],
      cities: [],
      factions: [],
      buildings: [],
      sparks: [],
      resources: { ...emptyInventory(), food: 20 },
    });
    state.units = state.units.slice(0, 4);
    for (const [index, unit] of state.units.entries())
      Object.assign(unit, {
        x: 250 + index * 25,
        y: 250,
        age: index === 3 ? 1 : 6,
        action: 'idle',
        hp: 100,
        temp: 100,
        hunger: 20,
        command: undefined,
        progress: 0,
      });
    for (const id of WORD_ORDER) {
      state.words[id] = { retention: 100, uses: 0, custodians: state.units.map((u) => u.id) };
      for (const unit of state.units) if (!unit.knows.includes(id)) unit.knows.push(id);
    }
    if (cargo)
      Object.assign(state.units[1], {
        action: 'returning',
        carry: { resource: 'wood', amount: 3 },
        command: ['S_01', 'V_04', 'O_03'],
      });
    return JSON.stringify(state);
  }, cargo);
  await page.addInitScript((raw) => localStorage.setItem('lingus.save.v2', raw), raw);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
}

async function saved(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  return state;
}

test('all adults selects dispersed workers for free, then a spoken order pays once and excludes the child', async ({
  page,
}) => {
  await scatteredVillage(page);
  const before = await saved(page);
  const all = page.getByRole('button', { name: 'Tutti gli adulti', exact: true });
  await all.click();
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  expect(await saved(page)).toEqual(before);
  const composer = page.getByRole('region', { name: 'Costruttore di frasi' });
  for (const word of ['Gruppo', 'Mangiare', 'Preda'])
    await composer.getByRole('button', { name: new RegExp(`^${word}:`) }).click();
  const preview = page.locator('.order-preview');
  await preview.locator('summary').click();
  await expect(preview).toContainText('3 esecutori');
  await composer.getByRole('button', { name: 'Pronuncia', exact: true }).click();
  const after = await saved(page);
  expect(after.voice).toBe(before.voice - 1);
  expect(after.stats.commands).toBe(before.stats.commands + 1);
  expect(
    after.units
      .slice(0, 3)
      .every((u: { command: string[] }) => u.command?.join('|') === 'S_01|V_02|O_04'),
  ).toBe(true);
  expect(after.units[3]).toEqual(before.units[3]);
  expect(after.units.map((u: { x: number }) => u.x)).toEqual(
    before.units.map((u: { x: number }) => u.x),
  );
});

test('recall spends one Voice, leaves interrupted cargo on its actual ground and starts physical travel', async ({
  page,
}) => {
  await scatteredVillage(page, true);
  const before = await saved(page);
  await page.getByRole('button', { name: 'Raduna al campo', exact: true }).click();
  const after = await saved(page);
  expect(after.voice).toBe(before.voice - 1);
  expect(after.stats.commands).toBe(before.stats.commands + 1);
  expect(after.resources.wood).toBe(0);
  expect(after.units.slice(0, 3).every((u: { action: string }) => u.action === 'moving')).toBe(
    true,
  );
  expect(after.units.map((u: { x: number }) => u.x)).toEqual(
    before.units.map((u: { x: number }) => u.x),
  );
  expect(after.units[1].carry).toBeUndefined();
  expect(after.entities).toContainEqual(
    expect.objectContaining({ kind: 'ground', resource: 'wood', amount: 3, x: 275, y: 250 }),
  );
  expect(after.units[3]).toEqual(before.units[3]);
  await page.getByRole('button', { name: 'Riprendi il tempo', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Metti in pausa', exact: true }).click();
  const walked = await saved(page);
  expect(walked.units[1].x).toBeLessThan(after.units[1].x);
  expect(walked.units[1].x).toBeGreaterThan(250);
  expect(walked.resources.wood).toBe(0);
});
