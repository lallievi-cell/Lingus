import { describe, expect, it } from 'vitest';
import { createGame, tick } from './engine';

/** Prepared needs fixtures; every meal still requires travel and actual food. */
function hungryChild(mode: 'guided' | 'classic' = 'guided', berriesX = 300) {
  const state = createGame(6842, mode);
  Object.assign(state, { started: true, entities: [], cities: [], factions: [], buildings: [] });
  state.units = state.units.slice(0, 1);
  Object.assign(state.units[0], {
    x: state.home.x + 14,
    y: state.home.y,
    age: 1,
    hunger: 96,
    temp: 100,
    hp: 100,
    action: 'idle',
    command: undefined,
  });
  state.resources.food = 2;
  state.entities.push({
    id: 'visible-berries',
    kind: 'berries',
    x: berriesX,
    y: state.home.y,
    hp: 1,
    maxHp: 1,
    amount: 20,
  });
  return state;
}

describe('Guided physical access to delivered meals', () => {
  it('brings an uncommandable hungry child back to nearer stores and pays the meal only on arrival', () => {
    let state = hungryChild();
    state = tick(state, 0.25);
    expect(state.units[0].tx).toBe(state.home.x);
    expect(state.units[0].targetId).toBeUndefined();
    expect(state.resources.food).toBe(2);
    expect(state.units[0].x).toBeLessThan(state.home.x + 14);
    expect(state.units[0].x).toBeGreaterThan(state.home.x + 10);
    for (let step = 0; step < 20 && state.resources.food === 2; step++) state = tick(state, 0.25);
    expect(state.resources.food).toBe(0);
    expect(state.units[0].hunger).toBeLessThan(60);
    expect(
      Math.hypot(state.units[0].x - state.home.x, state.units[0].y - state.home.y),
    ).toBeLessThanOrEqual(10);
    expect(state.entities[0].amount).toBe(20);
    expect(state.stats.commands).toBe(0);
  });

  it.each(['classic', 'closer-forage', 'empty-store', 'forbidden-diet'] as const)(
    'keeps the existing forage choice for %s',
    (scenario) => {
      let state = hungryChild(
        scenario === 'classic' ? 'classic' : 'guided',
        scenario === 'closer-forage' ? 268 : 300,
      );
      if (scenario === 'empty-store') state.resources.food = 0;
      if (scenario === 'forbidden-diet') {
        state.resources.food = 0;
        state.resources.meat = 2;
        state.dogmas.push({
          id: 'diet',
          targetId: 'O_04',
          vectorId: 'M_01',
          vector: 'prohibition',
          name: 'Carne vietata',
          description: '',
          age: 0,
          weight: 10,
          bornAt: 0,
        });
      }
      state = tick(state, 0.25);
      expect(state.units[0].action).toBe('eating');
      expect(state.units[0].targetId).toBe('visible-berries');
      expect(state.entities[0].amount).toBe(20);
    },
  );
});
