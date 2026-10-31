import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1440, height: 1050 },
  { width: 390, height: 844 },
]) {
  test(`a real first material is understood without stopping the world at ${viewport.width}`, async ({
    page,
  }) => {
    test.setTimeout(65_000);
    await page.setViewportSize(viewport);
    await page.goto('/');
    // Only start the ordinary world and issue its first real order. There are
    // no granted words, resources, teleports, crafted sparks or time advances.
    const raw = await page.evaluate(async () => {
      const { createGame, issueCommand } = await import('/src/game/engine.ts');
      const state = createGame(6842, 'guided');
      state.started = true;
      const tree = state.entities.find((entity) => entity.kind === 'tree')!;
      return JSON.stringify(
        issueCommand(state, ['S_01', 'V_03'], {
          type: 'entity',
          id: tree.id,
          x: tree.x,
          y: tree.y,
        }),
      );
    });
    await page.addInitScript((raw) => localStorage.setItem('lingus.save.v2', raw), raw);
    await page.reload();
    // Restoring any save deliberately pauses the world; resume through its UI.
    await page.getByRole('button', { name: 'Riprendi il tempo', exact: true }).click();
    const notice = page.locator('.contextual-discovery-notice');
    await expect(notice).toContainText('La tribù comprende «Legno»', { timeout: 50_000 });
    await expect(notice).toContainText('legno che il lavoro lascia a terra');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Metti in pausa', exact: true })).toBeVisible();
    const inspect = notice.getByRole('button', { name: 'Che cosa cambia?', exact: true });
    expect((await inspect.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await inspect.click();
    await expect(page.getByRole('dialog')).toContainText('Legno');
    await page.getByRole('button', { name: 'Chiudi finestra', exact: true }).click();
    await expect(notice).not.toBeVisible();
  });
}
