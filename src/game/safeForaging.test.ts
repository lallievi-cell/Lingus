import { describe, expect, it } from 'vitest';
import { createGame } from './engine';
import { updateUnits } from './simulation';

function scene(hunger = 65) {
  const state = createGame(6842, 'guided');
  state.time = 565;
  state.units = [state.units[0]];
  Object.assign(state.units[0], { ...state.home, hunger, temp: 60, action: 'idle' });
  state.entities = [
    {
      id: 'distant-meal',
      kind: 'ground',
      resource: 'food',
      x: 200,
      y: 200,
      hp: 0,
      maxHp: 1,
      amount: 5,
    },
  ];
  state.buildings = [
    { id: 'fire', kind: 'campfire', ...state.home, hp: 100, active: true, completed: true },
  ];
  return state;
}

describe('a warm community avoids futile freezing food trips', () => {
  it('keeps a sheltered person warm rather than sending ordinary appetite into lethal cold', () => {
    const state = scene();
    updateUnits(state, 0.25);
    expect(state.units[0].action).not.toBe('eating');
    expect(state.units[0].targetId).not.toBe('distant-meal');
    expect(state.units[0].temp).toBeGreaterThanOrEqual(60);
    expect(state.entities[0].amount).toBe(5);
  });
  it('still seeks food in an urgent hunger emergency', () => {
    const state = scene(95);
    updateUnits(state, 0.25);
    expect(state.units[0].targetId).toBe('distant-meal');
    expect(state.units[0].action).toBe('eating');
  });
  it('starts foraging normally when spring makes the trip safe', () => {
    const state = scene();
    state.time = 600.25;
    updateUnits(state, 0.25);
    expect(state.units[0].targetId).toBe('distant-meal');
  });
  it('honours an explicit meal order and preserves the previous Guided behaviour', () => {
    const explicit = scene();
    Object.assign(explicit.units[0], {
      action: 'eating',
      command: ['S_01', 'V_02'],
      targetId: 'distant-meal',
    });
    updateUnits(explicit, 0.25);
    expect(explicit.units[0].targetId).toBe('distant-meal');
    const legacy = scene();
    delete legacy.openingBalanceVersion;
    delete legacy.openingCouncilsCompleted;
    legacy.time = 330;
    updateUnits(legacy, 0.25);
    expect(legacy.units[0].targetId).toBe('distant-meal');
  });
});
