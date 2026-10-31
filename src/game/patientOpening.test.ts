import { describe, expect, it } from 'vitest';
import { setImmediate as yieldToRunner } from 'node:timers/promises';
import { replayPatientOpening } from '../../tests/scenarios/patientOpening';
import { hasWord, parseGame, serializeGame } from './engine';
import { isPlayerBuilding } from './runtime';

describe('ordinary patient Guided first year', () => {
  it.each([
    [6842, 0],
    [12, 0],
    [42, 0],
    [6842, 10],
  ])(
    'prepares a real winter with coarse decisions, seed %s and delay %s',
    async (seed, delay) => {
      const result = replayPatientOpening(seed, delay);
      // Let the worker flush RPC/status messages between CPU-heavy replays.
      await yieldToRunner();
      const { state, councils, snapshots } = result;
      expect(state.openingBalanceVersion).toBe(1);
      expect(state.time).toBe(630);
      expect(result.calendar).toMatchObject({
        seasonIndex: 4,
        season: 0,
        year: 2,
        seasonLength: 90,
      });
      expect(state.gameOver).toBeNull();
      expect(result.firstFireAt).not.toBeNull();
      // At least an entire 150-second opening season remains before winter.
      expect(result.firstFireAt!).toBeLessThanOrEqual(300);
      expect(result.rejectedOrders).toEqual([]);
      expect(result.orders.length).toBeLessThanOrEqual(20);
      expect(result.orders.every((order) => order.at % 10 === 0)).toBe(true);
      expect(state.stats.commands).toBe(result.orders.length);
      // Three chosen lessons are distinct from the council's offered budget.
      // Storms may postpone a council; two useful opportunities precede senile risk.
      const firstCouncils = councils.filter((council) => council.at <= 600).slice(0, 2);
      expect(firstCouncils).toHaveLength(2);
      expect(firstCouncils.every((council) => council.taught.length === 3)).toBe(true);
      expect(firstCouncils.every((council) => council.attention >= 30)).toBe(true);
      expect(councils.every((council) => council.taught.length * 10 <= council.attention)).toBe(
        true,
      );
      expect(state.stats.taught).toBe(
        councils.reduce((sum, council) => sum + council.taught.length, 0),
      );
      expect(state.openingCouncilsCompleted).toBe(councils.length);
      expect(state.words.O_05.custodians.length).toBeGreaterThanOrEqual(2);
      expect(state.words.V_04.custodians.length).toBeGreaterThanOrEqual(2);
      expect(state.words.V_06.custodians.length).toBeGreaterThanOrEqual(2);
      expect(hasWord(state, 'O_05')).toBe(true);
      expect(state.words.O_05.retention).toBeGreaterThanOrEqual(70);
      const winter = snapshots.find((snapshot) => snapshot.at === 450)!.state;
      const winterNight = snapshots.find((snapshot) => snapshot.at === 550)!.state;
      expect(winter.resources.food).toBeGreaterThanOrEqual(8);
      expect(winter.resources.wood).toBeGreaterThanOrEqual(2);
      expect(winter.disasters.blizzard).toBe(false);
      for (const duringWinter of [winter, winterNight])
        expect(
          duringWinter.buildings.find(
            (building) => isPlayerBuilding(duringWinter, building) && building.kind === 'campfire',
          ),
        ).toMatchObject({ active: true });
      expect(
        state.buildings.some(
          (building) =>
            isPlayerBuilding(state, building) && building.kind === 'depot' && building.completed,
        ),
      ).toBe(true);
      const originals = state.units.filter((unit) => /^unit-[0-6]$/.test(unit.id));
      expect(originals).toHaveLength(7);
      expect(originals.every((unit) => unit.hp >= 60)).toBe(true);
      expect(state.tribeEvents?.filter((event) => event.kind === 'death')).toEqual([]);
      expect(parseGame(serializeGame(state))).not.toBeNull();
      // A spring storm may require the paid relighting order at 600.
      // These are declared first-year routes, not sustainable campaign proof.
    },
    35_000,
  );
});

describe('prepared winter on original and generated geography', () => {
  it.each([
    [6842, 0, 'seed-zero'],
    [6842, 10, 'seed-zero'],
    [1, 0, 'random'],
    [42, 0, 'random'],
  ] as const)(
    'sustains ordinary decisions in %s with delay %s on %s',
    async (seed, delay, mode) => {
      const result = replayPatientOpening(seed, delay, mode, 'prepared');
      await yieldToRunner();
      const { state } = result;
      expect(state.time).toBe(630);
      expect(result.firstFireAt).not.toBeNull();
      expect(result.firstFireAt!).toBeLessThanOrEqual(300);
      expect(result.rejectedOrders).toEqual([]);
      expect(result.orders.length).toBeLessThanOrEqual(20);
      expect(result.orders.every((order) => order.at % 10 === 0)).toBe(true);
      expect(state.tribeEvents?.filter((event) => event.kind === 'death')).toEqual([]);
      const founders = state.units.filter((unit) => /^unit-[0-6]$/.test(unit.id));
      expect(founders.every((unit) => unit.hp >= 60)).toBe(true);
      const people = state.units.filter((unit) => unit.hp > 0 && unit.factionId === 'player');
      expect(people.reduce((sum, unit) => sum + unit.hunger, 0) / people.length).toBeLessThan(70);
      expect(people.every((unit) => unit.hunger < 85)).toBe(true);
      expect(
        result.foodRetargets.every(
          (entry) => entry.carriedBefore === 0 && entry.looseAfter === entry.looseBefore,
        ),
      ).toBe(true);
      expect(
        result.councils.filter((council) => council.taught.length >= 3).length,
      ).toBeGreaterThanOrEqual(2);
      expect(state.words.O_05.custodians.length).toBeGreaterThanOrEqual(2);
      expect(state.words.O_05.retention).toBeGreaterThanOrEqual(70);
      expect(parseGame(serializeGame(state))).not.toBeNull();
    },
    35_000,
  );
});
