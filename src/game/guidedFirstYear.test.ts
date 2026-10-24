import { describe, expect, it } from 'vitest';
import { replayGuidedFirstYear } from '../../tests/scenarios/guidedFirstYear';
import { HOME } from './content';
import { hasWord, parseGame, serializeGame } from './engine';

describe('ordinary Guided first year', () => {
  it.each([6842, 1, 42, 12])(
    'survives the first normal winter and pays for teaching, seed %s',
    (seed) => {
      const result = replayGuidedFirstYear(seed);
      const { state, orders, rejectedOrders, snapshots } = result;
      expect(state.time).toBe(390);
      expect(state.gameOver).toBeNull();
      expect(result.firstFireAt).not.toBeNull();
      expect(result.firstFireAt).toBeLessThanOrEqual(150);
      expect(rejectedOrders).toEqual([]);
      expect(orders.length).toBeLessThanOrEqual(16);
      expect(orders.every((order) => order.at % 10 === 0 && order.tokens[0] === 'S_01')).toBe(true);
      expect(state.stats.commands).toBe(orders.length);
      expect(state.stats.taught).toBeGreaterThanOrEqual(3);
      expect(state.words.O_05.custodians.length).toBeGreaterThanOrEqual(2);
      expect(hasWord(state, 'O_05')).toBe(true);
      expect(
        state.buildings.some(
          (building) => !building.cityId && building.kind === 'depot' && building.completed,
        ),
      ).toBe(true);
      expect(
        state.units.filter((unit) => unit.hp > 0 && unit.factionId === 'player').length,
      ).toBeGreaterThanOrEqual(6);
      expect(
        state.tribeEvents
          ?.filter((event) => event.kind === 'death')
          .every((event) => event.cause === 'oldAge'),
      ).toBe(true);
      expect(state.cohesion).toBeGreaterThanOrEqual(60);
      expect(state.resources.wood).toBeGreaterThanOrEqual(2);
      const winter = snapshots.find((snapshot) => snapshot.at === 270)!.state;
      const winterNight = snapshots.find((snapshot) => snapshot.at === 330)!.state;
      const spring = snapshots.find((snapshot) => snapshot.at === 360)!.state;
      // The fire must protect the actual winter. A fresh spring storm may
      // legitimately extinguish it at 360 after that winter has ended.
      for (const duringWinter of [winter, winterNight]) {
        expect(
          duringWinter.buildings.find(
            (building) => !building.cityId && building.kind === 'campfire',
          ),
        ).toMatchObject({ ...HOME, active: true });
      }
      // Guided removes the first-winter blizzard, including the roll that
      // previously killed this ordinary route on seed 12. Later winters still
      // require their own shelter and clothing; this is not a campaign proof.
      expect(winter.disasters.blizzard).toBe(false);
      expect(winter.resources.food).toBeGreaterThan(0);
      expect(spring.gameOver).toBeNull();
      expect(
        spring.units.filter((unit) => unit.hp > 0 && unit.factionId === 'player').length,
      ).toBeGreaterThanOrEqual(6);
      expect(parseGame(serializeGame(state))).not.toBeNull();
    },
    35_000,
  );

  it('also survives when the exploration and food order are delayed by ten seconds', () => {
    const result = replayGuidedFirstYear(6842, 10);
    expect(result.rejectedOrders).toEqual([]);
    expect(result.state.time).toBe(390);
    expect(result.state.gameOver).toBeNull();
    expect(
      result.orders.some((order) => order.at === 210 && order.tokens.join('|') === 'S_01|V_01'),
    ).toBe(true);
    expect(
      result.orders.some((order) => order.at === 240 && order.tokens.join('|') === 'S_01|V_04'),
    ).toBe(true);
    expect(result.state.stats.taught).toBeGreaterThanOrEqual(3);
    // Real routes alter the sampling of the ordinary RNG. Uma can die of old
    // age at the spring boundary; a birth must never hide an environmental loss.
    const originals = result.state.units.filter((unit) => /^unit-[0-6]$/.test(unit.id));
    const losses = result.state.tribeEvents?.filter((event) => event.kind === 'death') ?? [];
    expect(originals).toHaveLength(7);
    expect(losses.length).toBeLessThanOrEqual(1);
    expect(losses.every((event) => event.cause === 'oldAge')).toBe(true);
    for (const unit of originals)
      if (unit.hp <= 0) {
        expect(unit.age).toBeGreaterThanOrEqual(15);
        expect(losses.some((event) => event.unitId === unit.id && event.cause === 'oldAge')).toBe(
          true,
        );
      }
    expect(
      result.state.units.filter((unit) => unit.hp > 0 && unit.factionId === 'player').length,
    ).toBeGreaterThanOrEqual(7 - losses.length);
    expect(result.state.cohesion).toBeGreaterThanOrEqual(60);
  }, 35_000);
});
