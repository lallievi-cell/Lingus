import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, emptyInventory, INNATE_WORDS } from './content';
import { createGame, issueCommand, tick } from './engine';
import { seasonalImperial } from './imperial';
import { seasonalCore } from './simulation';
import type { Building, BuildingKind, City, GameState, Sector } from './types';

/** Prepared districts isolate earned work, fertility and finite transport.
 * They are not evidence of an ordinary campaign's progression. */
function district(biome: Sector['biome'], enabled = true) {
  const state = createGame(42, 'classic', 'random', 1000);
  Object.assign(state, {
    started: true,
    time: 180,
    seasonIndex: 2,
    tier: 3,
    entities: [],
    buildings: [],
    resources: emptyInventory(),
  });
  // A controlled home district and no natural food prevent accidental foraging
  // from masquerading as agricultural output.
  for (const sector of state.sectors) sector.biome = 'plain';
  state.sectors.find((sector) => sector.x === 5 && sector.y === 5)!.biome = biome;
  if (!enabled) delete state.mapGeneration!.biomeRules;
  return state;
}

function addBuilding(state: GameState, kind: BuildingKind, city?: City): Building {
  const building: Building = {
    id: `prepared-${kind}-${state.buildings.length}`,
    kind,
    x: city?.x ?? state.home.x,
    y: city?.y ?? state.home.y,
    hp: BUILDING_SPECS[kind].maxHp,
    active: true,
    completed: true,
    cityId: city?.id,
    workerIds: [],
  };
  state.buildings.push(building);
  city?.buildingIds.push(building.id);
  return building;
}

function village(biome: Sector['biome'], enabled = true) {
  const state = district(biome, enabled);
  state.cities = [];
  state.factions = [];
  state.units = state.units.slice(0, 3);
  for (const unit of state.units)
    Object.assign(unit, {
      ...state.home,
      age: 6,
      hp: 100,
      hunger: 0,
      temp: 100,
      strength: 5,
      intelligence: 5,
      action: 'idle',
      progress: 0,
    });
  for (const id of ['V_09', 'O_04', 'O_01']) {
    state.words[id] = { retention: 100, custodians: state.units.map((unit) => unit.id), uses: 0 };
    for (const unit of state.units) if (!unit.knows.includes(id)) unit.knows.push(id);
  }
  const farm = addBuilding(state, 'farm');
  addBuilding(state, 'storage');
  state.resources.seed = 10;
  return { state, farm };
}

function workedVillage(biome: Sector['biome'], enabled = true) {
  const scene = village(biome, enabled);
  let state = issueCommand(scene.state, ['S_01', 'V_09', 'O_04'], {
    type: 'building',
    id: scene.farm.id,
    x: scene.farm.x,
    y: scene.farm.y,
  });
  // Let the real public order earn half an ordinary shift. Settlement then
  // closes this actual work ledger at the end of autumn.
  for (let frame = 0; frame < 120; frame++) state = tick(state, 0.25);
  const farm = state.buildings.find((building) => building.kind === 'farm')!;
  expect(farm.seasonWork?.[2]?.efficiencySeconds).toBeGreaterThan(29);
  expect(Object.keys(farm.seasonWork?.[2]?.workerSeconds ?? {})).toHaveLength(3);
  state.time = 270;
  state.seasonIndex = 3;
  seasonalCore(state);
  return state;
}

const fertility = [
  ['plain', 1],
  ['forest', 0.85],
  ['mountain', 0.55],
  ['river', 1.15],
  ['wetland', 1.25],
  ['dryland', 0.65],
] as const;

describe('biome fertility pays only earned agricultural work', () => {
  it('scales the same real village shift without changing its work attribution', () => {
    const baseline = workedVillage('plain');
    const ordinary = baseline.resources.food;
    expect(ordinary).toBeGreaterThan(24);
    expect(ordinary).toBeLessThanOrEqual(25);
    for (const [biome, multiplier] of fertility) {
      const state = workedVillage(biome);
      expect(state.resources.food, biome).toBeCloseTo(ordinary * multiplier);
      const worker = state.units[0];
      expect(state.eventTimes[`legal-work:2:${worker.id}:V_09:O_04`], biome).toBeCloseTo(
        state.resources.food / 3,
      );
    }
  });

  it('does not grant a harvest to an unstaffed fertile field', () => {
    const { state } = village('wetland');
    state.time = 270;
    state.seasonIndex = 3;
    seasonalCore(state);
    expect(state.resources.food).toBe(0);
    expect(state.buildings.find((building) => building.kind === 'farm')?.lastEfficiency).toBe(0);
  });

  it('preserves the old village harvest when the saved biome marker is absent', () => {
    expect(workedVillage('forest', false).resources.food).toBeCloseTo(
      workedVillage('plain', false).resources.food,
    );
    expect(workedVillage('mountain', false).resources.food).toBeCloseTo(
      workedVillage('plain', false).resources.food,
    );
  });

  it.each(fertility)(
    'uses the same fertility for a staffed urban field in %s',
    (biome, multiplier) => {
      const state = district(biome);
      state.units = [];
      state.factions = [];
      const city = state.cities[0];
      Object.assign(city, {
        ...state.home,
        sectorX: 5,
        sectorY: 5,
        factionId: 'player',
        capital: false,
        cohorts: { workers: 3, warriors: 0, sages: 0, slaves: 0 },
        housing: 3,
        resources: emptyInventory(),
        production: emptyInventory(),
        buildingIds: [],
        vocations: [],
      });
      state.cities = [city];
      const farm = addBuilding(state, 'farm', city);
      addBuilding(state, 'storage', city);
      state.time = 270;
      state.seasonIndex = 3;
      seasonalImperial(state);
      expect(farm.lastEfficiency).toBe(1);
      expect(city.production.food).toBeCloseTo(50 * multiplier);
      // Rations come out of the real harvest, not a separate grant.
      expect(city.resources.food + (city.seasonFoodConsumed ?? 0) / 25).toBeCloseTo(
        50 * multiplier,
      );
    },
  );
});

