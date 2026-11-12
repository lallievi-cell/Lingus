import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, emptyInventory, RESOURCE_ORDER, WORD_ORDER } from './content';
import { completeForeignMerchant, dispatchForeignMerchants } from './foreignCommerce';
import { foreignFuelReserve } from './foreignEconomy';
import { createInitialState } from './state';
import type { City, GameState, RegionalCultureId, Resource } from './types';

/** Prepared commercial societies isolate planning choices, not ordinary progress. */
function society(culture?: RegionalCultureId) {
  const state = createInitialState(5678);
  Object.assign(state, { started: true, time: 300 });
  for (const id of WORD_ORDER)
    state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
  const origin = state.cities[0],
    faction = state.factions[0];
  if (culture) faction.culture = culture;
  faction.words = [...WORD_ORDER];
  origin.words = [...faction.words];
  origin.cohorts = { workers: 2, warriors: 0, sages: 0, slaves: 0 };
  origin.resources = {
    ...emptyInventory(),
    food: 80,
    wood: 40,
    stone: 40,
    ingot: 1,
    coin: 10,
  };
  state.resources = { ...emptyInventory(), food: 100, stone: 100 };
  const destination: City = {
    ...structuredClone(origin),
    id: 'prepared-capital',
    factionId: 'player',
    capital: true,
    resources: state.resources,
    x: 250,
    y: 250,
  };
  state.cities = [origin, destination];
  state.factions = [faction];
  state.buildings = [];
  state.caravans = [];
  state.laws = [];
  return { state, origin, faction, destination };
}

function total(state: GameState, resource: Resource) {
  return (
    state.resources[resource] +
    state.cities
      .filter((city) => !city.capital)
      .reduce((sum, city) => sum + city.resources[resource], 0) +
    state.caravans.reduce((sum, caravan) => sum + caravan.resources[resource], 0)
  );
}

describe('regional cultures trade real surplus according to their priorities', () => {
  it('chooses different exports from identical stocks while legacy societies retain value ordering', () => {
    for (const [culture, expected] of [
      ['forest', 'wood'],
      ['stone', 'stone'],
      [undefined, 'ingot'],
    ] as const) {
      const { state, origin, faction } = society(culture);
      const before = Object.fromEntries(
        RESOURCE_ORDER.map((resource) => [resource, total(state, resource)]),
      );
      const words = [...faction.words],
        seed = state.seed;
      dispatchForeignMerchants(state);
      expect(state.caravans).toHaveLength(1);
      expect(state.caravans[0].sourceResource).toBe(expected);
      expect(state.caravans[0].resources[expected]).toBe(expected === 'ingot' ? 1 : 10);
      expect(origin.resources[expected]).toBe(expected === 'ingot' ? 0 : 30);
      for (const resource of RESOURCE_ORDER) expect(total(state, resource)).toBe(before[resource]);
      expect(faction.words).toEqual(words);
      expect(state.seed).toBe(seed);
    }
  });

  it.each([
    ['trail', 60],
    ['dawn', 180],
    [undefined, 90],
  ] as const)('waits for the actual return and its departure interval: %s', (culture, interval) => {
    const { state, origin } = society(culture);
    dispatchForeignMerchants(state);
    const caravan = state.caravans[0];
    state.time = 300 + interval;
    dispatchForeignMerchants(state);
    expect(state.caravans).toHaveLength(1); // Still physically away, even after the interval.
    caravan.returning = true;
    caravan.x = origin.x;
    caravan.y = origin.y;
    completeForeignMerchant(state, caravan);
    expect(caravan.arrived).toBe(true);
    state.time = 300 + interval - 0.25;
    dispatchForeignMerchants(state);
    expect(state.caravans).toHaveLength(1);
    state.time = 300 + interval;
    dispatchForeignMerchants(state);
    expect(state.caravans).toHaveLength(2);
  });

  it('falls back to another genuine surplus rather than exporting meals or hearth fuel', () => {
    const { state, origin } = society('meadow');
    origin.cohorts.workers = 12;
    origin.resources = { ...emptyInventory(), food: 20, meat: 8 };
    state.buildings.push({
      id: 'prepared-hearth',
      kind: 'campfire',
      cityId: origin.id,
      x: origin.x,
      y: origin.y,
      hp: BUILDING_SPECS.campfire.maxHp,
      active: true,
      completed: true,
    });
    origin.resources.wood = foreignFuelReserve(state, origin);
    const neededFuel = origin.resources.wood;
    dispatchForeignMerchants(state);
    expect(state.caravans).toHaveLength(0);
    origin.resources.stone = 3;
    dispatchForeignMerchants(state);
    expect(state.caravans[0].sourceResource).toBe('stone');
    expect(state.caravans[0].resources.stone).toBe(3);
    expect(origin.resources.food).toBe(20);
    expect(origin.resources.meat).toBe(8);
    expect(origin.resources.wood).toBe(neededFuel);
  });

  it.each(['player', 'foreign'] as const)(
    'does not use a coin preference to bypass unknown currency: %s',
    (unknownTo) => {
      const { state, faction, origin } = society('trail');
      if (unknownTo === 'player') delete state.words.O_12;
      else faction.words = faction.words.filter((word) => word !== 'O_12');
      const words = [...faction.words],
        playerWords = JSON.stringify(state.words);
      dispatchForeignMerchants(state);
      expect(state.caravans[0].sourceResource).toBe('ingot');
      expect(state.caravans[0].resources.coin).toBe(0);
      expect(origin.resources.coin).toBe(10);
      expect(faction.words).toEqual(words);
      expect(JSON.stringify(state.words)).toBe(playerWords);
    },
  );

  it('conserves every resource through departure, an actual barter, and return to its origin', () => {
    const { state, origin, destination } = society('forest');
    const before = Object.fromEntries(
      RESOURCE_ORDER.map((resource) => [resource, total(state, resource)]),
    );
    dispatchForeignMerchants(state);
    const caravan = state.caravans[0];
    const originStone = origin.resources.stone;
    caravan.x = destination.x;
    caravan.y = destination.y;
    expect(completeForeignMerchant(state, caravan)).toBe('exchange');
    expect(caravan.returning).toBe(true);
    expect(origin.resources.stone).toBe(originStone); // Goods must still return.
    expect(caravan.resources.stone).toBe(10);
    for (const resource of RESOURCE_ORDER) expect(total(state, resource)).toBe(before[resource]);
    caravan.x = origin.x;
    caravan.y = origin.y;
    expect(completeForeignMerchant(state, caravan)).toBe('return');
    expect(origin.resources.stone).toBe(originStone + 10);
    expect(caravan.resources).toEqual(emptyInventory());
    for (const resource of RESOURCE_ORDER) expect(total(state, resource)).toBe(before[resource]);
  });
});
