import { describe, expect, it } from 'vitest';
import { createGame } from './engine';
import { BUILDING_SPECS, emptyInventory, INNATE_WORDS } from './content';
import { cityPopulation, seasonalImperial, updateImperial } from './imperial';
import { seasonalCore } from './simulation';
import { updateForeignPolicy } from './foreignPolicy';
import { validSave } from './saveValidation';
import type { BuildingKind, GameState, MapEntity } from './types';

/** Local cohorts isolate real inputs, rations, storage and worker time.
 * They are not an ordinary player campaign or guaranteed AI survival. */
function town(workers = 2, words = ['V_04', 'V_05', 'O_01', 'O_04']) {
  const state = createGame(6842);
  state.units = [];
  state.entities = [];
  state.buildings = [];
  state.cities = state.cities.slice(0, 1);
  state.factions = state.factions.slice(0, 1);
  const city = state.cities[0],
    faction = state.factions[0];
  city.cohorts = { workers, warriors: 0, sages: 0, slaves: 0 };
  city.housing = workers;
  city.resources = emptyInventory();
  city.words = [...INNATE_WORDS, ...words];
  faction.words = [...city.words];
  city.buildingIds = [];
  const add = (kind: BuildingKind, livestock?: number) => {
    const building = {
      id: `${kind}-${state.buildings.length}`,
      kind,
      x: city.x,
      y: city.y,
      hp: BUILDING_SPECS[kind].maxHp,
      active: true,
      completed: true,
      cityId: city.id,
      workerIds: [],
      livestock,
    };
    state.buildings.push(building);
    city.buildingIds.push(building.id);
    return building;
  };
  return { state, city, faction, add };
}
function node(state: GameState, kind: MapEntity['kind'], amount: number, x = 50, y = 50, hp = 100) {
  const source = { id: `source-${state.entities.length}`, kind, amount, x, y, hp, maxHp: 100 };
  state.entities.push(source);
  return source;
}
function season(state: GameState) {
  state.time += 90;
  state.seasonIndex = Math.floor(state.time / 90);
  seasonalImperial(state);
}

