import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, emptyInventory, INNATE_WORDS } from './content';
import { createGame } from './engine';
import { seasonalImperial } from './imperial';
import { getSeasonReadiness } from './seasonReadiness';
import { getSurvivalAdvice } from './survivalAdvice';
import { getDogmaEffects, forbiddenByDogma, updateDogmasSeason } from './dogmas';
import type { BuildingKind, Dogma, GameState } from './types';

const vegetarian: Dogma = {
  id: 'vegetarian',
  targetId: 'O_04',
  vectorId: 'M_01',
  name: 'Vegetariani',
  description: '',
  weight: 1,
  age: 0,
};

/** Prepared cohorts isolate finite work, travel and inventory accounting.
 * They do not stand for an ordinary campaign reaching the coast. */
function fishingTown(words: string[] = []) {
  const state = createGame(42, 'classic', 'random', 1000);
  state.units = [];
  state.entities = [];
  state.buildings = [];
  state.cities = state.cities.slice(0, 1);
  state.factions = state.factions.slice(0, 1);
  for (const sector of state.sectors) sector.biome = 'plain';
  const city = state.cities[0],
    faction = state.factions[0];
  Object.assign(city, {
    ...state.home,
    sectorX: 5,
    sectorY: 5,
    housing: 20,
    cohorts: { workers: 1, warriors: 19, sages: 0, slaves: 0 },
    resources: emptyInventory(),
    production: emptyInventory(),
    buildingIds: [],
    dogmas: [],
  });
  // Avoid unrelated culture construction and reserve targets in the work-budget scene.
  delete faction.culture;
  city.words = [...INNATE_WORDS, 'V_04', 'O_04', ...words];
  faction.words = [...city.words];
  faction.dogmas = [];
  const bank = {
    id: 'finite-bank',
    kind: 'fishery' as const,
    ...state.home,
    hp: 1,
    maxHp: 1,
    amount: 50,
    maxAmount: 50,
  };
  state.entities.push(bank);
  function add(kind: BuildingKind) {
    const building = {
      id: `${kind}-${state.buildings.length}`,
      kind,
      ...state.home,
      hp: BUILDING_SPECS[kind].maxHp,
      active: true,
      completed: true,
      workerIds: [],
      cityId: city.id,
    };
    state.buildings.push(building);
    city.buildingIds.push(building.id);
    return building;
  }
  function season() {
    state.time = 90;
    state.seasonIndex = 1;
    seasonalImperial(state);
  }
  return { state, city, faction, bank, add, season };
}

function village() {
  const state = createGame(6842, 'classic', 'random', 1000);
  state.started = true;
  state.cities = [];
  state.factions = [];
  state.buildings = [];
  state.entities = [];
  state.units = state.units.slice(0, 1);
  state.resources = emptyInventory();
  state.units[0].hunger = 95;
  state.units[0].temp = 100;
  return state;
}

describe('coastal food uses finite stocks and shared real work', () => {
  it.each([
    [[], 15],
    [['V_05'], 36],
    [['V_05', 'O_13'], 36],
  ] as [string[], number][])('pays six seconds per load with knowledge %j', (words, caught) => {
    const { state, city, bank, season } = fishingTown(words);
    season();
    expect(50 - bank.amount).toBe(caught);
    expect(bank.amount + city.resources.fish + city.seasonFoodConsumed! / 40).toBeCloseTo(50);
    expect(city.resources.seed).toBe(0);
    expect(city.resources.pelt).toBe(0);
    expect(state.stats.hunts).toBe(0);
  });

  it.each([
    [[], 5],
    [['V_05'], 15],
    [['O_13'], 25],
  ] as [string[], number][])(
    'pays a real round trip for every load with knowledge %j',
    (words, caught) => {
      const { city, bank, season } = fishingTown(words);
      bank.x += 20;
      season();
      expect(50 - bank.amount).toBe(caught);
      expect(bank.amount + city.resources.fish + city.seasonFoodConsumed! / 40).toBeCloseTo(50);
    },
  );

  it('never catches more than the actual remaining bank or creates a second food inventory', () => {
    const { city, bank, season } = fishingTown(['V_05']);
    bank.amount = 2.5;
    season();
    expect(bank.amount).toBe(0);
    expect(city.resources.fish + city.seasonFoodConsumed! / 40).toBeCloseTo(2.5);
    expect(city.resources.meat).toBe(0);
    expect(city.resources.cooked).toBe(0);
  });

  it('does not activate fishing or seafood cooking in a legacy world', () => {
    const { state, city, bank, add, season } = fishingTown();
    delete state.mapGeneration!.coastalRules;
    add('campfire');
    city.resources.wood = 20;
    city.resources.fish = 5;
    season();
    expect(bank.amount).toBe(50);
    expect(city.resources.cookedFish).toBe(0);
    expect(city.resources.cooked).toBe(0);
  });

  it('cooks caught fish using paid fish, fuel and unoccupied work', () => {
    const { city, faction, bank, add, season } = fishingTown(['V_05']);
    city.cohorts.workers = 4;
    city.cohorts.warriors = 0;
    add('storage');
    add('campfire');
    city.resources.wood = 12;
    const initial = bank.amount;
    season();
    const cooked = faction.craftCycles?.V_07 ?? 0;
    expect(city.resources.wood).toBeCloseTo(
      (12 - BUILDING_SPECS.campfire.upkeep.wood!) * 0.95 - cooked,
    );
    expect(cooked).toBeGreaterThan(0);
    expect(
      bank.amount * 40 +
        city.resources.fish * 40 +
        city.resources.cookedFish * 60 +
        city.seasonFoodConsumed!,
    ).toBeCloseTo(initial * 40 + cooked * 20);
    expect(city.resources.cooked).toBe(0);
    expect(city.resources.meat).toBe(0);
  });

  it('leaves the bank untouched when no unassigned workers can fish', () => {
    const { city, bank, season } = fishingTown();
    city.cohorts.workers = 0;
    season();
    expect(bank.amount).toBe(50);
    expect(city.resources.fish).toBe(0);
    expect(city.resources.cookedFish).toBe(0);
  });

  it('does not fish or consume animal food under sacred vegetarianism', () => {
    const { city, faction, bank, season } = fishingTown();
    city.dogmas = [structuredClone(vegetarian)];
    faction.dogmas = [...city.dogmas];
    city.resources.cookedFish = 20;
    season();
    expect(bank.amount).toBe(50);
    expect(city.seasonFoodConsumed).toBe(0);
    expect(city.resources.cookedFish).toBe(15); // Physical seasonal spoilage still applies.
  });
});

