import { expect, test, type Page } from '@playwright/test';

const SAVE_KEY = 'lingus.save.v2';
const notices = (page: Page) =>
  page.getByRole('status', { name: 'Eventi della tribù', exact: true });

/** Explicit seasonal/health fixtures. Events themselves come from actual simulation rules. */
async function seedLife(page: Page, kind: 'named' | 'anonymous' | 'birth' = 'named') {
  await page.goto('/');
  const raw = await page.evaluate(async (kind) => {
    const { createGame } = await import('/src/game/engine.ts');
    const { seasonalCore } = await import('/src/game/simulation.ts');
    const { HOME, emptyInventory } = await import('/src/game/content.ts');
    const state = createGame(1, 'guided');
    Object.assign(state, {
      started: true,
      paused: true,
      tier: 2,
      cities: [],
      factions: [],
      entities: [],
      resources: emptyInventory(),
    });
    const names = kind === 'birth' ? ['Korg', 'Ayla'] : ['Uma', 'Ayla', 'Ilo'];
    state.units = names.map((name) => state.units.find((unit) => unit.name === name)!);
    for (const unit of state.units)
      Object.assign(unit, { ...HOME, hp: 100, hunger: 20, temp: 100, action: 'idle', progress: 0 });
    const learn = (id: string, custodians = state.units, retention = 100) => {
      state.words[id] = { retention, custodians: custodians.map((unit) => unit.id), uses: 0 };
      for (const unit of custodians) if (!unit.knows.includes(id)) unit.knows.push(id);
    };
    if (kind !== 'anonymous') learn('S_02');
    if (kind === 'birth') {
      learn('O_08');
      learn('O_05');
      learn('O_03', [state.units[0]], 1);
      for (const unit of state.units)
        Object.assign(unit, { age: 6, sleptThisNight: true, action: 'sleeping' });
      state.buildings = [
        { id: 'fire', kind: 'campfire', ...HOME, hp: 100, active: true, completed: true },
      ];
      state.resources.wood = 10;
      state.time = 90;
      seasonalCore(state);
      if (state.stats.births !== 1 || !state.campfirePending)
        throw new Error('The seasonal fixture did not produce a real birth and campfire.');
    } else {
      const elder = state.units.find((unit) => unit.name === 'Uma')!;
      Object.assign(elder, { age: 14, hp: 0.1, hunger: 100 });
      learn('V_06', [elder], 50);
      if (kind === 'named')
        Object.assign(state.units.find((unit) => unit.name === 'Ayla')!, {
          age: 6,
          hp: 2,
          hunger: 99.2,
        });
    }
    return JSON.stringify(state);
  }, kind);
  await page.addInitScript(
    ({ raw, marker, key }) => {
      if (!sessionStorage.getItem(marker)) {
        localStorage.setItem(key, raw);
        localStorage.setItem('lingus.pause-events', 'true');
        sessionStorage.setItem(marker, 'applied');
      }
    },
    { raw, marker: `lingus.life.${kind}.${Date.now()}`, key: SAVE_KEY },
  );
  await page.reload();
  if (kind !== 'birth')
    await expect(page.getByRole('button', { name: 'Riprendi il tempo' })).toBeVisible();
}

async function saveAndRead(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  return state;
}

test('a fresh Guided game is the default and preserves its mode and optional pause preference', async ({
  page,
}) => {
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: 'Benvenuto in Lingus' });
  await expect(welcome.getByRole('button', { name: /^Guidata/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(welcome.getByRole('checkbox', { name: /Pausa sulle Scintille/ })).toBeChecked();
  await welcome.getByRole('button', { name: /Dai inizio alla storia/ }).click();
  await page.getByRole('button', { name: 'Metti in pausa' }).click();
  const state = await saveAndRead(page);
  expect(state.playMode).toBe('guided');
  expect(state.units.find((unit: { name: string }) => unit.name === 'Uma').age).toBe(12);
  expect(state.words.S_02).toBeUndefined();
  await page.reload();
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await expect(page.getByRole('dialog')).toContainText('Partita Guidata');
  await expect(
    page.getByRole('checkbox', { name: /Pausa automatica sugli eventi importanti/ }),
  ).toBeChecked();
});

test('Classic is selectable and restarting can explicitly change to Guided without changing the existing save first', async ({
  page,
}) => {
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: 'Benvenuto in Lingus' });
  await welcome.getByRole('button', { name: /^Classica/ }).click();
  await expect(welcome.getByRole('button', { name: /^Classica/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(welcome.getByRole('checkbox', { name: /Pausa sulle Scintille/ })).not.toBeChecked();
  await welcome.getByRole('button', { name: /Dai inizio alla storia/ }).click();
  await page.getByRole('button', { name: 'Metti in pausa' }).click();
  const previous = await saveAndRead(page);
  expect(previous.playMode).toBe('classic');
  expect(previous.units.find((unit: { name: string }) => unit.name === 'Uma').age).toBe(14);
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Una nuova storia/ }).click();
  const restart = page.getByRole('dialog', { name: 'Cominciare una nuova storia' });
  await restart.getByRole('button', { name: /^Guidata/ }).click();
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).playMode, SAVE_KEY),
  ).toBe('classic');
  await restart.getByRole('button', { name: /Inizia una nuova storia/ }).click();
  await page.getByRole('button', { name: 'Metti in pausa' }).click();
  const next = await saveAndRead(page);
  expect(next.playMode).toBe('guided');
  expect(next.units.find((unit: { name: string }) => unit.name === 'Uma').age).toBe(12);
  expect(next.stats.commands).toBe(0);
});