describe('foreign finite food logistics and productive experience', () => {
  it('collects a leftover carcass and keeps real surplus instead of consuming every harvest invisibly', () => {
    const { state, city, add } = town();
    add('storage');
    const carcass = node(state, 'deer', 10, 50, 50, 0);
    season(state);
    expect(city.seasonFoodConsumed).toBe(144);
    expect(city.resources.meat).toBeGreaterThan(0);
    expect(carcass.amount + city.resources.meat + city.seasonFoodConsumed! / 40).toBeCloseTo(10);
    expect(state.stats.hunts).toBe(0);
    expect(cityPopulation(city)).toBe(2);
  });

  it('keeps fractional harvested remains nonnegative and reloadable', () => {
    const { state, add } = town(2);
    add('storage');
    const carcass = node(state, 'deer', 0.3, 50, 50, 0);
    season(state);
    expect(carcass.amount).toBeGreaterThanOrEqual(0);
    expect(validSave(state)).toBe(true);
  });

  it('pays fuel and work for cooked meat and learns only the witnessed recipes', () => {
    const { state, city, faction, add } = town(4, [
      'V_04',
      'V_05',
      'O_01',
      'O_04',
      'O_02',
      'O_05',
      'O_07',
    ]);
    add('storage');
    add('depot');
    add('campfire');
    city.resources.wood = 12;
    const carcass = node(state, 'deer', 10, 50, 50, 0);
    season(state);
    expect(faction.craftCycles?.V_07).toBeGreaterThanOrEqual(5);
    expect(faction.words).toContain('V_07');
    expect(faction.words).toContain('V_12');
    expect(faction.words).not.toContain('O_10');
    expect(faction.words).not.toContain('M_04');
    expect(city.resources.wood).toBeLessThan(10); // Two real fire upkeep, then cooking.
    const cooked = faction.craftCycles!.V_07;
    const nutrition =
      carcass.amount * 40 +
      city.resources.meat * 40 +
      city.resources.cooked * 60 +
      city.seasonFoodConsumed!;
    expect(nutrition).toBeCloseTo(400 + cooked * 20);
  });

  it('does not reuse the herd workers for simultaneous foraging or resource extraction', () => {
    const { state, city, add } = town(2);
    add('storage');
    add('depot');
    add('pen', 1);
    const berries = node(state, 'berries', 50);
    const tree = node(state, 'tree', 50, 55, 50);
    season(state);
    expect(berries.amount).toBe(50);
    expect(tree.amount).toBe(50);
    expect(city.resources.wood).toBe(0);
    expect(city.resources.meat).toBeCloseTo(20 - 144 / 40);
  });

  it('reserves vegetables through actual spoilage and pays winter herd upkeep from them', () => {
    const { state, city, add } = town(4);
    add('storage');
    add('depot');
    const pen = add('pen', 1);
    node(state, 'berries', 100);
    for (let index = 0; index < 4; index++) season(state);
    expect(pen.active).toBe(true);
    expect(pen.hp).toBe(200);
    expect(cityPopulation(city)).toBe(4);
    expect(city.resources.food).toBeGreaterThanOrEqual(0);
    expect(state.entities[0].amount).toBeLessThan(100);
  });

  it.each([false, true])(
    'charges outside-sector round trips and real load size, Conservare=%s',
    (conserve) => {
      const { state, city } = town(1, ['V_04', 'O_01', ...(conserve ? ['V_05'] : [])]);
      const berries = node(state, 'berries', 10, 130, 50);
      season(state);
      // Ninety worker-seconds: 40s per round trip and 2s per collected unit.
      expect(10 - berries.amount).toBe(conserve ? 5 : 2);
      expect(berries.amount + city.resources.food + city.seasonFoodConsumed! / 25).toBeCloseTo(10);
    },
  );

  it('does not forage inside the player home sector or another culture territory', () => {
    const { state, city } = town(1);
    Object.assign(city, { x: 150, y: 250, sectorX: 1, sectorY: 2 });
    const playerFood = node(state, 'berries', 10, 230, 250);
    const otherFood = node(state, 'berries', 10, 70, 250);
    const other = structuredClone(city);
    Object.assign(other, {
      id: 'other-town',
      factionId: 'another-culture',
      x: 50,
      sectorX: 0,
      cohorts: { workers: 0, warriors: 0, sages: 0, slaves: 0 },
    });
    state.cities.push(other);
    season(state);
    expect(playerFood.amount).toBe(10);
    expect(otherFood.amount).toBe(10);
    expect(city.seasonFoodConsumed).toBe(0);
  });
});

describe('untouched foreign societies in an isolated multiyear study', () => {
  it.each(['seed-zero', 'random'] as const)(
    'keeps all four starting communities economically viable through twenty real seasons, %s',
    (mapMode) => {
      const state = createGame(6842, 'guided', mapMode);
      // Remove the player actors, whose opening is tested separately. Only the
      // player's era schedule is controlled; foreign resources, people, words,
      // buildings, random rolls and map nodes remain their actual initial values.
      state.units = [];
      for (let step = 1; step <= 1800 * 4; step++) {
        state.time = step / 4;
        state.tier = state.time >= 1800 ? 4 : state.time >= 720 ? 3 : 0;
        updateForeignPolicy(state, 0.25);
        updateImperial(state, 0.25);
        if (step % 360 === 0) {
          seasonalCore(state);
          seasonalImperial(state);
        }
      }
      expect(state.cities).toHaveLength(4);
      expect(state.cities.every((city) => cityPopulation(city) >= 8)).toBe(true);
      expect(state.cities.every((city) => city.cohorts.workers >= 4)).toBe(true);
      expect(state.factions.every((faction) => faction.words.includes('V_10'))).toBe(true);
      expect(
        state.factions.every(
          (faction) => !faction.words.includes('O_10') && !faction.words.includes('M_04'),
        ),
      ).toBe(true);
      expect(state.buildings.some((building) => building.kind === 'pen')).toBe(true);
      expect(state.entities.some((entity) => entity.kind === 'deer' && entity.domesticated)).toBe(
        true,
      );
      expect(state.battalions).toEqual([]); // No war is manufactured by the study.
    },
    30_000,
  );
});
