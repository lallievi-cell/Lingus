import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../src/game/engine';
import type { GameState } from '../src/game/types';

test.use({ viewport: { width: 390, height: 844 } });

async function start(page: Page, paused = false) {
  const state = createGame(6842, 'guided');
  Object.assign(state, { started: true, paused });
  await page.clock.install();
  await page.addInitScript((raw) => {
    localStorage.setItem('lingus.save.v2', raw);
    localStorage.setItem('lingus.pause-events', 'false');
  }, JSON.stringify(state));
  await page.goto('/');
  await expect(page.getByRole('img', { name: /Mappa della valle/ })).toBeVisible();
  if (!paused) await page.getByRole('button', { name: 'Riprendi il tempo', exact: true }).click();
}

async function snapshot(page: Page): Promise<GameState> {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
  await page.getByRole('button', { name: 'Chiudi finestra', exact: true }).click();
  return state;
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Sezioni di gioco' });

test('phone reading freezes the simulation across both tabs and dialogs, then resumes without catch-up', async ({
  page,
}) => {
  await start(page);
  await nav(page)
    .getByRole('button', { name: /^Tribù/ })
    .click();
  const before = await snapshot(page);
  expect(before.paused).toBe(false);
  await page.clock.fastForward(60_000);
  const tribe = await snapshot(page);
  expect(tribe.time).toBe(before.time);
  expect(tribe.units).toEqual(before.units);
  await nav(page).getByRole('button', { name: 'Pensiero', exact: true }).click();
  await page.getByRole('button', { name: /Il lessico della tribù/ }).click();
  await page.getByRole('button', { name: 'Chiudi finestra', exact: true }).click();
  await page.clock.fastForward(60_000);
  const thought = await snapshot(page);
  expect(thought.time).toBe(before.time);
  expect(thought.resources).toEqual(before.resources);
  await nav(page).getByRole('button', { name: 'Mappa', exact: true }).click();
  const returned = await snapshot(page);
  expect(returned.time - before.time).toBeLessThan(2);
  await page.clock.runFor(1000);
  const after = await snapshot(page);
  expect(after.paused).toBe(false);
  expect(after.time).toBeGreaterThan(returned.time);
  expect(after.time - returned.time).toBeLessThan(3);
});

test('phone reading preserves a manual pause when returning to the map', async ({ page }) => {
  await start(page, true);
  const before = await snapshot(page);
  for (const label of [/^Tribù/, /^Pensiero$/, /^Mappa$/]) {
    await nav(page).getByRole('button', { name: label }).click();
    await page.clock.fastForward(6000);
  }
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
  const after = await snapshot(page);
  expect(after.time).toBe(before.time);
  expect(after.paused).toBe(true);
});

test('backgrounding during phone reading keeps the safety pause on return to the map', async ({
  page,
}) => {
  await start(page);
  await nav(page).getByRole('button', { name: 'Pensiero', exact: true }).click();
  const before = await snapshot(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(60_000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await nav(page).getByRole('button', { name: 'Mappa', exact: true }).click();
  await page.clock.runFor(1000);
  const after = await snapshot(page);
  expect(after.time).toBe(before.time);
  expect(after.paused).toBe(true);
});

test('reading suspension follows the mobile layout while desktop keeps running', async ({
  page,
}) => {
  await start(page);
  await nav(page)
    .getByRole('button', { name: /^Tribù/ })
    .click();
  const phone = await snapshot(page);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await expect(page.getByRole('img', { name: /Mappa della valle/ })).toBeVisible();
  await page.clock.runFor(1000);
  const desktop = await snapshot(page);
  expect(desktop.time).toBeGreaterThan(phone.time);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(nav(page).getByRole('button', { name: /^Tribù/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const returned = await snapshot(page);
  await page.clock.fastForward(60_000);
  expect((await snapshot(page)).time).toBe(returned.time);
});
