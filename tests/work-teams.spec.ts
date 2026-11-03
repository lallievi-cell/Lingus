import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../src/game/engine';
import { WORDS } from '../src/game/content';

async function load(page: Page, queued = false) {
  const state = createGame(6842, 'guided');
  Object.assign(state, {
    started: true,
    paused: true,
    tier: 1,
    time: 20,
    entities: [],
    cities: [],
    factions: [],
    buildings: [],
    sparks: [],
  });
  state.units = state.units.slice(0, 4);
  for (const [index, unit] of state.units.entries())
    Object.assign(unit, {
      age: 6,
      hp: 100,
      temp: 100,
      hunger: 20,
      action: 'idle',
      x: 240 + index * 20,
      y: 250,
      command: undefined,
    });
  for (const id of ['S_02', 'O_02', 'O_03', 'O_04', 'V_04']) {
    state.words[id] = { retention: 100, custodians: state.units.map((unit) => unit.id), uses: 0 };
    for (const unit of state.units) if (!unit.knows.includes(id)) unit.knows.push(id);
  }
  Object.assign(state.units[1], {
    action: 'returning',
    command: ['S_01', 'V_04', 'O_03'],
    carry: { resource: 'wood', amount: 2 },
  });
  if (queued)
    state.sparks.push({
      id: 'queued-craft',
      wordId: 'V_06',
      unitId: state.units[0].id,
      eventLabel: 'Esperienza di lavorazione',
      hint: WORDS.V_06.hint,
      recipe: [...WORDS.V_06.recipe],
      expiresAt: 120,
      earnedAt: 20,
      deferred: true,
    });
  await page.addInitScript(
    (raw) => localStorage.setItem('lingus.save.v2', raw),
    JSON.stringify(state),
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
  return state;
}
async function saved(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi', exact: true }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const result = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
  await page.getByRole('button', { name: 'Chiudi finestra', exact: true }).click();
  return result;
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 1440, height: 1050 },
])
  test(`a free work-team selection sends one real order only to its checked members at ${viewport.width}`, async ({
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
    const state = await load(page);
    const before = await saved(page);
    if (viewport.width <= 860)
      await page
        .getByRole('navigation', { name: 'Sezioni di gioco' })
        .getByRole('button', { name: /^Tribù/ })
        .click();
    await page.getByRole('button', { name: 'Dividi i compiti', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Dividi i compiti', exact: true });
    await picker.getByRole('button', { name: 'Solo senza incarico', exact: true }).click();
    await expect(
      picker.getByRole('checkbox', { name: `Includi ${state.units[1].name}`, exact: true }),
    ).not.toBeChecked();
    await picker
      .getByRole('checkbox', { name: `Includi ${state.units[3].name}`, exact: true })
      .uncheck();
    await picker.getByRole('button', { name: 'Usa questo gruppo', exact: true }).click();
    await expect(picker).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Gruppo scelto', exact: true })).toBeVisible();
    await expect(page.locator('.sentence-slot.filled')).toHaveCount(1);
    expect(await saved(page)).toEqual(before);
    if (viewport.width <= 860)
      await page.getByRole('button', { name: 'Spazio 2: cosa fa?', exact: true }).click();
    await page
      .getByRole('button', { name: /^Andare:/ })
      .filter({ visible: true })
      .click();
    const map = page.getByRole('img', { name: /Mappa della valle/ });
    const box = (await map.boundingBox())!;
    await map.click({ position: { x: box.width * 0.18, y: box.height * 0.6 } });
    await page.getByRole('button', { name: 'Pronuncia', exact: true }).click();
    const after = await saved(page);
    expect(after.voice).toBe(before.voice - 1);
    expect(after.stats.commands).toBe(before.stats.commands + 1);
    for (const index of [0, 2]) expect(after.units[index].command).toEqual(['S_01', 'V_01']);
    for (const index of [1, 3]) expect(after.units[index]).toEqual(before.units[index]);
    expect(after.resources).toEqual(before.resources);
    expect(after.units.map((unit: { x: number; y: number }) => [unit.x, unit.y])).toEqual(
      before.units.map((unit: { x: number; y: number }) => [unit.x, unit.y]),
    );
    if (viewport.width <= 860)
      expect(
        (await page.getByRole('region', { name: 'Costruttore di frasi' }).boundingBox())!.height,
      ).toBeLessThanOrEqual(180);
  });

test('a deferred intuition has a quiet queue entry and no actionable spark badge', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page, true);
  await expect(
    page.getByRole('button', { name: 'Nuova intuizione disponibile', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'Sezioni di gioco' })
    .getByRole('button', { name: 'Pensiero', exact: true })
    .click();
  await expect(page.locator('.queued-intuitions')).toContainText('Intuizioni da approfondire');
  await expect(page.locator('.spark-card')).toHaveCount(0);
});
