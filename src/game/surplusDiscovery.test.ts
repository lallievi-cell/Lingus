import { describe, expect, it } from 'vitest';
import { createGame, hasWord, issueCommand, solveSpark, tick } from './engine';
import type { GameState, MapEntity } from './types';
import { isWorldPointRevealed } from './worldDimensions';

function opening(mode: 'guided' | 'classic' = 'guided', world = false, knowsHome = true) {
  const state = createGame(6842, mode, 'random', 1000, world);
  const [witness] = state.units;
  // Keep the founder with Intelligence 4 so other witnesses and their recent
  // experiences cannot hide a failure to recognize a completed, satiating meal.
  state.units = [witness];
  state.started = true;
  witness.hunger = 10;
  if (knowsHome) {
    state.words.O_01 = { retention: 100, custodians: [witness.id], uses: 0 };
    witness.knows.push('O_01');
  }
  const bush = state.entities
    .filter((e) => e.kind === 'berries' && e.amount >= 8 && isWorldPointRevealed(state, e.x, e.y))
    .sort(
      (left, right) =>
        Math.hypot(left.x - state.home.x, left.y - state.home.y) -
        Math.hypot(right.x - state.home.x, right.y - state.home.y),
    )[0];
  return { state, witness, bush };
}

function eat(state: GameState, bush: MapEntity) {
  let next = issueCommand(state, ['S_01', 'V_02'], {
    type: 'entity',
    id: bush.id,
    x: bush.x,
    y: bush.y,
  });
  expect(next.stats.commands).toBe(state.stats.commands + 1);
  expect(next.sparks.some((spark) => spark.wordId === 'V_04')).toBe(false);

  for (let i = 0; i < 64 && next.units[0].lastEventAt?.MEAL === undefined; i++)
    next = tick(next, 0.25);

  expect(next.units[0].lastEventAt?.MEAL).toBe(next.time);
  expect(next.units[0].hunger).toBe(0);
  return next;
}

describe('Portare from an actual surplus meal', () => {
  it.each([
    ['guided', false],
    ['classic', false],
    ['guided', true],
  ] as const)('offers a solvable spark in %s with world=%s', (mode, world) => {
    const { state, witness, bush } = opening(mode, world);
    const fed = eat(state, bush);
    expect(fed.entities.find((entity) => entity.id === bush.id)?.amount).toBe(bush.amount - 1);
    expect(fed.resources.food).toBe(0);
    expect(hasWord(fed, 'V_04')).toBe(false);
    const spark = fed.sparks.find((entry) => entry.wordId === 'V_04');
    expect(spark).toMatchObject({ unitId: witness.id, recipe: ['V_02', 'O_01'] });
    expect(hasWord(solveSpark(fed, spark!.id, ['V_02', 'O_01']), 'V_04')).toBe(true);
  });

  it.each(['prerequisite', 'last portion', 'camp stocks'] as const)(
    'requires more than full satiety when the meal has %s',
    (scenario) => {
      const { state, bush } = opening('guided', false, scenario !== 'prerequisite');
      if (scenario === 'last portion') bush.amount = 1;
      if (scenario === 'camp stocks') state.resources.food = 1;
      const fed = eat(state, bush);
      expect(fed.entities.find((entity) => entity.id === bush.id)?.amount).toBe(
        scenario === 'camp stocks' ? bush.amount : bush.amount - 1,
      );
      expect(fed.resources.food).toBe(0);
      expect(fed.units[0].eventMemory?.some((event) => event.tag === 'ENV_SURPLUS')).toBe(false);
      expect(fed.sparks.some((spark) => spark.wordId === 'V_04')).toBe(false);
    },
  );
});
