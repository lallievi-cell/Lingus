import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, emptyInventory, WORD_ORDER } from './content';
import { createGame, issueCommand, solveSpark } from './engine';
import { allocateCityWorkers, handleImperialCommand, seasonalImperial } from './imperial';
import { validSave } from './saveValidation';
import type { BuildingKind, City, GameState } from './types';

/** Prepared cities isolate production and discovery; they do not prove a seven-person campaign. */
function fixture() {
  const state = createGame(6842),
    template = state.units[0];
  Object.assign(state, {
    started: true,
    paused: false,
    time: 90,
    tier: 5,
    urbanized: true,
    entities: [],
    buildings: [],
    factions: [],
    caravans: [],
  });
  state.resources = { ...emptyInventory(), food: 1000, ore: 60, wood: 100, ingot: 60, coin: 100 };
  const city: City = {
    id: 'capital',
    name: 'La Capitale',
    x: 250,
    y: 250,
    sectorX: 2,
    sectorY: 2,
    factionId: 'player',
    cohorts: { workers: 4, warriors: 0, sages: 4, slaves: 0 },
    resources: state.resources,
    words: [...WORD_ORDER],
    dogmas: [],
    revoltTension: 0,
    housing: 8,
    buildingIds: [],
    vocations: [],
    loyalty: 100,
    assimilation: { delegateCount: 0, active: false },
    production: emptyInventory(),
    capital: true,
  };
  state.cities = [city];
  state.units = Array.from({ length: 8 }, (_, index) => ({
    ...structuredClone(template),
    id: `resident-${index}`,
    name: `Residente ${index}`,
    hp: 100,
    age: 6,
    hunger: 20,
    strength: 5,
    intelligence: index < 4 ? 5 : 9,
    caste: index < 4 ? ('citizen' as const) : ('sage' as const),
    cityId: city.id,
    eventMemory: [],
    tension: {},
    cooldowns: {},
    action: 'idle',
    command: undefined,
    knows: [...WORD_ORDER],
  }));
  state.words = Object.fromEntries(
    WORD_ORDER.map((id) => [
      id,
      {
        retention: 100,
        custodians: state.units.map((u) => u.id),
        uses: 0,
      },
    ]),
  );
  for (const id of ['S_08', 'O_12', 'O_13', 'O_14', 'V_14']) {
    delete state.words[id];
    for (const unit of state.units) unit.knows = unit.knows.filter((word) => word !== id);
  }
  const addBuilding = (kind: BuildingKind) => {
    const building = {
      id: `${kind}-${state.buildings.length}`,
      kind,
      x: city.x,
      y: city.y,
      cityId: city.id,
      hp: BUILDING_SPECS[kind].maxHp,
      active: true,
      completed: true,
      workerIds: [] as string[],
    };
    state.buildings.push(building);
    city.buildingIds.push(building.id);
    return state.buildings[state.buildings.length - 1];
  };
  addBuilding('depot');
  return { state, city, addBuilding };
}
function season(state: GameState) {
  state.time += 90;
  seasonalImperial(state);
}

