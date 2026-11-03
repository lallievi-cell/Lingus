import { describe, expect, it } from 'vitest';
import { HOME, WORD_ORDER, emptyInventory } from './content';
import { createGame, issueCommand, tick } from './engine';

function hungryCraft() {
  const state = createGame(6842, 'guided');
  delete state.openingBalanceVersion;
  delete state.openingCouncilsCompleted;
  Object.assign(state, {
    started: true,
    paused: false,
    tier: 3,
    time: 20,
    cities: [],
    factions: [],
    entities: [],
    buildings: [],
    resources: emptyInventory(),
  });
  state.units = state.units.slice(0, 1);
  Object.assign(state.units[0], {
    ...HOME,
    age: 6,
    hp: 100,
    hunger: 74,
    temp: 100,
    action: 'idle',
    progress: 0,
  });
  for (const id of WORD_ORDER)
    state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
  state.resources.stone = 4;
  state.resources.cooked = 4;
  return issueCommand(state, ['S_01', 'V_06', 'O_02']);
}

describe('recorded task outcomes across batched public ticks', () => {
  it('retains the actual hunger stop even when later steps feed the worker', () => {
    const state = hungryCraft();
    const batched = tick(state, 10);
    let separate = state;
    for (let step = 0; step < 40; step++) separate = tick(separate, 0.25);

    expect(batched).toEqual(separate);
    expect(batched.units[0].hunger).toBeLessThan(75);
    expect(batched.units[0].lastTaskResult).toMatchObject({
      time: 25,
      reason: 'hunger',
      tokens: ['S_01', 'V_06', 'O_02'],
      suspended: false,
    });
    expect(batched.resources.stone).toBe(3);
    expect(batched.resources.tool).toBe(1);
    expect(state.units[0].lastTaskResult).toBeUndefined();
  });
});
