import { expect, test, type Page } from '@playwright/test';
import { openWordBank, showRecentPhrases } from './mobile-ui';

/** Prepared knowledge isolates late-game composition; these are UI cases, not a campaign. */
async function loadComposer(page: Page, forgotten = false) {
  await page.goto('/');
  const raw = await page.evaluate(async (forgotten) => {
    const { createGame } = await import('/src/game/engine.ts');
    const { WORD_ORDER, BUILDING_SPECS } = await import('/src/game/content.ts');
    const state = createGame(6842, 'guided');
    Object.assign(state, {
      tier: 5,
      started: true,
      paused: true,
      time: 20,
      cities: [],
      factions: [],
      entities: [],
      sparks: [],
      campfirePending: false,
    });
    for (const [index, unit] of state.units.entries()) {
      Object.assign(unit, {
        x: 245 + index,
        y: 250,
        hp: 100,
        hunger: 20,
        temp: 100,
        action: 'idle',
        progress: 0,
      });
      unit.knows = WORD_ORDER.filter((id) => !(forgotten && id === 'O_09'));
    }
    for (const id of WORD_ORDER)
      state.words[id] = {
        retention: forgotten && id === 'O_09' ? 0 : 100,
        custodians: forgotten && id === 'O_09' ? [] : state.units.map((u) => u.id),
        uses: 1,
      };
    state.buildings = [
      {
        id: 'composer-palace',
        kind: 'palace',
        x: 250,
        y: 250,
        hp: BUILDING_SPECS.palace.maxHp,
        active: true,
        completed: true,
      },
    ];
    return JSON.stringify(state);
  }, forgotten);
  await page.addInitScript(
    ({ raw }) => {
      if (sessionStorage.getItem('syntax-fixture')) return;
      localStorage.setItem('lingus.save.v2', raw);
      sessionStorage.setItem('syntax-fixture', 'loaded');
    },
    { raw },
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
  await openWordBank(page);
  return page.getByRole('region', { name: 'Costruttore di frasi' });
}

async function saved(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  return state;
}

test('late-game guidance follows the next slot and keeps forgotten building concepts unavailable', async ({
  page,
}) => {
  const workbench = await loadComposer(page, true);
  const group = workbench.getByRole('button', { name: /^Gruppo:/ });
  await expect(group).toHaveClass(/word-compatible/);
  await expect(workbench.getByRole('button', { name: /^Sempre:/ })).toHaveClass(/word-compatible/);
  await expect(
    workbench.getByRole('button', { name: 'Solo compatibili', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(workbench.getByRole('button', { name: /^Costruire:/ })).toHaveCount(0);
  await group.click();
  await expect(workbench.getByRole('button', { name: /^Costruire:/ })).toHaveClass(
    /word-compatible/,
  );
  await workbench.getByRole('button', { name: /^Costruire:/ }).click();
  await expect(workbench.getByRole('button', { name: /^Pietra:/ })).toHaveClass(/word-compatible/);
  await expect(workbench.getByRole('button', { name: /^Legno:/ })).toHaveClass(/word-compatible/);
  const lost = workbench.getByRole('button', { name: /^Scrittura: parola perduta/ });
  await expect(lost).toHaveCount(0);
  await workbench.getByRole('button', { name: 'Tutte', exact: true }).click();
  await expect(lost).toBeDisabled();
  await expect(lost).not.toHaveClass(/word-compatible/);
  await workbench.getByRole('button', { name: 'Solo compatibili', exact: true }).click();
  await expect(lost).toHaveCount(0);
  const search = workbench.getByRole('searchbox', { name: 'Cerca parole nella barra' });
  await search.fill('pietra');
  await expect(workbench.locator('.word-shelf .word-tile')).toHaveCount(1);
  await workbench.getByRole('button', { name: /^Pietra:/ }).click();
  await search.fill('');
  await expect(workbench.locator('.sentence-slot.filled')).toHaveCount(3);
  await expect(workbench.getByRole('button', { name: /^Qui:/ })).toHaveClass(/word-compatible/);
  await workbench.getByRole('button', { name: 'Pronuncia', exact: true }).focus();
  await page.keyboard.press('Escape');
  for (const word of ['Gruppo', 'Conservare', 'Preda', 'Domani'])
    await workbench.getByRole('button', { name: new RegExp(`^${word}:`) }).click();
  await expect(workbench.getByRole('button', { name: /^Altrimenti:/ })).toHaveClass(
    /word-compatible/,
  );
  await workbench.getByRole('button', { name: /^Altrimenti:/ }).click();
  await expect(workbench.getByRole('button', { name: /^Moneta:/ })).toHaveClass(/word-compatible/);
  await workbench.getByRole('button', { name: /^Moneta:/ }).click();
  await expect(workbench.locator('.sentence-slot.filled')).toHaveCount(6);
  await expect(workbench.locator('.sentence-feedback')).toContainText('Legge prescrittiva');
  await expect(workbench.getByRole('button', { name: 'Pronuncia', exact: true })).toBeEnabled();
  await expect(workbench.locator('.word-shelf .word-tile')).toHaveCount(0);
  await expect(workbench.locator('.syntax-next')).toContainText('Frase pronta');
  await expect(workbench.locator('.contextual-empty')).toContainText('non serve riempire');
});

test('recalling an acknowledged order restores the full phrase without executing or charging voice', async ({
  page,
}) => {
  const workbench = await loadComposer(page);
  for (const word of ['Gruppo', 'Andare'])
    await workbench.getByRole('button', { name: new RegExp(`^${word}:`) }).click();
  const hideWords = workbench.getByRole('button', { name: 'Nascondi parole', exact: true });
  if (await hideWords.isVisible()) await hideWords.click();
  const map = page.getByRole('img', { name: /Mappa della valle/ });
  const bounds = (await map.boundingBox())!;
  await map.click({ position: { x: bounds.width * 0.7, y: bounds.height * 0.4 } });
  await workbench.getByRole('button', { name: 'Pronuncia', exact: true }).click();
  const before = await saved(page);
  expect(before.stats.commands).toBe(1);
  expect(before.voice).toBe(2);
  const target = await page.locator('.map-toolbar strong').textContent();
  await workbench.getByRole('button', { name: 'Rimuovi ultima parola' }).click();
  await workbench.getByRole('button', { name: 'Rimuovi ultima parola' }).click();
  await expect(workbench.locator('.sentence-slot.filled')).toHaveCount(0);
  await page
    .locator('.echo-shelf[aria-label="Frasi recenti"]:visible')
    .getByRole('button', { name: 'Gruppo · Andare', exact: true })
    .click();
  await expect(workbench.locator('.sentence-slot.filled')).toHaveCount(2);
  const after = await saved(page);
  expect(after.stats.commands).toBe(before.stats.commands);
  expect(after.voice).toBe(before.voice);
  expect(after.units.map((u: { command?: string[] }) => u.command)).toEqual(
    before.units.map((u: { command?: string[] }) => u.command),
  );
  await expect(page.getByRole('button', { name: 'Deseleziona bersaglio' })).toBeVisible();
  await expect(page.locator('.map-toolbar strong')).toHaveText(target!);
  // Enter on a history button must not also fire the global pronounce shortcut.
  await page.getByRole('button', { name: 'Riprendi il tempo', exact: true }).click();
  const recall = page
    .locator('.echo-shelf[aria-label="Frasi recenti"]:visible')
    .getByRole('button', { name: 'Gruppo · Andare', exact: true });
  await recall.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Metti in pausa', exact: true }).click();
  const keyboard = await saved(page);
  expect(keyboard.stats.commands).toBe(before.stats.commands);
  expect(keyboard.voice).toBe(before.voice);
});

test('next-slot guidance and phrase recall remain usable in a narrow viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const workbench = await loadComposer(page);
  for (const word of ['Gruppo', 'Andare'])
    await workbench.getByRole('button', { name: new RegExp(`^${word}:`) }).click();
  const hideWords = workbench.getByRole('button', { name: 'Nascondi parole', exact: true });
  if (await hideWords.isVisible()) await hideWords.click();
  const map = page.getByRole('img', { name: /Mappa della valle/ });
  const bounds = (await map.boundingBox())!;
  await map.click({ position: { x: bounds.width * 0.7, y: bounds.height * 0.4 } });
  await workbench.getByRole('button', { name: 'Pronuncia', exact: true }).click();
  await workbench.getByRole('button', { name: 'Rimuovi ultima parola' }).click();
  await workbench.getByRole('button', { name: 'Rimuovi ultima parola' }).click();
  await workbench.getByRole('button', { name: 'Mostra parole', exact: true }).click();
  await workbench.getByRole('button', { name: /^Gruppo:/ }).click();
  await workbench.getByRole('button', { name: /^Costruire:/ }).click();
  await workbench.getByRole('button', { name: /^Pietra:/ }).click();
  await workbench.getByRole('button', { name: /^Qui:/ }).click();
  await expect(workbench.locator('.sentence-slot.filled')).toHaveCount(4);
  await expect(workbench.getByRole('button', { name: 'Pronuncia', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const remembered = (await showRecentPhrases(page)).getByRole('button').first();
  await remembered.focus();
  await expect(remembered).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(workbench.locator('.sentence-slot.filled')).toHaveCount(2);
  const state = await saved(page);
  expect(state.stats.commands).toBe(1);
  expect(state.voice).toBe(2);
});
