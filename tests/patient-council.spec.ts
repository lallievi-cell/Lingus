import { expect, test } from '@playwright/test';
import { replayPatientOpening } from './scenarios/patientOpening';

for (const width of [1440, 390]) {
  test(`the first real patient council supports chosen knowledge at ${width}`, async ({ page }) => {
    test.setTimeout(60_000);
    const played = replayPatientOpening(6842);
    const state = played.councilSnapshots[0].state;
    // This save is the product of real commands and paid work, not a grant fixture.
    expect(state.time).toBe(300);
    expect(state.attention).toBeGreaterThanOrEqual(30);
    expect(state.openingCouncilsCompleted).toBe(0);
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1050 });
    await page.addInitScript(
      (raw) => localStorage.setItem('lingus.save.v2', raw),
      JSON.stringify(state),
    );
    await page.goto('/');
    const council = page.getByRole('dialog', { name: 'Attorno al falò' });
    await expect(council).toBeVisible();
    await expect(council.locator('.lesson-budget')).toContainText('più');
    const firstLesson = await council
      .getByRole('button', { name: /^Tramanda/ })
      .first()
      .boundingBox();
    expect(firstLesson).not.toBeNull();
    expect(firstLesson!.y + firstLesson!.height).toBeLessThanOrEqual(
      (width < 600 ? 844 : 1050) - 12,
    );
    await page.screenshot({
      path: test.info().outputPath(`patient-council-${width}.png`),
      animations: 'disabled',
    });
    for (const label of ['Fuoco', 'Portare', 'Scheggiare']) {
      const word = council.getByLabel(`Parola da tramandare: ${label}`, { exact: true });
      await expect(word.getByRole('button', { name: /^Tramanda/ })).toBeEnabled();
      await expect(word).not.toContainText(/\d|%/);
      await word.getByRole('button', { name: /^Tramanda/ }).click();
      await expect(council.locator('.teaching-outcome')).toContainText(label);
    }
    await council.getByRole('button', { name: 'Concludi consiglio', exact: true }).click();
    await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
    await page.getByRole('button', { name: /Salva adesso/ }).click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
    expect(saved.openingCouncilsCompleted).toBe(1);
    expect(saved.stats.taught).toBe(state.stats.taught + 3);
    expect(saved.attention).toBe(state.attention - 30);
    expect(saved.resources.wood).toBeCloseTo(state.resources.wood);
    expect(saved.words.O_05.custodians).toHaveLength(2);
    expect(saved.words.O_05.retention).toBeGreaterThanOrEqual(70);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
