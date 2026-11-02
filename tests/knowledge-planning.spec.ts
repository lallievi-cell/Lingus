import { expect, test } from '@playwright/test';
import { createGame, dismissCampfire } from '../src/game/engine';
import { executeLessonPlan } from '../src/game/lessonPlan';
import { WORDS } from '../src/game/content';

test('a chosen lesson plan previews real pupils on mobile and pays the actual lessons once', async ({
  page,
}) => {
  // Prepared council isolates the UI contract; it does not certify an ordinary opening.
  const state = createGame(6842, 'guided');
  Object.assign(state, {
    started: true,
    paused: true,
    time: 150,
    campfirePending: true,
    attention: 20,
  });
  state.stats.seasonsSurvived = 1;
  state.buildings.push({
    id: 'lesson-fire',
    kind: 'campfire',
    ...state.home,
    hp: 100,
    active: true,
    completed: true,
  });
  for (const id of ['O_03', 'V_04']) {
    state.words[id] = { retention: 50, custodians: [state.units[0].id], uses: 0 };
    state.units[0].knows.push(id);
  }
  state.words.V_04.custodians.push(state.units[6].id);
  state.units[6].knows.push('V_04');
  const expected = dismissCampfire(executeLessonPlan(state, ['O_03', 'V_04']));
  expect(expected.stats.taught).toBe(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(
    (raw) => localStorage.setItem('lingus.save.v2', raw),
    JSON.stringify(state),
  );
  await page.goto('/');
  const council = page.getByRole('dialog', { name: 'Attorno al falò' });
  const planner = council.locator('.lesson-planner');
  await planner.locator('summary').click();
  await planner.getByRole('checkbox', { name: 'Legno', exact: true }).check();
  await planner.getByRole('checkbox', { name: 'Portare', exact: true }).check();
  await expect(planner.getByLabel('Anteprima del piano')).not.toContainText(/Ilo|Uma|Korg|\d/);
  await expect(planner).toContainText('L’Attenzione disponibile basta');
  await planner.getByRole('button', { name: 'Tramanda il piano', exact: true }).click();
  await expect(planner.getByRole('status')).toContainText('Legno, Portare');
  await expect(planner.getByRole('button', { name: 'Tramanda il piano', exact: true })).toHaveCount(
    0,
  );
  expect(await council.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await council.getByRole('button', { name: 'Concludi consiglio', exact: true }).click();
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
  expect(saved.stats.taught).toBe(expected.stats.taught);
  expect(saved.attention).toBe(expected.attention);
  expect(saved.words.O_03).toEqual(expected.words.O_03);
  expect(saved.words.V_04).toEqual(expected.words.V_04);
});

test('the royal intuition explains its consequence before the player solves it', async ({
  page,
}) => {
  // Prepared intuition checks informed presentation, not its discovery prerequisites.
  const state = createGame(6842, 'guided');
  Object.assign(state, { started: true, paused: true });
  const person = state.units.find((unit) => unit.name === 'Uma')!;
  person.age = 14;
  for (const id of WORDS.S_07.recipe) {
    state.words[id] = { retention: 100, custodians: [person.id], uses: 0 };
    if (!person.knows.includes(id)) person.knows.push(id);
  }
  state.sparks = [
    {
      id: 'royal-intuition',
      wordId: 'S_07',
      unitId: person.id,
      eventLabel: 'Intuizione di comando',
      expiresAt: 90,
      recipe: WORDS.S_07.recipe,
      hint: WORDS.S_07.hint,
    },
  ];
  await page.addInitScript(
    (raw) => localStorage.setItem('lingus.save.v2', raw),
    JSON.stringify(state),
  );
  await page.goto('/');
  await page.locator('.spark-card').click();
  const warning = page.getByLabel('Conseguenza dell’intuizione');
  await expect(warning).toContainText('instaura subito una monarchia');
  await expect(warning).toContainText('Uma');
  await expect(warning).toContainText('successione');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
  expect(saved.government).toBe(state.government);
  expect(saved.words.S_07).toBeUndefined();
  expect(saved.sparks).toHaveLength(1);
});
