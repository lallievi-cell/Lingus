import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, emptyInventory, INNATE_WORDS } from './content';
import { createGame, parseGame, serializeGame } from './engine';
import { getCalendar } from './calendar';
import { cityPopulation, seasonalImperial, updateImperial } from './imperial';
import { seasonalCore } from './simulation';
import { updateForeignPolicy } from './foreignPolicy';
import type { GameState } from './types';

function remoteMaterials(profiled = true) {
  const state = createGame();
  state.units = [];
  state.entities = [
    { id: 'remote-tree', kind: 'tree', x: 150, y: 50, amount: 100, hp: 100, maxHp: 100 },
  ];
  state.cities = state.cities.slice(0, 1);
  state.factions = state.factions.slice(0, 1);
  const city = state.cities[0],
    faction = state.factions[0];
  if (profiled) faction.culture = 'forest';
  faction.words = [...INNATE_WORDS, 'O_01', 'O_02', 'O_03', 'V_04', 'V_05'];
  city.words = [...faction.words];
  city.cohorts = { workers: 2, warriors: 0, sages: 0, slaves: 0 };
  city.housing = 2;
  city.resources = { ...emptyInventory(), cooked: 30, stone: 4 };
  state.buildings = [
    {
      id: 'actual-depot',
      kind: 'depot',
      x: 50,
      y: 50,
      cityId: city.id,
      hp: BUILDING_SPECS.depot.maxHp,
      active: true,
      completed: true,
    },
  ];
  city.buildingIds = ['actual-depot'];
  return state;
}
function oneSeason(state: GameState) {
  state.time = 90;
  state.seasonIndex = 1;
  seasonalImperial(state);
}

describe('regional hauling uses real worker effort and territory', () => {
  it('pays round trips per load and leaves distant physical materials uncollected when time runs out', () => {
    const region = remoteMaterials(),
      legacy = remoteMaterials(false);
    oneSeason(region);
    oneSeason(legacy);
    // Two workers have 90 cycles. A load of 3 units costs 3 extraction cycles
    // plus 100m there/back at 4m/s = 25 cycles: only three loads fit.
    expect(region.cities[0].resources.wood).toBe(9);
    expect(region.entities[0].amount).toBe(91);
    expect(region.cities[0].resources.wood + region.entities[0].amount).toBe(100);
    expect(region.resources.wood).toBe(0);
    expect(legacy.cities[0].resources.wood).toBe(0);
    expect(legacy.entities[0].amount).toBe(100);
  });

  it('does not fetch materials from the player home, a rival district or beyond physical bounds', () => {
    const home = remoteMaterials();
    home.home = { x: 150, y: 50 };
    oneSeason(home);
    expect(home.cities[0].resources.wood).toBe(0);
    expect(home.entities[0].amount).toBe(100);

    const rival = remoteMaterials();
    rival.cities.push({
      ...rival.cities[0],
      id: 'rival',
      factionId: 'opponent',
      x: 150,
      y: 50,
      sectorX: 1,
      sectorY: 0,
      cohorts: { workers: 0, warriors: 1, sages: 0, slaves: 0 },
      resources: { ...emptyInventory(), cooked: 30 },
      buildingIds: [],
    });
    oneSeason(rival);
    expect(rival.cities[0].resources.wood).toBe(0);
    expect(rival.entities[0].amount).toBe(100);

    const outside = remoteMaterials();
    Object.assign(outside.cities[0], { x: 450, sectorX: 4 });
    outside.entities[0].x = 550;
    oneSeason(outside);
    expect(outside.cities[0].resources.wood).toBe(0);
    expect(outside.entities[0].amount).toBe(100);
  });
});

/** Isolate the eight societies from player input. The era schedule is the
 * only controlled progression: no NPC food, people, buildings or words are
 * granted. This is an AI study, not a successful ordinary player campaign. */
describe('untouched regional societies across forty actual Guided seasons', () => {
  it.each([1, 42, 6842])(
    'supports eight communities and pays for real colonies, seed %s',
    (seed) => {
      const state = createGame(seed, 'guided', 'random', 1000);
      state.units = [];
      state.started = true;
      const initialCityIds = new Set(state.cities.map((city) => city.id));
      const seenConvoys = new Set<string>();
      let ordinal = 0;
      for (let step = 1; step <= 3840 * 4; step++) {
        state.time = step / 4;
        state.tier = state.time >= 2040 ? 4 : state.time >= 960 ? 3 : 0;
        updateForeignPolicy(state, 0.25);
        updateImperial(state, 0.25);
        for (const caravan of state.caravans.filter(
          (entry) => entry.kind === 'colonists' && !seenConvoys.has(entry.id),
        )) {
          seenConvoys.add(caravan.id);
          expect(caravan.arrived).not.toBe(true);
          expect(caravan.population).toBe(30);
          expect(caravan.resources.wood).toBe(50);
          expect(caravan.resources.stone).toBe(50);
          expect(
            caravan.resources.food + caravan.resources.meat + caravan.resources.cooked,
          ).toBeCloseTo(50);
        }
        const next = getCalendar(state).seasonIndex;
        if (next === ordinal) continue;
        ordinal = next;
        state.seasonIndex = next;
        seasonalCore(state);
        seasonalImperial(state);
        if (next % 4 === 0) {
          for (const faction of state.factions) {
            const population = state.cities
              .filter((city) => city.factionId === faction.id)
              .reduce((sum, city) => sum + cityPopulation(city), 0);
            expect(population, `${faction.name}, year ${next / 4}`).toBeGreaterThanOrEqual(8);
          }
        }
      }
      expect(ordinal).toBe(40);
      expect(state.factions).toHaveLength(8);
      expect(
        state.factions.every(
          (faction) => faction.words.includes('S_02') && faction.words.includes('M_04'),
        ),
      ).toBe(true);
      expect(seenConvoys.size).toBeGreaterThan(0);
      expect(state.cities.some((city) => !initialCityIds.has(city.id))).toBe(true);
      expect(
        state.cities.every((city) => Object.values(city.resources).every((amount) => amount >= 0)),
      ).toBe(true);
      expect(parseGame(serializeGame(state))).not.toBeNull();
    },
    30_000,
  );
});
