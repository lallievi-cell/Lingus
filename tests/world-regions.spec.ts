import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../src/game/engine';
import type { GameState } from '../src/game/types';
import { closeWordBank, openTargetDetails } from './mobile-ui';

async function saved(page: Page): Promise<GameState> {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const result = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
  await page.getByRole('button', { name: 'Chiudi finestra', exact: true }).click();
  return result;
}

async function chooseNeighbour(page: Page) {
  await page.getByRole('button', { name: 'Atlante del mondo', exact: true }).click();
  const atlas = page.getByRole('dialog', { name: 'Atlante del mondo' });
  await expect(
    atlas.getByRole('group', { name: 'Le regioni del mondo' }).getByRole('button'),
  ).toHaveCount(16);
  await atlas
    .getByRole('button', { name: 'Regione settentrionale verso ovest, inesplorata', exact: true })
    .click();
  return atlas;
}

for (const width of [320, 1440]) {
  test(`a new world is opt-in and the atlas preserves unknown geography at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 1050 });
    await page.goto('/');
    await page.getByRole('button', { name: /^Mondo Sedici regioni/ }).click();
    await page.getByLabel('Seed della mappa', { exact: true }).fill('518');
    await page.getByRole('button', { name: 'Dai inizio alla storia' }).click();
    await page.getByRole('button', { name: 'Metti in pausa', exact: true }).click();
    await closeWordBank(page);
    const before = await saved(page);
    expect(before.world?.seed).toBe(518);
    expect(Object.keys(before.world!.regions)).toEqual(['0:0']);
    const atlas = await chooseNeighbour(page);
    await expect(atlas.locator('.world-atlas-terrain')).toHaveCount(1);
    await expect(atlas.getByRole('button', { name: 'Prepara il viaggio' })).toBeDisabled();
    await expect(atlas.locator('.world-atlas-travel-issue')).toContainText('spazi di pensiero');
    await page.screenshot({ path: test.info().outputPath(`world-atlas-${width}.png`) });
    await atlas.getByRole('button', { name: 'Chiudi finestra', exact: true }).click();
    const after = await saved(page);
    expect(after.world).toEqual(before.world);
    expect(after.voice).toBe(before.voice);
    expect(after.stats.commands).toBe(before.stats.commands);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test(`atlas travel prepares a real boundary order without executing it at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 1050 });
    // This presentation fixture supplies the learned word Qui and the three
    // cognitive slots of the next chapter. The ordinary opening is separate.
    const state = createGame(518, 'guided', 'random', 1000, true);
    Object.assign(state, { started: true, paused: true, tier: 1 });
    state.words.O_01 = { retention: 100, custodians: [state.units[0].id], uses: 0 };
    state.units[0].knows.push('O_01');
    await page.addInitScript((raw) => {
      if (sessionStorage.getItem('world-atlas-fixture')) return;
      localStorage.setItem('lingus.save.v2', raw);
      sessionStorage.setItem('world-atlas-fixture', 'yes');
    }, JSON.stringify(state));
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: 'Riprendi il tempo', exact: true }),
    ).toBeVisible();
    await closeWordBank(page);
    const before = await saved(page);
    const atlas = await chooseNeighbour(page);
    await atlas.getByRole('button', { name: 'Prepara il viaggio', exact: true }).click();
    await expect(atlas).toHaveCount(0);
    await expect(page.locator('.sentence-slot.filled')).toHaveCount(3);
    await expect(page.locator('.map-toolbar')).toContainText('Confine verso');
    if (width === 320) {
      const slots = page.getByRole('group', { name: 'Spazi della frase' });
      const strip = (await slots.boundingBox())!;
      for (const word of ['Gruppo', 'Andare', 'Qui']) {
        const slot = slots.getByRole('button', { name: `Modifica ${word}`, exact: true });
        const box = (await slot.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(strip.x);
        expect(box.x + box.width).toBeLessThanOrEqual(strip.x + strip.width + 1);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await expect(page.getByRole('button', { name: 'Raduna al campo' })).toBeInViewport();
      const labelsFit = await page
        .locator('.executor-selection :is(.executor-label, .recall-label)')
        .evaluateAll((labels) =>
          labels.every((label) => label.scrollWidth <= label.clientWidth + 1),
        );
      expect(labelsFit).toBe(true);
      const speed = page.getByRole('combobox', { name: 'Velocità del tempo' });
      await speed.selectOption('2');
      await expect(speed).toHaveValue('2');
    }
    const card = page.getByRole('status', { name: 'Dettagli del bersaglio' });
    if (width === 320) {
      await expect(card).toHaveCount(0);
      await openTargetDetails(page);
    }
    await expect(card).toContainText('Viaggio fra regioni');
    await expect(card).toContainText('carichi');
    if (width === 320) {
      const detailsBounds = (await card.boundingBox())!;
      const minimapBounds = (await page.locator('.lingus-world__minimap').boundingBox())!;
      expect(detailsBounds.x + detailsBounds.width).toBeLessThanOrEqual(minimapBounds.x);
    }
    const after = await saved(page);
    expect(after.speed).toBe(width === 320 ? 2 : before.speed);
    expect(after.world).toEqual(before.world);
    expect(after.units).toEqual(before.units);
    expect(after.resources).toEqual(before.resources);
    expect(after.voice).toBe(before.voice);
    expect(after.stats.commands).toBe(before.stats.commands);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: test.info().outputPath(`world-travel-prepared-${width}.png`) });
  });
}
