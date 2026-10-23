import { expect, test } from '@playwright/test';

test('one freezing member overrides a reassuring tribe average and the opening advice', async ({
  page,
}) => {
  await page.goto('/');
  const raw = await page.evaluate(async () => {
    const { createGame } = await import('/src/game/engine.ts');
    const state = createGame(6842, 'guided');
    Object.assign(state, { started: true, paused: true, entities: [], cities: [], factions: [] });
    for (const unit of state.units) Object.assign(unit, { hunger: 0, temp: 100, hp: 100 });
    state.units[0].temp = 15;
    return JSON.stringify(state);
  });
  await page.addInitScript((raw) => {
    localStorage.setItem('lingus.save.v2', raw);
  }, raw);
  await page.reload();
  await expect(page.getByRole('status', { name: 'Condizioni della tribù' })).toHaveText(
    'Freddo intenso',
  );
  const guide = page.getByLabel('Prepararsi al primo inverno');
  await expect(guide).toContainText('La tribù sta gelando');
  await expect(guide).toContainText('il giaciglio da solo non scalda');
  await expect(guide).not.toContainText('riaccenderlo');
});
