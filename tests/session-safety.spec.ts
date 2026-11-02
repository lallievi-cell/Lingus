import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../src/game/engine';
import { createSaveRepository, SAVE_KEY } from '../src/session/saveRepository';

function story(time = 0) {
  const state = createGame(6842, 'guided');
  state.started = true;
  state.paused = true;
  state.time = time;
  state.entities = [];
  return state;
}

async function restore(page: Page, state = story()) {
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), {
    key: SAVE_KEY,
    raw: JSON.stringify(state),
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
}

test('an unreadable active save stays intact until a real backup is explicitly restored', async ({
  page,
}) => {
  const values = new Map<string, string>();
  const repository = createSaveRepository(
    () => ({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    }),
    () => 1700000000000,
  );
  expect(repository.save(story(10)).ok).toBe(true);
  expect(repository.save(story(20)).ok).toBe(true);
  values.set(SAVE_KEY, '{unreadable-original');
  await page.addInitScript(
    (entries) => {
      for (const [key, value] of entries) localStorage.setItem(key, value);
    },
    [...values],
  );
  await page.goto('/');
  const recovery = page.getByRole('dialog', { name: 'Recupero e storie conservate' });
  await expect(recovery).toBeVisible();
  await expect(recovery).toContainText('non è leggibile');
  expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBe(
    '{unreadable-original',
  );
  await recovery
    .getByRole('button', { name: /Scegli questa copia/ })
    .first()
    .click();
  await recovery.getByRole('button', { name: 'Ripristina questa storia', exact: true }).click();
  await expect(recovery).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(saved.time).toBe(10);
  expect(saved.paused).toBe(true);
});

test('storage failure is visible and export still works without replacing the previous save', async ({
  page,
}) => {
  const state = story();
  await page.addInitScript(
    ({ key, raw }) => {
      localStorage.setItem(key, raw);
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (name.startsWith('lingus.save'))
          throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
        return original.call(this, name, value);
      };
    },
    { key: SAVE_KEY, raw: JSON.stringify(state) },
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const status = page.getByRole('dialog').getByRole('alert', { name: 'Stato della partita' });
  await expect(status).toContainText('spazio del browser è esaurito');
  expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBe(
    JSON.stringify(state),
  );
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: /Esporta partita/ }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/^lingus-.*\.json$/);
});

test('leaving the app pauses and saves once, with no hidden catch-up before an explicit resume', async ({
  page,
}) => {
  await restore(page);
  await page.getByRole('button', { name: 'Riprendi il tempo', exact: true }).click();
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hidden = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(hidden.paused).toBe(true);
  expect(hidden.time).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('status', { name: 'Stato della partita' })).toContainText(
    'La tribù ti ha aspettato',
  );
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const returned = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(returned.time).toBe(hidden.time);
  expect(returned.paused).toBe(true);
});

test('Enter pronounces the same movement order as the button while time is paused', async ({
  page,
}) => {
  await restore(page);
  await page.getByRole('button', { name: /^Gruppo:/ }).click();
  await page.getByRole('button', { name: /^Andare:/ }).click();
  const canvas = page.getByRole('img', { name: /Mappa della valle/ });
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * 0.3, y: box.height * 0.45 } });
  await canvas.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(state.stats.commands).toBe(1);
  expect(state.voice).toBe(2);
  expect(state.paused).toBe(true);
});

test('another tab cannot be overwritten by a stale autosave or manual save, while explicit recovery still works', async ({
  page,
  context,
}) => {
  await restore(page);
  await page.clock.install();
  const other = await context.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: /^Gruppo:/ }).click();
  await other.getByRole('button', { name: /^Andare:/ }).click();
  const canvas = other.getByRole('img', { name: /Mappa della valle/ });
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * 0.3, y: box.height * 0.45 } });
  await canvas.focus();
  await other.keyboard.press('Enter');
  await other.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await other.getByRole('button', { name: /Salva adesso/ }).click();
  const newerRaw = await other.evaluate((key) => localStorage.getItem(key)!, SAVE_KEY);
  expect(JSON.parse(newerRaw).stats.commands).toBe(1);
  await expect(page.getByRole('alert', { name: 'Stato della partita' })).toContainText(
    'Un’altra scheda',
  );
  await page.clock.fastForward(6000);
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBe(newerRaw);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: /Esporta partita/ }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/^lingus-.*\.json$/);

  await page.getByRole('button', { name: 'Copie e storie', exact: true }).click();
  const recovery = page.getByRole('dialog', { name: 'Recupero e storie conservate' });
  await recovery
    .getByRole('button', { name: /Scegli questa copia/ })
    .first()
    .click();
  await recovery.getByRole('button', { name: 'Ripristina questa storia', exact: true }).click();
  await expect(recovery).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
  const copies = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('lingus.save.history.v1')!),
  );
  expect(copies.entries.some((entry: { raw: string }) => entry.raw === newerRaw)).toBe(true);
  await other.close();
});

test('a failed archive keeps the current story open when starting another one', async ({
  page,
}) => {
  const state = story(10);
  await page.addInitScript(
    ({ key, raw }) => {
      localStorage.setItem(key, raw);
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (name.startsWith('lingus.save.history'))
          throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
        return original.call(this, name, value);
      };
    },
    { key: SAVE_KEY, raw: JSON.stringify(state) },
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Una nuova storia/ }).click();
  const restart = page.getByRole('dialog', { name: 'Cominciare una nuova storia' });
  await restart.getByRole('button', { name: 'Inizia una nuova storia', exact: true }).click();
  await expect(restart).toBeVisible();
  const raw = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
  expect(JSON.parse(raw!).time).toBe(10);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Impostazioni e salvataggi' })).toContainText(
    'spazio del browser è esaurito',
  );
});
