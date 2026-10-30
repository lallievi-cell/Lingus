import { expect, test, type Page } from '@playwright/test';

const SAVE_KEY = 'lingus.save.v2';
const growth = (page: Page) => page.getByRole('region', { name: 'Crescita della tribù' });

/** Isolated family states verify explanations, not an ordinary campaign. */
async function seedFamily(page: Page, variant: 'ready' | 'blocked' | 'one-sex' | 'numbered') {
  await page.goto('/');
  const raw = await page.evaluate(async (variant) => {
    const { createGame } = await import('/src/game/engine.ts');
    const { HOME } = await import('/src/game/content.ts');
    const state = createGame(1, 'guided');
    Object.assign(state, { started: true, paused: true, entities: [], cities: [], factions: [] });
    state.units = state.units.slice(0, 2);
    for (const unit of state.units)
      Object.assign(unit, {
        ...HOME,
        age: 6,
        hp: 100,
        hunger: 20,
        temp: 100,
        sleptThisNight: true,
        action: 'idle',
      });
    if (variant === 'blocked')
      Object.assign(state.units[1], { hunger: 80, sleptThisNight: false, x: HOME.x + 12 });
    if (variant === 'one-sex') state.units[1].sex = 'M';
    if (variant === 'numbered')
      for (const id of ['S_02', 'O_08']) {
        state.words[id] = {
          retention: 100,
          custodians: state.units.map((unit) => unit.id),
          uses: 0,
        };
        for (const unit of state.units) unit.knows.push(id);
      }
    return JSON.stringify(state);
  }, variant);
  await page.addInitScript(
    ({ raw, key, marker }) => {
      if (!sessionStorage.getItem(marker)) {
        localStorage.setItem(key, raw);
        sessionStorage.setItem(marker, 'done');
      }
    },
    { raw, key: SAVE_KEY, marker: `lingus.growth.${variant}.${Date.now()}` },
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Riprendi il tempo' })).toBeVisible();
}

test('growth explains present food, rest and home blockers without leaking names or exact counts', async ({
  page,
}) => {
  await seedFamily(page, 'blocked');
  await expect(growth(page)).toContainText('Da preparare');
  await expect(growth(page)).toContainText('Cibo:');
  await expect(growth(page)).toContainText('Riposo:');
  await expect(growth(page)).toContainText('Giaciglio:');
  await growth(page).getByText('Cosa serve alla crescita').click();
  await expect(growth(page)).toContainText('alla fine della stagione');
  await expect(growth(page)).not.toContainText(/Korg|Ayla|\d|%/);
  await page.getByLabel('Membri della tribù').locator('.unit-card').nth(1).click();
  const individual = page.getByLabel('Condizioni per la crescita');
  await expect(individual).toContainText('futuri genitori sazi');
  await expect(individual).toContainText('stagione in corso');
});

test('a potential pair is conditional and a missing opposite-sex partner is explained', async ({
  page,
}) => {
  await seedFamily(page, 'ready');
  await expect(growth(page)).toContainText('Possibile');
  await growth(page).getByText('Cosa serve alla crescita').click();
  await expect(growth(page)).toContainText('non è garantita');
  await expect(growth(page)).not.toContainText(/\d|%/);
  await seedFamily(page, 'one-sex');
  await expect(growth(page)).toContainText('mancherà una donna');
  await expect(growth(page)).not.toContainText('Possibile');
});

test('learned numbers reveal actual available pairs and housing, including on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedFamily(page, 'numbered');
  await page
    .getByRole('navigation', { name: 'Sezioni di gioco' })
    .getByRole('button', { name: /^Tribù/ })
    .click();
  await growth(page).getByText('Cosa serve alla crescita').click();
  await expect(growth(page)).toContainText('1 uomo e 1 donna');
  await expect(growth(page)).toContainText('1 coppia');
  await expect(growth(page)).toContainText('8 posti liberi');
  const dimensions = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});