describe('urban production keeps real cognitive producers after condensation', () => {
  it('selects an existing foundry through public orders, spends ingots and creates an army spark from actual arms', () => {
    const { state, addBuilding, city } = fixture(),
      foundry = addBuilding('foundry');
    state.traditions = [
      {
        id: 'watch',
        tokens: ['C_02', 'S_03', 'V_05', 'O_01'],
        name: 'Guardia',
        createdAt: 0,
      },
    ];
    const target = { type: 'city' as const, id: city.id, x: city.x, y: city.y };
    const ordered = issueCommand(state, ['S_09', 'V_12', 'O_07', 'V_03'], target);
    expect(ordered.stats.commands).toBe(state.stats.commands + 1);
    expect(ordered.buildings).toHaveLength(state.buildings.length);
    expect(ordered.buildings.find((b) => b.id === foundry.id)?.productionMode).toBe('metalArms');
    const ingots = ordered.resources.ingot,
      ore = ordered.resources.ore,
      wood = ordered.resources.wood;
    season(ordered);
    expect(ordered.resources.metalArms).toBe(18);
    expect(ordered.resources.ingot).toBe(ingots - 18);
    expect(ordered.resources.ore).toBe(ore);
    expect(ordered.resources.wood).toBe(wood);
    season(ordered);
    const spark = ordered.sparks.find((entry) => entry.wordId === 'S_08');
    expect(spark).toBeDefined();
    expect(foundry.workerIds).toEqual([]); // issueCommand returned a copy.
    expect(ordered.buildings.find((b) => b.id === foundry.id)?.workerIds).toContain(spark!.unitId);
    const solved = solveSpark(ordered, spark!.id, spark!.recipe);
    expect(solved.words.S_08.retention).toBe(50);
    expect(validSave(solved)).toBe(true);
  });

  it('mints one hundred coins per ingot and lets the actual smith discover money', () => {
    const { state, addBuilding, city } = fixture(),
      foundry = addBuilding('foundry');
    state.resources.ingot = 5;
    const result = handleImperialCommand(state, ['S_09', 'V_12', 'O_07', 'O_08'], {
      type: 'city',
      id: city.id,
      x: city.x,
      y: city.y,
    });
    expect(result.valid).toBe(true);
    expect(foundry.productionMode).toBe('coin');
    const before = state.resources.coin;
    season(state);
    expect(state.resources.ingot).toBe(0);
    expect(state.resources.coin).toBe(before + 500);
    expect(city.production.coin).toBe(500);
    // Five completed cycles are shared among the finite actual smiths.
    expect(state.units.reduce((n, u) => n + (u.tension?.O_12 ?? 0), 0)).toBe(100);
    state.resources.ingot = 15;
    season(state);
    expect(state.sparks.some((spark) => spark.wordId === 'O_12')).toBe(true);
  });

  it('pays a province’s local ingots into the shared imperial currency, without touching capital ingots', () => {
    const { state, city, addBuilding } = fixture(),
      foundry = addBuilding('foundry');
    city.capital = false;
    city.resources = { ...emptyInventory(), ingot: 3 };
    state.cities.unshift({
      ...structuredClone(city),
      id: 'imperial-capital',
      capital: true,
      cohorts: { workers: 0, warriors: 0, sages: 0, slaves: 0 },
      buildingIds: [],
      resources: state.resources,
    });
    foundry.productionMode = 'coin';
    const capitalIngots = state.resources.ingot,
      money = state.resources.coin;
    season(state);
    expect(city.resources.ingot).toBe(0);
    expect(state.resources.ingot).toBe(capitalIngots);
    expect(state.resources.coin).toBe(money + 300);
    expect(city.resources.coin).toBe(0);
  });

  it('gives archive copy experience to actual resident scribes and preserves both late-game discoveries', () => {
    const { state, addBuilding } = fixture(),
      archive = addBuilding('archive');
    season(state);
    expect(archive.workerIds).toHaveLength(4);
    for (const id of ['O_14', 'V_14']) {
      const spark = state.sparks.find((entry) => entry.wordId === id);
      expect(spark).toBeDefined();
      expect(archive.workerIds).toContain(spark!.unitId);
    }
    expect(state.words.O_09.support).toBe(1);
  });

  it('does not invent workers, duplicate their slots or grant experience without productive inputs', () => {
    const { state, city, addBuilding } = fixture(),
      first = addBuilding('foundry'),
      second = addBuilding('foundry');
    first.productionMode = 'metalArms';
    second.productionMode = 'metalArms';
    state.resources.ingot = 0;
    allocateCityWorkers(state, city);
    expect(first.workerIds).toHaveLength(4);
    expect(second.workerIds).toHaveLength(0);
    expect(second.lastEfficiency).toBe(0);
    season(state);
    expect(state.resources.metalArms).toBe(0);
    expect(state.units.every((unit) => Object.keys(unit.tension ?? {}).length === 0)).toBe(true);
    state.resources.ingot = 4;
    state.resources.wood = 500;
    state.resources.ore = 0;
    season(state);
    expect(state.resources.ingot).toBe(4);
    expect(state.resources.metalArms).toBe(0);
    state.units = [];
    state.resources.wood = 100;
    state.resources.ingot = 5;
    season(state);
    expect(state.resources.metalArms).toBe(5);
    expect(state.sparks).toHaveLength(0);
  });

  it('requires a real foundry, restores legacy refining and validates the additive mode', () => {
    const { state, city, addBuilding } = fixture(),
      target = {
        type: 'city' as const,
        id: city.id,
        x: city.x,
        y: city.y,
      };
    expect(handleImperialCommand(state, ['S_09', 'V_12', 'O_07', 'V_03'], target).valid).toBe(
      false,
    );
    const foundry = addBuilding('foundry');
    foundry.productionMode = 'coin';
    expect(handleImperialCommand(state, ['S_09', 'V_12', 'O_07'], target).valid).toBe(true);
    expect(foundry.productionMode).toBe('ingot');
    const before = state.resources.ingot;
    season(state);
    expect(state.resources.ingot).toBe(before + 18);
    expect(validSave(state)).toBe(true);
    (foundry as unknown as { productionMode: string }).productionMode = 'free-weapons';
    expect(validSave(state)).toBe(false);
  });

  it('keeps explicit citizen identities in their counted worker cohort despite high inherited attributes', () => {
    const { state, city, addBuilding } = fixture(),
      foundry = addBuilding('foundry');
    for (const unit of state.units.slice(0, 4)) {
      unit.intelligence = 9;
      unit.strength = 9;
    }
    allocateCityWorkers(state, city);
    expect(foundry.workerIds).toEqual(state.units.slice(0, 4).map((unit) => unit.id));
    expect(foundry.lastEfficiency).toBe(1);
  });

  it('keeps represented newborns in the population without making them immediate smiths', () => {
    const { state, city, addBuilding } = fixture(),
      foundry = addBuilding('foundry');
    state.units = state.units.slice(0, 2);
    for (const child of state.units) child.age = 0;
    city.cohorts = { workers: 2, warriors: 0, sages: 0, slaves: 0 };
    city.housing = 2;
    foundry.productionMode = 'metalArms';
    const ingots = state.resources.ingot;
    season(state);
    expect(city.cohorts.workers).toBe(2);
    expect(foundry.lastEfficiency).toBe(0);
    expect(foundry.workerIds).toEqual([]);
    expect(state.resources.ingot).toBe(ingots);
    expect(state.resources.metalArms).toBe(0);

    // Once these same counted people reach working age, their slots become real.
    for (const child of state.units) child.age = 4;
    season(state);
    expect(city.cohorts.workers).toBe(2);
    expect(foundry.lastEfficiency).toBe(0.5);
    expect(foundry.workerIds).toEqual(state.units.map((unit) => unit.id));
    expect(state.resources.metalArms).toBe(9);
    expect(state.resources.ingot).toBe(ingots - 9);
  });

  it('excludes represented children from extraction while retaining anonymous adult workers', () => {
    const { state, city } = fixture();
    state.units = state.units.slice(0, 2);
    for (const child of state.units) child.age = 0;
    city.cohorts = { workers: 2, warriors: 0, sages: 0, slaves: 0 };
    city.housing = 3;
    state.resources.wood = 0;
    state.entities = [
      { id: 'local-tree', kind: 'tree', x: 255, y: 250, hp: 40, maxHp: 40, amount: 10 },
    ];
    season(state);
    expect(state.resources.wood).toBe(0);
    expect(state.entities[0].amount).toBe(10);
    expect(city.cohorts.workers).toBe(2);

    city.cohorts.workers++;
    season(state);
    expect(state.resources.wood).toBe(10);
    expect(state.entities[0].amount).toBe(0);
    expect(city.cohorts.workers).toBe(3);
  });
});
