import { expect, test, type Page } from '@playwright/test';

const SAVE_KEY = 'lingus.save.v2';
type Fixture = 'anonymous' | 'named' | 'unfinished-fire';

async function seedCustodian(page: Page, scenario: Fixture) {
  await page.goto('/');
  const raw = await page.evaluate(async (scenario) => {
    const { createGame } = await import('/src/game/engine.ts');
    const state = createGame(6842);
    state.started = true;
    state.paused = true;
    state.tier = 2;
    state.cities = [];
    state.factions = [];
    state.entities = [];
    state.attention = 20;
    state.units = state.units.filter((unit) => ['Uma', 'Ilo', 'Ayla'].includes(unit.name));
    for (const [index, unit] of state.units.entries()) {
      Object.assign(unit, {
        x: 248 + index * 3,
        y: 258,
        hp: 100,
        hunger: 20,
        temp: 100,
        action: 'idle',
      });
    }
    const elder = state.units.find((unit) => unit.name === 'Uma')!;
    elder.age = 14;
    state.words.V_06 = { retention: 50, custodians: [elder.id], uses: 0 };
    elder.knows.push('V_06');
    if (scenario !== 'anonymous') {
      for (const id of ['S_02', 'O_05', 'O_06']) {
        state.words[id] = {
          retention: 100,
          custodians: state.units.map((unit) => unit.id),
          uses: 0,
        };
        for (const unit of state.units) unit.knows.push(id);
      }
      state.buildings.push({
        id: 'fire',
        kind: 'campfire',
        ...state.home,
        hp: 100,
        active: true,
        completed: scenario !== 'unfinished-fire',
      });
    }
    return JSON.stringify(state);
  }, scenario);
  await page.addInitScript(
    ({ raw, key, marker }) => {
      if (!sessionStorage.getItem(marker)) {
        localStorage.setItem(key, raw);
        sessionStorage.setItem(marker, 'applied');
      }
    },
    { raw, key: SAVE_KEY, marker: `lingus.custodians.${scenario}.${Date.now()}` },
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Riprendi il tempo' })).toBeVisible();
}

async function savedState(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  return state;
}

test('the warning respects Io, Morte, Fuoco and Numero before they are known', async ({ page }) => {
  await seedCustodian(page, 'anonymous');
  const notice = page.getByLabel('Ultimi custodi a rischio');
  await expect(notice).toContainText('Un compagno è l’ultima voce di «Scheggiare»');
  await expect(notice).toContainText('Età avanzata');
  await expect(notice).not.toContainText('Uma');
  await expect(notice).not.toContainText(/muore|morte|\d|%/i);
  await expect(notice.getByRole('button', { name: /Tramanda/ })).toHaveCount(0);
  await expect(page.locator('.individual-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Seleziona un compagno', exact: true }).nth(1).click();
  const mapNotice = page.getByRole('status', { name: 'Dettagli del bersaglio' });
  await expect(mapNotice).toContainText('Ultimo custode');
  await expect(mapNotice).toContainText('Scheggiare');
  await expect(mapNotice).not.toContainText(/Uma|muore|morte|\d|%/i);
});

test('the existing lesson creates a real new custodian and pays attention without a seasonal shortcut', async ({
  page,
}) => {
  await seedCustodian(page, 'named');
  const notice = page.getByLabel('Ultimi custodi a rischio');
  await expect(notice).toContainText('Uma è l’ultima voce di «Scheggiare»');
  await expect(notice).toContainText('Se il custode muore');
  await expect(notice).not.toContainText(/\d|%/);
  await page.getByRole('button', { name: 'Seleziona Uma', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Dettagli del bersaglio' })).toContainText(
    'Custodisce da solo: Scheggiare',
  );
  await expect(page.locator('.individual-custody')).toContainText('«Scheggiare»');
  await expect(page.locator('.individual-card')).toContainText('ANZIANO');
  await expect(page.locator('.individual-card')).not.toContainText('14 STAGIONI');
  await notice.getByRole('button', { name: /Tramanda al falò/ }).click();
  const word = page.getByLabel('Parola da tramandare: Scheggiare', { exact: true });
  await expect(word).toContainText('Ultimo custode: Uma');
  await word.getByRole('button', { name: /Tramanda/ }).click();
  await expect(word).not.toContainText('Ultimo custode');
  await page.getByRole('button', { name: /Custodiamo queste parole/ }).click();
  await expect(notice).toHaveCount(0);
  const saved = await savedState(page);
  expect(saved.attention).toBe(10);
  expect(saved.words.V_06.retention).toBe(60);
  expect(saved.words.V_06.custodians).toHaveLength(2);
  const pupil = saved.units.find((unit: { name: string }) => unit.name === 'Ilo');
  expect(saved.words.V_06.custodians).toContain(pupil.id);
  expect(saved.campfirePending).toBe(false);
  expect(saved.pendingSeason).toBe(false);
});

test('an unfinished fire cannot turn the warning into a free or impossible lesson', async ({
  page,
}) => {
  await seedCustodian(page, 'unfinished-fire');
  const notice = page.getByLabel('Ultimi custodi a rischio');
  await expect(notice).toContainText('Serve un falò acceso e attivo');
  await expect(notice.getByRole('button', { name: /Tramanda al falò/ })).toBeDisabled();
  await page.getByRole('button', { name: /Attorno al falò.*Tramanda ciò che sai/ }).click();
  const word = page.getByLabel('Parola da tramandare: Scheggiare', { exact: true });
  await expect(word.getByRole('button', { name: /Tramanda/ })).toBeDisabled();
  await page.getByRole('button', { name: /Custodiamo queste parole/ }).click();
  const saved = await savedState(page);
  expect(saved.attention).toBe(20);
  expect(saved.words.V_06.custodians).toHaveLength(1);
  expect(saved.campfirePending).toBe(false);
});

test('the tribe and its transmission action stay reachable inside a narrow viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedCustodian(page, 'named');
  await page.getByRole('button', { name: 'Seleziona Uma', exact: true }).click();
  await expect(page.locator('.individual-custody')).toContainText('«Scheggiare»');
  const notice = page.getByLabel('Ultimi custodi a rischio');
  await notice.getByRole('button', { name: /Tramanda al falò/ }).click();
  await expect(page.getByRole('dialog', { name: 'Attorno al falò' })).toBeVisible();
  const bounds = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(bounds.document).toBe(bounds.viewport);
});
