import { describe, expect, it } from 'vitest';
import { createGame } from './engine';
import { seasonalCore } from './simulation';
import type { GameState } from './types';

/** Isolated weather settlement; the full public-action replay is tested separately. */
function winter(mode: 'guided' | 'classic', time: number): GameState {
  const state = createGame(2000, mode);
  Object.assign(state, { time, units: [], entities: [], cities: [], factions: [] });
  // The first actual weather draw from this seed is below the source's 15% chance.
  return state;
}

describe('Guided first winter climate grace', () => {
  it('suppresses the first blizzard without shifting later random draws', () => {
    const guided = winter('guided', 270);
    const classic = winter('classic', 270);
    seasonalCore(guided);
    seasonalCore(classic);
    expect(classic.disasters.blizzard).toBe(true);
    expect(guided.disasters.blizzard).toBe(false);
    expect(guided.seed).toBe(classic.seed);
  });

  it('restores the same real blizzard roll from the second winter', () => {
    const guided = winter('guided', 630);
    const classic = winter('classic', 630);
    seasonalCore(guided);
    seasonalCore(classic);
    expect(guided.disasters.blizzard).toBe(true);
    expect(classic.disasters.blizzard).toBe(true);
    expect(guided.seed).toBe(classic.seed);
  });

  it('keeps the first-winter risk in legacy saves with no mode', () => {
    const legacy = winter('classic', 270);
    delete legacy.playMode;
    seasonalCore(legacy);
    expect(legacy.disasters.blizzard).toBe(true);
  });
});
