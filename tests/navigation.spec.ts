import { expect, test, type Page } from '@playwright/test';
import { closeWordBank, openWordBank, showRecentPhrases } from './mobile-ui';

async function beginPaused(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Dai inizio alla storia' }).click();
  await page.getByRole('button', { name: 'Metti in pausa', exact: true }).click();
}

async function readSave(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  return saved;
}

test.describe('mobile touch navigation', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the three tabs preserve a touch-composed order and keep map, tribe and thought actions reachable', async ({
    page,
  }) => {
    await beginPaused(page);
    await closeWordBank(page);
    const nav = page.getByRole('navigation', { name: 'Sezioni di gioco' });
    const map = page.getByRole('img', { name: /Mappa della valle/ });
    await expect(map).toBeVisible();
    await openWordBank(page);
    await page.getByRole('button', { name: /^Gruppo:/ }).tap();
    await page.getByRole('button', { name: /^Andare:/ }).tap();
    await expect(page.locator('.sentence-slot.filled')).toHaveCount(2);
    await nav.getByRole('button', { name: 'Pensiero', exact: true }).tap();
    await expect(map).toBeHidden();
    await expect(page.getByRole('region', { name: 'Costruttore di frasi' })).toBeHidden();
    await page.getByRole('button', { name: /Il lessico della tribù/ }).tap();
    await expect(page.getByRole('dialog', { name: 'Il lessico della tribù' })).toBeVisible();
    await page.getByRole('button', { name: 'Chiudi finestra' }).tap();
    await nav.getByRole('button', { name: /^Tribù/ }).tap();
    await expect(page.getByLabel('Membri della tribù').getByRole('button')).toHaveCount(7);
    await page.getByRole('button', { name: 'Seleziona un compagno', exact: true }).first().tap();
    await expect(page.locator('.unit-card.selected')).toHaveCount(1);
    await nav.getByRole('button', { name: 'Mappa', exact: true }).tap();
    await expect(page.locator('.sentence-slot.filled')).toHaveCount(2);
    await closeWordBank(page);
    const bounds = (await map.boundingBox())!;
    await map.tap({ position: { x: bounds.width * 0.8, y: bounds.height * 0.35 } });
    await page.getByRole('button', { name: 'Pronuncia', exact: true }).tap();
    await expect(
      page.getByRole('status').filter({ hasText: 'La tribù ha ascoltato.' }),
    ).toBeVisible();
    const saved = await readSave(page);
    expect(saved.stats.commands).toBe(1);
    expect(saved.voice).toBe(2);
    await expect(await showRecentPhrases(page)).toContainText('Gruppo · Andare');
    await closeWordBank(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.locator('.toast')).toBeHidden();
    await page.screenshot({ path: '/workspace/artifacts/lingus-mobile-map.png', fullPage: true });
    await nav.getByRole('button', { name: 'Pensiero', exact: true }).tap();
    await page.screenshot({
      path: '/workspace/artifacts/lingus-mobile-thought.png',
      fullPage: true,
    });
  });

  test('a real two-finger gesture zooms to the limit without selecting a target and permits the next tap', async ({
    page,
  }) => {
    await beginPaused(page);
    await closeWordBank(page);
    const map = page.getByRole('img', { name: /Mappa della valle/ });
    const bounds = (await map.boundingBox())!;
    const x = bounds.x + bounds.width / 2,
      y = bounds.y + bounds.height / 2;
    // A hybrid device may have a hovering mouse before a genuine touch gesture.
    await page.mouse.move(x, y);
    const cdp = await page.context().newCDPSession(page);
    const touch = (id: number, px: number) => ({ id, x: px, y, radiusX: 4, radiusY: 4, force: 1 });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [touch(1, x - 20), touch(2, x + 20)],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [touch(1, x - 120), touch(2, x + 120)],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.lingus-world__control-stack')).toContainText('1600');
    await expect(page.getByRole('button', { name: 'Deseleziona bersaglio' })).toHaveCount(0);
    await map.tap({ position: { x: bounds.width * 0.8, y: bounds.height * 0.35 } });
    await expect(page.getByRole('button', { name: 'Deseleziona bersaglio' })).toBeVisible();
  });
});

test('quick group selection, echoes and keyboard controls affect real orders', async ({ page }) => {
  await beginPaused(page);
  const map = page.getByRole('img', { name: /Mappa della valle/ });
  const bounds = (await map.boundingBox())!;
  const scale = Math.max(bounds.width / 1200, bounds.height / 800) * 4.5;
  const farPoint = {
    x: bounds.width / 2 - 35 * 2.4 * scale,
    y: bounds.height / 2 - 35 * 1.6 * scale,
  };
  await map.dblclick({ position: farPoint });
  await expect(
    page.getByRole('status').filter({ hasText: 'Gruppo centrato: raggio 15 m.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /^Gruppo:/ }).click();
  await page.getByRole('button', { name: /^Andare:/ }).click();
  await page.getByRole('button', { name: 'Pronuncia', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Non ci sono adulti del gruppo' }),
  ).toBeVisible();
  expect((await readSave(page)).stats.commands).toBe(0);
  await map.click({ button: 'right', position: { x: bounds.width / 2, y: bounds.height / 2 } });
  await map.click({ position: farPoint });
  await page.getByRole('button', { name: 'Pronuncia', exact: true }).click();
  expect((await readSave(page)).stats.commands).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(0);
  await page
    .locator('.echo-shelf[aria-label="Frasi recenti"]:visible')
    .getByRole('button', { name: 'Gruppo · Andare', exact: true })
    .click();
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(2);
  await page.keyboard.press('Backspace');
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(1);
  await page.getByRole('button', { name: /^Andare:/ }).click();
  await map.click({ position: farPoint });
  await page.keyboard.press('Digit3');
  await expect(page.getByRole('button', { name: 'Velocità 4x' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  expect((await readSave(page)).stats.commands).toBe(2);
  await expect(page.locator('.toast')).toBeHidden();
  await page.screenshot({
    path: '/workspace/artifacts/lingus-interface-desktop.png',
    fullPage: true,
  });
});
