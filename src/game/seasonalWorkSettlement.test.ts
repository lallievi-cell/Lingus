import { describe, expect, it } from 'vitest';
import { HOME } from './content';
import { createGame, createReadyBuilding, issueCommand, tick } from './engine';
import type { GameState } from './types';

/** Isolated settlement fixtures: these are not campaigns from the Seed Zero. */
function winterPen(vegetables: number, time = 270, active = true) {
  let state = createGame(6842);
  Object.assign(state, {
    started: true,
    time,
    tier: 3,
    entities: [],
    cities: [],
    factions: [],
  });
  for (const unit of state.units)
    Object.assign(unit, {
      ...HOME,
      age: 6,
      hp: 100,
      hunger: 0,
      temp: 100,
      action: 'idle',
      progress: 0,
    });
  for (const id of ['V_10', 'O_04', 'O_01']) {
    state.words[id] = {
      retention: 100,
      custodians: state.units.map((unit) => unit.id),
      uses: 0,
    };
    for (const unit of state.units) unit.knows.push(id);
  }
  for (const kind of ['pen', 'campfire', 'house', 'storage', 'depot'] as const)
    createReadyBuilding(state, kind);
  const pen = state.buildings.find((building) => building.kind === 'pen')!;
  pen.livestock = 1;
  pen.active = active;
  // Existing meals and shelter keep this test about the settlement of real work.
  // People eat cooked food first, preserving vegetables for the five-unit fee.
  Object.assign(state.resources, { cooked: 100, food: vegetables, wood: 100, stone: 100 });
  if (active)
    state = issueCommand(
      state,
      ['S_01', 'V_10', 'O_04'],
      { type: 'building', id: pen.id, x: pen.x, y: pen.y },
      undefined,
      { type: 'point', ...HOME },
    );
  return state;
}

function closeWinter(state: GameState) {
  let next = state;
  while (next.time < 360) next = tick(next, Math.min(1, 360 - next.time));
  return next;
}

const pen = (state: GameState) => state.buildings.find((building) => building.kind === 'pen')!;

describe('maintenance changes the next season, not work already completed', () => {
  it('settles a real full winter shift before disabling an unpaid pen for spring', () => {
    const state = closeWinter(winterPen(0));
    expect(state.stats.commands).toBe(1);
    expect(pen(state).seasonWork?.['3'].efficiencySeconds).toBeCloseTo(60);
    expect(state.resources.meat).toBeCloseTo(20);
    expect(state.resources.pelt).toBeCloseTo(5);
    expect(pen(state).active).toBe(false);
    expect(pen(state).hp).toBe(160);
  });

  it('pays the real five vegetables and keeps the worked pen active for spring', () => {
    const state = closeWinter(winterPen(5));
    expect(state.resources.food).toBe(0);
    expect(state.resources.meat).toBeCloseTo(20);
    expect(state.resources.pelt).toBeCloseTo(5);
    expect(pen(state).active).toBe(true);
    expect(pen(state).hp).toBe(200);
  });

  it('reactivates an inactive pen on payment without inventing work for the elapsed winter', () => {
    const state = closeWinter(winterPen(5, 270, false));
    expect(state.stats.commands).toBe(0);
    expect(pen(state).seasonWork).toBeUndefined();
    expect(state.resources.food).toBe(0);
    expect(state.resources.meat).toBe(0);
    expect(state.resources.pelt).toBe(0);
    expect(pen(state).active).toBe(true);
    expect(pen(state).hp).toBe(200);
  });

  it('settles only the real half shift when the next season cannot be paid', () => {
    const state = closeWinter(winterPen(0, 300));
    expect(pen(state).seasonWork?.['3'].efficiencySeconds).toBeCloseTo(30);
    expect(state.resources.meat).toBeCloseTo(10);
    expect(state.resources.pelt).toBeCloseTo(2.5);
    expect(pen(state).active).toBe(false);
    expect(pen(state).hp).toBe(160);
  });
});
