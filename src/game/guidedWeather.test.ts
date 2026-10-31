import { describe, expect, it } from 'vitest';
import { createGame } from './engine';
import { seasonalCore } from './simulation';
import type { GameState } from './types';

/** Isolated legacy weather settlement; public-action replays are tested separately. */
function winter(mode: 'guided' | 'classic', time: number): GameState {
  const state = createGame(2000, mode);
  // The pre-existing weather regressions retain their 270/630 boundaries.
  delete state.openingBalanceVersion;
  delete state.openingCouncilsCompleted;
  Object.assign(state, { time, units: [], entities: [], cities: [], factions: [] });
  // The first actual weather draw from this seed is below the source's 15% chance.
  return state;
}

describe('legacy Guided first winter climate grace', () => {
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

describe('patient Guided first winter climate grace', () => {
  it.each([
    [450, 270, false],
    [870, 630, true],
  ] as const)(
    'settles the actual winter at %ss with the preserved real draw',
    (guidedTime, classicTime, expectedBlizzard) => {
      const guided = createGame(2000, 'guided');
      Object.assign(guided, {
        time: guidedTime,
        units: [],
        entities: [],
        cities: [],
        factions: [],
      });
      const classic = winter('classic', classicTime);
      seasonalCore(guided);
      seasonalCore(classic);
      expect(guided.disasters.blizzard).toBe(expectedBlizzard);
      expect(classic.disasters.blizzard).toBe(true);
      expect(guided.seed).toBe(classic.seed);
    },
  );
});
