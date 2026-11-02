import { expect, test } from '@playwright/test';
import { createGame, issueCommand } from '../src/game/engine';
import { WORD_ORDER } from '../src/game/content';

for (const width of [390, 1440]) {
  test(`redirecting a paid builder explains the material loss before and after the order at ${width}`, async ({
    page,
  }) => {
    // A prepared, funded camp isolates the warning. The construction itself is
    // ordered and paid through the public command handler.
    let state = createGame(6842, 'guided');
    Object.assign(state, { started: true, paused: true, tier: 3 });
    state.resources.wood = 30;
    state.resources.stone = 30;
    state.buildings.push({
      id: 'fixture-depot',
      kind: 'depot',
      ...state.home,
      hp: 150,
      active: true,
      completed: true,
    });
    for (const word of WORD_ORDER) {
      state.words[word] = {
        retention: 100,
        custodians: state.units.map((unit) => unit.id),
        uses: 0,
      };
      for (const unit of state.units) if (!unit.knows.includes(word)) unit.knows.push(word);
    }
    for (const unit of state.units)
      Object.assign(unit, { ...state.home, action: 'idle', hunger: 0, temp: 100 });
    state = issueCommand(state, ['S_01', 'V_08', 'O_02', 'O_01'], {
      type: 'point',
      x: 255,
      y: 255,
    });
    const builderId = state.units.find((unit) => unit.action === 'building')!.id;
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1050 });
    await page.addInitScript(
      (raw) => localStorage.setItem('lingus.save.v2', raw),
      JSON.stringify(state),
    );
    await page.goto('/');
    // Recall a real movement phrase, then choose a target in the visible valley.
    await page.getByRole('button', { name: 'Tutti gli adulti', exact: true }).click();
    if (width < 600)
      await page.getByRole('button', { name: 'Spazio 1: chi?', exact: true }).click();
    await page.getByRole('button', { name: /^Gruppo:/ }).click();
    await page.getByRole('button', { name: /^Andare:/ }).click();
    const canvas = page.getByRole('img', { name: /Mappa della valle/ });
    const box = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: box.width * 0.35, y: box.height * 0.6 } });
    const preview = page.locator('.order-preview');
    await preview.locator('summary').click();
    await expect(preview).toContainText('Questo ordine abbandona una costruzione già pagata');
    await expect(preview).toContainText('Scegli altri esecutori');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Pronuncia', exact: true }).click();
    await expect(page.locator('.toast')).toContainText(
      'L’ordine ha interrotto una costruzione già pagata',
    );
    await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
    await page.getByRole('button', { name: /Salva adesso/ }).click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
    expect(saved.resources).toEqual(state.resources);
    expect(
      saved.units.find((unit: { id: string }) => unit.id === builderId).paidConstruction,
    ).toBeUndefined();
    expect(saved.stats.commands).toBe(state.stats.commands + 1);
  });
}
