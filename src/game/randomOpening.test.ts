import { describe, expect, it } from 'vitest';
import { replayRandomFirstYear, replayRandomOpening } from '../../tests/scenarios/randomOpening';
import { HOME } from './content';
import { hasWord, parseGame, serializeGame } from './engine';

describe('ordinary opening on generated maps', () => {
  it.each([0, 1, 42, 6842, 4294967295])(
    'earns a real central fire before winter with visible sources and coarse group orders, seed %s',
    (seed) => {
      const result = replayRandomOpening(seed);
      const { state, orders, discoveries } = result;
      expect(state.mapGeneration).toEqual({ mode: 'random', seed, version: 1 });
      expect(state.gameOver).toBeNull();
      expect(result.firstFireAt).not.toBeNull();
      expect(result.firstFireAt!).toBeLessThanOrEqual(210);
      expect(result.rejectedOrders).toEqual([]);
      expect(result.hiddenTargets).toEqual([]);
      expect(orders.length).toBeLessThanOrEqual(13);
      expect(orders.every((order) => order.at % 10 === 0 && order.tokens[0] === 'S_01')).toBe(true);
      expect(state.stats.commands).toBe(orders.length);
      expect(
        state.buildings.find((building) => !building.cityId && building.kind === 'campfire'),
      ).toMatchObject({ ...HOME, hp: 100, active: true });
      expect(state.units.filter((unit) => unit.hp > 0 && unit.factionId === 'player')).toHaveLength(
        7,
      );
      expect(hasWord(state, 'O_01')).toBe(true);
      expect(hasWord(state, 'O_05')).toBe(true);
      expect(hasWord(state, 'S_02')).toBe(false);
      // The tested openings earn Fire through real paid stone work, without
      // depending on a favorable lightning roll or a prepared intuition.
      expect(discoveries.find((discovery) => discovery.wordId === 'O_05')?.recipe).toEqual([
        'V_06',
        'O_03',
      ]);
      expect(state.resources.tool).toBeGreaterThanOrEqual(1);
      expect(state.resources.wood).toBeGreaterThanOrEqual(2);
      expect(state.burntWood).toBeGreaterThanOrEqual(5);
      expect(parseGame(serializeGame(state))).not.toBeNull();
    },
    35_000,
  );

  it.each([0, 1, 42, 6842])(
    'reaches the next spring with earned teaching on a generated map, seed %s',
    (seed) => {
      const result = replayRandomFirstYear(seed);
      const { state, orders } = result;
      expect(state.time).toBe(360);
      expect(state.gameOver).toBeNull();
      expect(result.rejectedOrders).toEqual([]);
      expect(result.hiddenTargets).toEqual([]);
      expect(orders.length).toBeLessThanOrEqual(18);
      expect(orders.every((order) => order.at % 10 === 0 && order.tokens[0] === 'S_01')).toBe(true);
      expect(state.stats.commands).toBe(orders.length);
      expect(state.stats.taught).toBeGreaterThanOrEqual(1);
      expect(
        state.units.filter((unit) => unit.hp > 0 && unit.factionId === 'player').length,
      ).toBeGreaterThanOrEqual(6);
      expect(
        state.units
          .filter((unit) => unit.hp > 0 && unit.factionId === 'player')
          .every((unit) => unit.hp >= 40),
      ).toBe(true);
      expect(
        (state.tribeEvents ?? [])
          .filter((event) => event.kind === 'death')
          .every((event) => event.cause === 'oldAge'),
      ).toBe(true);
      expect(state.cohesion).toBeGreaterThanOrEqual(70);
      expect(hasWord(state, 'O_05')).toBe(true);
      expect(state.words.O_05.custodians.length).toBeGreaterThanOrEqual(2);
      for (const at of [270, 330]) {
        const winter = result.snapshots.find((snapshot) => snapshot.at === at)!.state;
        expect(winter.disasters.blizzard).toBe(false);
        expect(
          winter.buildings.find((building) => !building.cityId && building.kind === 'campfire'),
        ).toMatchObject({ ...HOME, active: true });
      }
      expect(parseGame(serializeGame(state))).not.toBeNull();
    },
    35_000,
  );

  it('also keeps all seven people alive beyond the spring boundary on generated seed zero', () => {
    const result = replayRandomFirstYear(0, 390);
    expect(result.state.time).toBe(390);
    expect(result.state.gameOver).toBeNull();
    expect(result.rejectedOrders).toEqual([]);
    expect(
      result.state.units.filter((unit) => unit.hp > 0 && unit.factionId === 'player'),
    ).toHaveLength(7);
    expect(result.state.stats.taught).toBeGreaterThanOrEqual(2);
    expect(result.state.cohesion).toBe(100);
    expect(
      result.state.units
        .filter((unit) => unit.hp > 0 && unit.factionId === 'player')
        .every((unit) => unit.hp >= 60),
    ).toBe(true);
    expect(result.state.resources.wood).toBeGreaterThan(0);
    // The zero is a legitimate procedural seed; it does not select the fixed
    // Seed Zero scenario, and the remaining empty food stock still needs work.
    expect(result.state.mapGeneration?.mode).toBe('random');
    expect(result.state.mapGeneration?.seed).toBe(0);
  }, 35_000);
});
