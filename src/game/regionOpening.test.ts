import { describe, expect, it } from 'vitest';
import { setImmediate } from 'node:timers/promises';
import { replayRandomOpening } from '../../tests/scenarios/randomOpening';
import { getCalendar } from './calendar';
import { parseGame, serializeGame } from './engine';

describe('ordinary Guided opening in the larger region', () => {
  it.each([1, 42, 6842])(
    'earns its fire and supplies before winter, seed %s',
    async (seed) => {
      // Each replay is synchronous CPU work. Let the test worker exchange its
      // pending reporter messages between seeds instead of starving RPC timers.
      await setImmediate();
      const replay = replayRandomOpening(seed, 1000, true);
      await setImmediate();
      const { state } = replay;
      expect(state.openingBalanceVersion).toBe(1);
      expect(state.mapGeneration?.worldSize).toBe(1000);
      expect(state.gameOver).toBeNull();
      expect(state.home).toEqual({ x: 550, y: 550 });
      expect(replay.firstFireAt).not.toBeNull();
      expect(replay.firstFireAt!).toBeLessThanOrEqual(350);
      expect(getCalendar(state).seasonIndex).toBeLessThan(3);
      expect(replay.rejectedOrders).toEqual([]);
      expect(replay.hiddenTargets).toEqual([]);
      // New births may already have joined the seven founders by this point.
      for (let index = 0; index < 7; index++)
        expect(state.units.find((unit) => unit.id === `unit-${index}`)?.hp).toBeGreaterThan(0);
      expect(state.resources.tool).toBeGreaterThanOrEqual(1);
      expect(state.resources.wood).toBeGreaterThanOrEqual(2);
      expect(
        state.buildings.find((building) => !building.cityId && building.kind === 'campfire'),
      ).toMatchObject({
        ...state.home,
        active: true,
      });
      expect(parseGame(serializeGame(state))).not.toBeNull();
    },
    60_000,
  );
});
