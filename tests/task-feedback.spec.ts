import { expect, test, type Page } from '@playwright/test';

/** Real work advanced close to completion, then resumed through the actual UI. */
async function pendingTask(page: Page, kind: 'craft' | 'delivery') {
  await page.goto('/');
  const raw = await page.evaluate(async (kind) => {
    const { createGame, issueCommand, tick } = await import('/src/game/engine.ts');
    const { WORD_ORDER, emptyInventory } = await import('/src/game/content.ts');
    let state = createGame(6842, kind === 'craft' ? 'classic' : 'guided');
    Object.assign(state, {
      started: true,
      paused: false,
      tier: 3,
      time: 20,
      cities: [],
      factions: [],
      buildings: [],
      sparks: [],
      entities: [],
      resources: { ...emptyInventory(), stone: 2 },
    });
    state.units = state.units.slice(0, 1);
    Object.assign(state.units[0], {
      ...state.home,
      age: 6,
      hp: 100,
      hunger: 0,
      temp: 100,
      action: 'idle',
      progress: 0,
    });
    for (const id of WORD_ORDER) {
      state.words[id] = { retention: 100, custodians: state.units.map((u) => u.id), uses: 0 };
      state.units[0].knows.push(id);
    }
    if (kind === 'craft') {
      state = issueCommand(state, ['S_01', 'V_06', 'O_02']);
      for (let i = 0; i < 19; i++) state = tick(state, 0.25);
    } else {
      state.entities = [
        { id: 'last-tree', kind: 'tree', x: 254, y: 250, amount: 1, hp: 100, maxHp: 100 },
      ];
      state = issueCommand(state, ['S_01', 'V_04', 'O_03'], {
        type: 'entity',
        id: 'last-tree',
        x: 254,
        y: 250,
      });
      for (let i = 0; i < 100; i++) {
        const next = tick(state, 0.25);
        if (next.resources.wood === 1) break;
        state = next;
      }
      if (!state.units[0].carry || state.resources.wood !== 0)
        throw new Error('Expected actual final cargo before delivery.');
    }
    state.paused = true;
    return JSON.stringify(state);
  }, kind);
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

test('a completed real Classic tool is explained, and preparing again neither restarts it nor charges Voice', async ({
  page,
}) => {
  await pendingTask(page, 'craft');
  await page.getByRole('button', { name: 'Riprendi il tempo', exact: true }).click();
  const history = page.getByRole('region', { name: 'Esito degli incarichi' });
  await expect(history).toBeVisible();
  await page.getByRole('button', { name: 'Metti in pausa', exact: true }).click();
  await history.locator('summary').click();
  await expect(history).toContainText('Compito completato');
  await expect(history).toContainText('Gruppo · Scheggiare · Pietra');
  const before = await saved(page);
  expect(before.resources.tool).toBe(1);
  await history.getByRole('button', { name: 'Prepara di nuovo' }).click();
  const slots = page.getByRole('group', { name: 'Spazi della frase' });
  await expect(slots).toContainText('Scheggiare');
  await expect(slots).toContainText('Pietra');
  expect(await saved(page)).toEqual(before);
  await history.getByRole('button', { name: 'Nascondi esito: Compito completato' }).click();
  await expect(history).toHaveCount(0);
});

test('an exhausted source is explained only after the last real load reaches the camp', async ({
  page,
}) => {
  await pendingTask(page, 'delivery');
  const before = await saved(page);
  expect(before.resources.wood).toBe(0);
  expect(before.units[0].carry).toEqual({ resource: 'wood', amount: 1 });
  await page.getByRole('button', { name: 'Riprendi il tempo', exact: true }).click();
  const history = page.getByRole('region', { name: 'Esito degli incarichi' });
  await expect(history).toBeVisible();
  await page.getByRole('button', { name: 'Metti in pausa', exact: true }).click();
  await history.locator('summary').click();
  await expect(history).toContainText('Fonte esaurita');
  await expect(history).toContainText('scegli un nuovo bersaglio');
  const delivered = await saved(page);
  expect(delivered.resources.wood).toBe(1);
  expect(delivered.units[0].carry).toBeUndefined();
  await history.getByRole('button', { name: 'Prepara di nuovo' }).click();
  expect(await saved(page)).toEqual(delivered);
  await expect(page.getByRole('group', { name: 'Spazi della frase' })).toContainText('Portare');
});