describe('seafood advice, restrictions and readiness', () => {
  it('returns paid fish and a real carried load once when a cook is sacrificed', () => {
    const state = village();
    const cook = state.units[0];
    Object.assign(cook, {
      action: 'cooking',
      command: ['S_01', 'V_07', 'O_04', 'O_05'],
      intelligence: 8,
      cookInput: 'fish',
      craftNeedsPayment: false,
      carry: { resource: 'fish', amount: 3 },
    });
    state.buildings = [
      { id: 'fire', kind: 'campfire', ...state.home, hp: 100, active: true, completed: true },
    ];
    state.dogmas = [{ ...vegetarian, targetId: 'S_04', vectorId: 'O_05' }];
    updateDogmasSeason(state);
    expect(cook.hp).toBe(0);
    const physicalFish = () =>
      state.entities
        .filter((entity) => entity.kind === 'ground' && entity.resource === 'fish')
        .reduce((sum, entity) => sum + entity.amount, 0);
    expect(physicalFish()).toBe(4);
    updateDogmasSeason(state);
    expect(physicalFish()).toBe(4);
    expect(state.resources.meat).toBe(0);
    expect(state.resources.cooked).toBe(0);
  });

  it('counts cooked fish as safe nutrition after spoilage and reports raw fish separately', () => {
    const state = village();
    state.resources.fish = 10;
    state.resources.cookedFish = 4;
    const before = structuredClone(state.resources);
    const report = getSeasonReadiness(state);
    expect(report.rawFish).toBe(10);
    expect(report.rawMeat).toBe(0);
    expect(report.food[0].rawFish).toBe(4);
    expect(report.food[0].safeNutrition).toBe(3 * 60);
    expect(state.resources).toEqual(before);
  });

  it('does not count fish or cooked fish for a vegetarian and never suggests the living bank as a meal', () => {
    const state = village();
    state.resources.fish = 20;
    state.resources.cookedFish = 20;
    state.dogmas = [structuredClone(vegetarian)];
    state.entities = [{ id: 'bank', kind: 'fishery', ...state.home, hp: 1, maxHp: 1, amount: 50 }];
    expect(getDogmaEffects(state).vegetarian).toBe(true);
    expect(getSeasonReadiness(state).food[0].safeNutrition).toBe(0);
    expect(getSurvivalAdvice(state)?.destination).toBeUndefined();
    expect(getSurvivalAdvice(state)?.phrase).toBeUndefined();
    for (const resource of ['fish', 'cookedFish'] as const) {
      state.entities = [
        { id: resource, kind: 'ground', resource, ...state.home, hp: 0, maxHp: 1, amount: 2 },
      ];
      const target = { type: 'entity' as const, id: resource, ...state.home };
      expect(forbiddenByDogma(state, ['S_01', 'V_02', 'O_04'], target)).toContain('vegetale');
      expect(getSurvivalAdvice(state)?.destination).toBeUndefined();
    }
  });

  it('can suggest a caught pile as a real food source', () => {
    const state = village();
    state.entities = [
      {
        id: 'fish-pile',
        kind: 'ground',
        resource: 'fish',
        ...state.home,
        hp: 0,
        maxHp: 1,
        amount: 2,
      },
    ];
    expect(getSurvivalAdvice(state)?.destination?.id).toBe('fish-pile');
  });

  it('spends fish on a food sacrifice rather than granting morale without payment', () => {
    const state = village();
    state.resources.fish = 7;
    state.resources.cookedFish = 5;
    state.dogmas = [{ ...vegetarian, vectorId: 'O_05' }];
    updateDogmasSeason(state);
    expect(state.resources.fish + state.resources.cookedFish).toBe(2);
  });

  it('keeps legacy inventory readiness finite when seafood keys have not been materialized', () => {
    const state = village();
    delete (state.resources as Partial<GameState['resources']>).fish;
    delete (state.resources as Partial<GameState['resources']>).cookedFish;
    state.resources.cooked = 4;
    const report = getSeasonReadiness(state);
    expect(report.food[0].safeNutrition).toBe(180);
    expect(report.rawFish).toBe(0);
  });
});