function foodTrip(biome: 'plain' | 'mountain', enabled = true) {
  const state = district('plain', enabled);
  state.units = [];
  for (const sector of state.sectors) sector.biome = biome;
  const city = state.cities[0],
    faction = state.factions[0];
  Object.assign(city, {
    x: 50,
    y: 50,
    sectorX: 0,
    sectorY: 0,
    cohorts: { workers: 1, warriors: 0, sages: 0, slaves: 0 },
    housing: 1,
    resources: emptyInventory(),
    production: emptyInventory(),
    buildingIds: [],
    vocations: [],
    words: [...INNATE_WORDS, 'V_04', 'O_04'],
  });
  faction.culture = 'forest';
  faction.words = [...city.words];
  state.cities = [city];
  state.factions = [faction];
  const berries = {
    id: 'finite-remote-food',
    kind: 'berries' as const,
    x: 130,
    y: 50,
    hp: 1,
    maxHp: 1,
    amount: 10,
    maxAmount: 10,
  };
  state.entities = [berries];
  state.time = 90;
  state.seasonIndex = 1;
  seasonalImperial(state);
  return { state, city, berries };
}

describe('regional food collection pays the same terrain effort as travel', () => {
  it('plans extra real forage when a mountain field cannot cover the community meal', () => {
    const scenes = (['plain', 'mountain'] as const).map((biome) => {
      const state = district(biome);
      state.units = [];
      const city = state.cities[0],
        faction = state.factions[0];
      Object.assign(city, {
        ...state.home,
        sectorX: 5,
        sectorY: 5,
        cohorts: { workers: 12, warriors: 0, sages: 0, slaves: 0 },
        housing: 12,
        resources: { ...emptyInventory(), seed: 3 },
        production: emptyInventory(),
        buildingIds: [],
        vocations: [],
        words: [...INNATE_WORDS, 'V_04', 'V_09', 'O_04', 'O_01'],
      });
      faction.culture = 'forest';
      faction.words = [...city.words];
      state.cities = [city];
      state.factions = [faction];
      addBuilding(state, 'farm', city);
      addBuilding(state, 'storage', city);
      const berries = {
        id: 'finite-local-food',
        kind: 'berries' as const,
        x: city.x + 8,
        y: city.y,
        hp: 1,
        maxHp: 1,
        amount: 100,
        maxAmount: 100,
      };
      state.entities = [berries];
      state.time = 270;
      state.seasonIndex = 3;
      seasonalImperial(state);
      return { state, city, berries };
    });
    const [plain, mountain] = scenes;
    expect(100 - plain.berries.amount).toBe(0);
    expect(100 - mountain.berries.amount).toBe(8);
    for (const [index, scene] of scenes.entries()) {
      expect(scene.state.buildings.filter((building) => building.kind === 'farm')).toHaveLength(1);
      expect(scene.city.cohorts.workers).toBe(12);
      expect(scene.city.seasonFoodConsumed).toBe(12 * 72);
      const harvested = index === 0 ? 50 : 27.5;
      expect(
        scene.berries.amount +
          scene.city.resources.food +
          (scene.city.seasonFoodConsumed ?? 0) / 25,
      ).toBeCloseTo(100 + harvested);
      expect(scene.state.resources.food).toBe(0);
    }
  });

  it('spends finite worker time on the slower round trip and conserves every berry', () => {
    const plain = foodTrip('plain'),
      mountain = foodTrip('mountain');
    // One worker has 90 seconds. Each one-unit load costs two seconds of work
    // plus its actual 80 m outward and return route at four effort-metres/s.
    expect(10 - plain.berries.amount).toBe(2);
    expect(10 - mountain.berries.amount).toBe(1);
    for (const scene of [plain, mountain]) {
      expect(
        scene.berries.amount +
          scene.city.resources.food +
          (scene.city.seasonFoodConsumed ?? 0) / 25,
      ).toBeCloseTo(10);
      expect(scene.city.resources.food).toBeGreaterThanOrEqual(0);
      expect(scene.state.resources.food).toBe(0);
    }
  });

  it('keeps the previous foreign trip budget for saves without biome rules', () => {
    const plain = foodTrip('plain', false),
      mountain = foodTrip('mountain', false);
    expect(mountain.berries.amount).toBe(plain.berries.amount);
    expect(mountain.city.seasonFoodConsumed).toBe(plain.city.seasonFoodConsumed);
  });
});
