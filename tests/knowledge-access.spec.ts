import { expect, test, type Page } from '@playwright/test';

type KnowledgeFixture = 'first' | 'rediscovered-guided' | 'rediscovered-classic';

/** Actual work produces both intuitions. Only the view is isolated afterward;
 * this is a focused interaction check, not a full opening playthrough. */
async function seedKnowledge(page: Page, scenario: KnowledgeFixture) {
  await page.goto('/');
  const fixture = await page.evaluate(async (scenario) => {
    const { createGame, issueCommand, solveSpark, tick } = await import('/src/game/engine.ts');
    const { killUnit } = await import('/src/game/simulation.ts');
    let state = createGame(6842, scenario === 'rediscovered-classic' ? 'classic' : 'guided');
    state.started = true;
    const tree = state.entities.find((entity) => entity.kind === 'tree')!;
    state = issueCommand(state, ['S_01', 'V_03'], {
      type: 'entity',
      id: tree.id,
      x: tree.x,
      y: tree.y,
    });
    for (let i = 0; i < 200 && !state.sparks.some((spark) => spark.wordId === 'O_03'); i++)
      state = tick(state, 0.25);
    const original = state.sparks.find((spark) => spark.wordId === 'O_03');
    if (!original) throw new Error('The ordinary first work did not produce Legno');
    let deadCustodianId: string | null = null;
    if (scenario !== 'first') {
      state = solveSpark(state, original.id, original.recipe);
      const custodian = state.units.find((unit) => unit.id === original.unitId)!;
      deadCustodianId = custodian.id;
      killUnit(state, custodian, 'V_03');
      if (state.words.O_03.retention !== 0) throw new Error('The word was not actually lost');
      // Require a genuinely new physical episode rather than the old buffer.
      for (const unit of state.units) {
        unit.eventMemory = unit.eventMemory?.filter((event) => !event.wordIds.includes('O_03'));
        if (unit.tension) delete unit.tension.O_03;
      }
      const next = state.entities.find(
        (entity) => entity.kind === 'tree' && entity.id !== tree.id && entity.amount > 0,
      )!;
      state = issueCommand(
        state,
        ['S_01', 'V_03'],
        {
          type: 'entity',
          id: next.id,
          x: next.x,
          y: next.y,
        },
        undefined,
        { type: 'point', x: tree.x, y: tree.y },
      );
      for (let i = 0; i < 240 && !state.sparks.some((spark) => spark.wordId === 'O_03'); i++)
        state = tick(state, 0.25);
    }
    const fresh = state.sparks.find((spark) => spark.wordId === 'O_03');
    if (!fresh || (scenario !== 'first' && fresh.id === original.id))
      throw new Error('A fresh physical intuition is required');
    state.sparks = [fresh];
    state.paused = true;
    return { raw: JSON.stringify(state), witnessId: fresh.unitId, deadCustodianId };
  }, scenario);
  await page.addInitScript(
    ({ raw, marker }) => {
      if (sessionStorage.getItem(marker)) return;
      localStorage.setItem('lingus.save.v2', raw);
      sessionStorage.setItem(marker, 'applied');
    },
    { raw: fixture.raw, marker: `knowledge-fixture.${scenario}` },
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Segui l’intuizione/ }).click();
  await expect(page.getByRole('dialog', { name: 'La Scintilla Cognitiva' })).toBeVisible();
  return fixture;
}

async function savedState(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  return state;
}

test('a first real discovery still requires the puzzle', async ({ page }) => {
  const fixture = await seedKnowledge(page, 'first');
  const dialog = page.getByRole('dialog', { name: 'La Scintilla Cognitiva' });
  await expect(dialog.getByRole('button', { name: /Ricorda la parola/ })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Dai un nome all’intuizione' })).toBeDisabled();
  await dialog.getByRole('button', { name: /^Colpire:/ }).click();
  await dialog.getByRole('button', { name: 'Dai un nome all’intuizione' }).click();
  await expect(dialog).toHaveCount(0);
  const state = await savedState(page);
  expect(state.words.O_03.retention).toBe(50);
  expect(state.words.O_03.custodians).toEqual([fixture.witnessId]);
  expect(state.words.O_03.learnedRecipe).toEqual(['V_03']);
});

test('Guided remembers a solved concept after real loss and new experience without replaying the puzzle', async ({
  page,
}) => {
  const fixture = await seedKnowledge(page, 'rediscovered-guided');
  const before = JSON.parse(fixture.raw);
  const dialog = page.getByRole('dialog', { name: 'La Scintilla Cognitiva' });
  await expect(dialog).toContainText('La tribù ha rivissuto l’esperienza');
  await dialog.getByRole('button', { name: /Ricorda la parola/ }).click();
  await expect(dialog).toHaveCount(0);
  const after = await savedState(page);
  expect(after.time).toBe(before.time);
  expect(after.stats.commands).toBe(before.stats.commands);
  expect(after.words.O_03.retention).toBe(50);
  expect(after.words.O_03.custodians).toEqual([fixture.witnessId]);
  expect(after.words.O_03.custodians).not.toContain(fixture.deadCustodianId);
  expect(after.bornWords.O_03).toBe(before.bornWords.O_03);
  expect(after.sparks.some((spark: { wordId: string }) => spark.wordId === 'O_03')).toBe(false);
});

test('Classic retains the puzzle when the same concept is rediscovered', async ({ page }) => {
  const fixture = await seedKnowledge(page, 'rediscovered-classic');
  const dialog = page.getByRole('dialog', { name: 'La Scintilla Cognitiva' });
  await expect(dialog.getByRole('button', { name: /Ricorda la parola/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: /^Colpire:/ }).click();
  await dialog.getByRole('button', { name: 'Dai un nome all’intuizione' }).click();
  await expect(dialog).toHaveCount(0);
  const state = await savedState(page);
  expect(state.playMode).toBe('classic');
  expect(state.words.O_03.custodians).toEqual([fixture.witnessId]);
});
