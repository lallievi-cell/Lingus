import { describe, expect, it } from 'vitest';
import { HOME, WORD_ORDER } from './content';
import { createGame, createReadyBuilding, tick } from './engine';
import type { GameState } from './types';

/** Prepared critical-cold fixtures: warmth and damage always use the real
 * thermoregulation equation, completed buildings and physical positions.
 */
function blizzard(mode: 'guided' | 'classic' = 'guided', house = true) {
  const state = createGame(6842, mode);
  Object.assign(state, {
    started: true,
    paused: false,
    tier: 3,
    time: 1350,
    entities: [],
    cities: [],
    factions: [],
    buildings: [],
    units: state.units.slice(0, 2),
  });
  state.disasters.blizzard = true;
  for (const [index, unit] of state.units.entries())
    Object.assign(unit, {
      ...HOME,
      age: index === 0 ? 1 : 6,
      hp: 100,
      hunger: 30,
      temp: 14,
      action: 'idle',
      command: undefined,
      progress: 0,
      factionId: 'player',
      isKing: false,
    });
  state.words = Object.fromEntries(
    WORD_ORDER.map((id) => [
      id,
      { retention: 100, custodians: state.units.map((unit) => unit.id), uses: 0 },
    ]),
  );
  Object.assign(state.resources, { pelt: 10, cooked: 100, wood: 100, stone: 100 });
  createReadyBuilding(state, 'campfire');
  if (house) {
    const building = createReadyBuilding(state, 'house');
    building.x = HOME.x + 16;
  }
  return state;
}
function advance(state: GameState, seconds: number) {
  const until = state.time + seconds;
  let current = state;
  while (current.time < until && !current.gameOver)
    current = tick(current, Math.min(0.25, until - current.time));
  return current;
}

describe('Guided critical cold seeks actual available protection', () => {
  it('moves a child and adult from fire alone into the nearby house warmth overlap', () => {
    let state = blizzard();
    state = advance(state, 8);
    const house = state.buildings.find((building) => building.kind === 'house')!;
    for (const unit of state.units) {
      expect(Math.hypot(unit.x - house.x, unit.y - house.y)).toBeLessThanOrEqual(10);
      expect(Math.hypot(unit.x - HOME.x, unit.y - HOME.y)).toBeLessThanOrEqual(15);
    }
    state = advance(state, 32);
    expect(state.units.every((unit) => unit.hp > 50 && unit.temp > 20)).toBe(true);
  });

  it('keeps both people vulnerable when fire and pelts provide no sufficient shelter', () => {
    const state = advance(blizzard('guided', false), 40);
    expect(state.units.every((unit) => unit.hp < 50 && unit.temp === 0)).toBe(true);
    expect(state.buildings).toHaveLength(1);
    expect(state.resources.pelt).toBe(10);
  });

  it('preserves the Classic critical-cold response and its actual damage', () => {
    const state = advance(blizzard('classic'), 8);
    const house = state.buildings.find((building) => building.kind === 'house')!;
    for (const unit of state.units) {
      expect(Math.hypot(unit.x - house.x, unit.y - house.y)).toBeGreaterThan(10);
      expect(unit.temp).toBe(0);
      expect(unit.hp).toBe(88);
    }
  });
});