test('a real death explains the lost word, pauses optionally and lets the player resume', async ({
  page,
}) => {
  await seedLife(page);
  await page.getByRole('button', { name: 'Riprendi il tempo' }).click();
  await expect(notices(page)).toContainText('Uma è morta per la fame');
  await expect(notices(page)).toContainText('Scheggiare');
  await expect(page.getByRole('button', { name: 'Riprendi il tempo' })).toBeVisible();
  // Forgotten concepts remain consultable in the complete bank; the default
  // contextual view contains only words usable in the next sentence slot.
  await page
    .locator('.language-workbench')
    .getByRole('button', { name: 'Tutte', exact: true })
    .click();
  const lost = page
    .locator('.word-shelf')
    .getByRole('button', { name: /^Scheggiare: parola perduta/ });
  await expect(lost).toBeVisible();
  await expect(lost).toBeDisabled();
  await expect(lost).toHaveAttribute('title', /ultimo custode era Uma/);
  const state = await saveAndRead(page);
  expect(state.units.find((unit: { name: string }) => unit.name === 'Uma').hp).toBe(0);
  expect(state.words.V_06.retention).toBe(0);
  expect(state.paused).toBe(true);

  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  const setting = page.getByRole('checkbox', { name: /Pausa automatica sugli eventi importanti/ });
  await expect(setting).toBeChecked();
  await setting.uncheck();
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  await page.getByRole('button', { name: 'Riprendi il tempo' }).click();
  await expect(notices(page)).toContainText('Ayla è morta per la fame');
  await expect(page.getByRole('button', { name: 'Metti in pausa' })).toBeVisible();
  await page.getByRole('button', { name: 'Metti in pausa' }).click();
  expect(await page.evaluate(() => localStorage.getItem('lingus.pause-events'))).toBe('false');
});

test('acknowledging an event keeps it dismissed until the next real event', async ({ page }) => {
  await seedLife(page);
  await page.getByRole('button', { name: 'Riprendi il tempo' }).click();
  await expect(notices(page)).toContainText('Uma è morta');
  await page.getByRole('button', { name: 'Ho letto', exact: true }).click();
  await expect(notices(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  await expect(notices(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Riprendi il tempo' }).click();
  await expect(notices(page)).toContainText('Ayla è morta');
  await expect(notices(page)).not.toContainText('Uma');
  await expect(page.getByRole('button', { name: 'Riprendi il tempo' })).toBeVisible();
});

test('death and forgotten tiles remain qualitative before Io and Numero', async ({ page }) => {
  await seedLife(page, 'anonymous');
  await page.getByRole('button', { name: 'Riprendi il tempo' }).click();
  await expect(notices(page)).toContainText('un’anziana è morta per la fame');
  await expect(notices(page)).toContainText('Scheggiare');
  await expect(notices(page)).not.toContainText(/Uma|Ayla|Ilo|\d|%/);
  await page
    .locator('.language-workbench')
    .getByRole('button', { name: 'Tutte', exact: true })
    .click();
  const lost = page
    .locator('.word-shelf')
    .getByRole('button', { name: /^Scheggiare: parola perduta/ });
  await expect(lost).toBeDisabled();
  await expect(lost).toHaveAttribute('title', /ultimo custode era un’anziana/);
  await expect(lost).not.toHaveAttribute('title', /Uma|\d|%/);
});

test('a real seasonal birth shows its parents at the campfire and forgetting explains itself afterward', async ({
  page,
}) => {
  await seedLife(page, 'birth');
  const campfire = page.getByRole('dialog', { name: 'Attorno al falò' });
  await expect(campfire).toBeVisible();
  const summary = campfire.getByRole('status', { name: 'Riepilogo della tribù' });
  await expect(summary).toContainText('Una nuova vita');
  await expect(summary).toContainText('Genitori: Korg e Ayla');
  await campfire.getByRole('button', { name: /Custodiamo queste parole/ }).click();
  await page
    .locator('.language-workbench')
    .getByRole('button', { name: 'Tutte', exact: true })
    .click();
  const lost = page.locator('.word-shelf').getByRole('button', { name: /^Legno: parola perduta/ });
  await expect(lost).toBeDisabled();
  await expect(lost).toHaveAttribute('title', /memoria si è indebolita al cambio di stagione/);
  await expect(notices(page)).toContainText('Una parola perduta');
  const saved = await saveAndRead(page);
  const birth = saved.tribeEvents.find((event: { kind: string }) => event.kind === 'birth');
  const child = saved.units.find((unit: { id: string }) => unit.id === birth.unitId);
  expect(child.parentIds).toEqual(saved.units.slice(0, 2).map((unit: { id: string }) => unit.id));
  expect(child.name).not.toMatch(/^Voce/);
  expect(['M', 'F']).toContain(child.sex);
  expect(saved.stats.births).toBe(1);
  expect(saved.words.O_03.retention).toBe(0);
  await page.getByRole('button', { name: 'Mostra sulla mappa: Una nuova vita' }).click();
  await expect(page.getByRole('status', { name: 'Dettagli del bersaglio' })).toContainText(
    child.name,
  );
});
