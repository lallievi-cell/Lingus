import { expect, test, type Page } from '@playwright/test';

const SAVE_KEY = 'lingus.save.v2';

/** Prepared people isolate visual traits; this is not a gameplay campaign. */
async function seedPeople(page: Page) {
  await page.goto('/');
  const raw = await page.evaluate(async () => {
    const { createGame } = await import('/src/game/engine.ts');
    const state = createGame(6842);
    state.started = true;
    state.paused = true;
    state.cities = [];
    state.factions = [];
    state.units.forEach((unit, index) =>
      Object.assign(unit, {
        x: 247 + index,
        y: 255,
        hunger: 20,
        temp: 100,
        hp: 100,
        action: 'idle',
        progress: 0,
      }),
    );
    Object.assign(state.units[0], { temp: 15, hunger: 96, hp: 25 });
    Object.assign(state.units[1], { temp: 15, hunger: 96, hp: 25 });
    state.units.push({
      ...state.units[6],
      id: 'test-newborn',
      name: 'Hidden Baby',
      sex: 'F',
      age: 0,
      x: 254,
      y: 255,
    });
    const tree = state.entities.find((entity) => entity.kind === 'tree')!;
    Object.assign(tree, { x: 260, y: 250 });
    state.entities = [tree];
    return JSON.stringify(state);
  });
  await page.addInitScript(
    ({ raw, marker, key }) => {
      if (!sessionStorage.getItem(marker)) {
        localStorage.setItem(key, raw);
        sessionStorage.setItem(marker, 'applied');
      }
    },
    { raw, marker: `lingus.people.${Date.now()}`, key: SAVE_KEY },
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Riprendi il tempo' })).toBeVisible();
}

async function saveAndRead(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  return saved;
}

test('sex, life stages and physical danger are visible before Io and Numero, while children cannot work', async ({
  page,
}) => {
  await seedPeople(page);
  const roster = page.getByLabel('Membri della tribù');
  await expect(roster).toContainText('Uomo');
  await expect(roster).toContainText('Donna');
  await expect(roster).toContainText('Anziana');
  await expect(roster).toContainText('Bambino');
  await expect(roster).toContainText('Neonata');
  await expect(roster).not.toContainText(/Korg|Ayla|Uma|Ilo|Hidden Baby|stagioni/);
  for (const index of [0, 1]) {
    const member = roster.locator('.unit-card').nth(index);
    await expect(member).toContainText('Freddo intenso');
    await expect(member).toContainText('Fame estrema');
  }
  const child = roster.locator('.unit-card').nth(6);
  await expect(child).toContainText('Può imparare · non lavora');
  await child.click();
  await expect(page.locator('.individual-card')).toContainText('BAMBINO');
  await expect(page.locator('.individual-card')).toContainText('Troppo giovane per lavorare');
  const details = page.getByRole('status', { name: 'Dettagli del bersaglio' });
  await expect(details).toContainText('Bambino');
  await expect(details).toContainText('Può imparare al Falò');
  await expect(details).not.toContainText(/Ilo|\d/);
  await page.getByRole('button', { name: /^Gruppo:/ }).click();
  await page.getByRole('button', { name: /^Colpire:/ }).click();
  const map = page.getByRole('img', { name: /Mappa della valle/ });
  const bounds = await map.boundingBox();
  expect(bounds).not.toBeNull();
  const scale = Math.max(bounds!.width / 1200, bounds!.height / 800) * 4.5;
  await map.click({
    position: { x: bounds!.width / 2 + 10 * 2.4 * scale, y: bounds!.height / 2 - 3 * scale },
  });
  await page.getByRole('button', { name: 'Pronuncia', exact: true }).click();
  const saved = await saveAndRead(page);
  expect(saved.stats.commands).toBe(1);
  expect(
    saved.units
      .filter((unit: { age: number }) => unit.age >= 4)
      .every((unit: { action: string }) => unit.action === 'gathering'),
  ).toBe(true);
  expect(
    saved.units
      .filter((unit: { age: number }) => unit.age < 4)
      .every(
        (unit: { action: string; command?: string[] }) => unit.action === 'idle' && !unit.command,
      ),
  ).toBe(true);
});

test('life-stage labels and child details stay readable in the mobile tribe tab', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPeople(page);
  await page
    .getByRole('navigation', { name: 'Sezioni di gioco' })
    .getByRole('button', { name: /^Tribù/ })
    .click();
  const roster = page.getByLabel('Membri della tribù');
  const alertBounds = await roster
    .locator('.unit-card')
    .first()
    .evaluate((card) => {
      const warning = card.querySelector('.person-warning')!.getBoundingClientRect();
      const info = card.querySelector('.unit-info')!.getBoundingClientRect();
      const bounds = card.getBoundingClientRect();
      return {
        warningBottom: warning.bottom,
        infoTop: info.top,
        cardTop: bounds.top,
        cardBottom: bounds.bottom,
      };
    });
  expect(alertBounds.warningBottom).toBeLessThanOrEqual(alertBounds.cardBottom);
  expect(alertBounds.infoTop).toBeGreaterThanOrEqual(alertBounds.cardTop);
  const child = roster.locator('.unit-card').nth(6);
  await expect(child).toContainText('Bambino');
  await child.click();
  await expect(page.locator('.individual-card')).toBeVisible();
  await expect(page.locator('.individual-card')).toContainText('Può imparare al Falò');
  const dimensions = await page.evaluate(() => ({
    view: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.view);
  await page.screenshot({ path: '/workspace/artifacts/lingus-people-mobile.png', fullPage: true });
});
