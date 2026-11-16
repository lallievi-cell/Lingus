import { describe, expect, it } from 'vitest';
import { createCoastGeometry, isSeaPoint } from './coastGeometry';
import {
  BUILDING_SPECS,
  emptyInventory,
  RESOURCE_ORDER,
  RESOURCE_SPECS,
  WORD_ORDER,
} from './content';
import { canFitCraftOutput, canPayLocally, payLocally } from './craftMaterials';
import { chooseDelegateIdentity } from './delegateIdentity';
import { createGame, issueCommand } from './engine';
import { refundPaidCooking } from './fishing';
import { allocateCityWorkers, condenseCities, playerPopulation } from './imperial';
import { isDryLandPoint, planLandRoute } from './landNavigation';
import { depositResourceAt, hasHomeLandAccess } from './maritimeInventory';
import { freeCapacity } from './runtime';
import { createBuilding, processWork, seasonalCore, simulationStep, tryIgnite } from './simulation';
import { gatheringEquipmentFor } from './unitEquipment';
import type { City, GameState, Resource, Unit } from './types';

/** These prepared expeditions exercise real island geometry and work/payment
 * code; reaching the shore by boat is covered by maritimeGameplay. */
function expedition() {
  const state = createGame(123, 'classic', 'random', 1000);
  state.started = true;
  state.paused = false;
  state.tier = 5;
  state.resources = emptyInventory();
  state.entities = [];
  state.buildings = [];
  state.cities = [];
  state.factions = [];
  state.caravans = [];
  state.battalions = [];
  state.units = state.units.slice(0, 1);
  const island = createCoastGeometry(state)!.islands![0];
  const point = {
    x: island.points.reduce((sum, vertex) => sum + vertex.x, 0) / island.points.length,
    y: island.points.reduce((sum, vertex) => sum + vertex.y, 0) / island.points.length,
  };
  Object.assign(state.units[0], point, {
    age: 8,
    hp: 100,
    hunger: 0,
    temp: 100,
    action: 'idle',
    strength: 5,
    intelligence: 5,
  });
  for (const id of WORD_ORDER) {
    state.words[id] = { retention: 100, uses: 0, custodians: [state.units[0].id] };
    state.units[0].knows = [...WORD_ORDER];
  }
  for (const sector of state.sectors) sector.explored = true;
  expect(isDryLandPoint(state, point)).toBe(true);
  expect(planLandRoute(state, point, state.home)).toBeNull();
  return state;
}

function pile(state: GameState, resource: Resource, amount: number, point = state.units[0]) {
  const entity = {
    id: `supply-${state.entities.length}`,
    kind: 'ground' as const,
    x: point.x,
    y: point.y,
    resource,
    amount,
    maxAmount: amount,
    hp: 0,
    maxHp: 1,
  };
  state.entities.push(entity);
  return entity;
}

function groundAmount(state: GameState, resource: Resource) {
  return state.entities
    .filter((entity) => entity.kind === 'ground' && entity.resource === resource)
    .reduce((sum, entity) => sum + entity.amount, 0);
}

function work(state: GameState, unit: Unit, seconds = 5.25) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.25) {
    state.time += 0.25;
    processWork(state, unit, 0.25);
  }
}

function capital(state: GameState): City {
  const city: City = {
    id: 'capital',
    name: 'Capitale',
    ...state.home,
    sectorX: 5,
    sectorY: 5,
    factionId: 'player',
    cohorts: { workers: 0, warriors: 0, sages: 0, slaves: 0 },
    resources: state.resources,
    words: [...WORD_ORDER],
    dogmas: [],
    revoltTension: 0,
    housing: 200,
    buildingIds: [],
    vocations: [],
    loyalty: 100,
    assimilation: { delegateCount: 0, active: false },
    production: emptyInventory(),
    capital: true,
    garrisonHp: 0,
  };
  state.cities = [city];
  return city;
}

describe('physical maritime supplies', () => {
  it('rejects remote camp payment and uses only the actual island inputs', () => {
    const state = expedition();
    const worker = state.units[0];
    state.resources.wood = 100;
    state.resources.stone = 100;
    expect(hasHomeLandAccess(state, worker)).toBe(false);
    expect(canPayLocally(state, { wood: 2, stone: 1 }, worker)).toBe(false);
    const wood = pile(state, 'wood', 2);
    const stone = pile(state, 'stone', 1);
    expect(canPayLocally(state, { wood: 2, stone: 1 }, worker)).toBe(true);
    payLocally(state, { wood: 2, stone: 1 }, worker);
    expect([wood.amount, stone.amount]).toEqual([0, 0]);
    expect([state.resources.wood, state.resources.stone]).toEqual([100, 100]);
  });

  it('does not treat a nearby pile across the physical shore as reachable', () => {
    const state = expedition();
    const coast = createCoastGeometry(state)!;
    const worker = state.units[0];
    const horizontal = coast.side === 'north' || coast.side === 'south';
    const direction = coast.side === 'north' || coast.side === 'west' ? -1 : 1;
    if (horizontal) worker.y += direction * 10;
    else worker.x += direction * 10;
    const wet = { ...worker };
    if (horizontal) wet.y += direction * 10;
    else wet.x += direction * 10;
    expect(isDryLandPoint(state, worker)).toBe(true);
    expect(isSeaPoint(state, wet)).toBe(true);
    pile(state, 'stone', 10, wet);
    expect(canPayLocally(state, { stone: 1 }, worker)).toBe(false);
  });

  it('keeps remote stores and carried cargo out of camp capacity', () => {
    const state = expedition();
    const worker = state.units[0];
    createBuilding(state, 'storage', worker.x, worker.y);
    createBuilding(state, 'depot', worker.x, worker.y);
    worker.carry = { resource: 'fish', amount: 5 };
    expect(freeCapacity(state, 'food')).toBe(30);
    expect(freeCapacity(state, 'wood')).toBe(30);
    createBuilding(state, 'storage', state.home.x, state.home.y);
    expect(freeCapacity(state, 'food')).toBe(200);
  });

  it('deposits all sixteen island products into recoverable physical piles', () => {
    const state = expedition();
    state.resources.wood = 30;
    const before = { ...state.resources };
    expect(RESOURCE_ORDER).toHaveLength(16);
    for (const resource of RESOURCE_ORDER) {
      expect(depositResourceAt(state, state.units[0], resource, 2)).toBe(2);
      expect(groundAmount(state, resource)).toBe(2);
    }
    expect(state.resources).toEqual(before);
    expect(canFitCraftOutput(state, { stone: 1 }, 'tool', 1, state.units[0])).toBe(true);
  });

  it('pays an island craft from stone on the ground and leaves its tool there', () => {
    let state = expedition();
    state.resources.stone = 30;
    pile(state, 'stone', 2);
    const id = state.units[0].id;
    state = issueCommand(state, ['S_02', 'V_06', 'O_02'], undefined, id);
    expect(state.units[0].action).toBe('crafting');
    expect(groundAmount(state, 'stone')).toBe(1);
    work(state, state.units[0]);
    expect(groundAmount(state, 'tool')).toBe(1);
    expect(state.resources.tool).toBe(0);
    expect(state.resources.stone).toBe(30);
  });

  it('cooks the paid island fish once and refunds an interrupted portion once', () => {
    let state = expedition();
    const worker = state.units[0];
    createBuilding(state, 'campfire', worker.x, worker.y);
    const fish = pile(state, 'fish', 2);
    state.resources.meat = 10;
    const id = worker.id;
    const tokens = ['S_02', 'V_07', 'O_04', 'O_05'];
    state = issueCommand(state, tokens, { type: 'entity', id: fish.id, x: fish.x, y: fish.y }, id);
    expect(state.units[0].action).toBe('cooking');
    expect(state.units[0].cookInput).toBe('fish');
    expect(groundAmount(state, 'fish')).toBe(1);
    work(state, state.units[0]);
    expect(groundAmount(state, 'cookedFish')).toBe(1);
    expect([state.resources.cookedFish, state.resources.cooked, state.resources.meat]).toEqual([
      0, 0, 10,
    ]);
    state = issueCommand(state, tokens, undefined, id);
    expect(groundAmount(state, 'fish')).toBe(0);
    expect(refundPaidCooking(state, state.units[0])).toBe(true);
    expect(refundPaidCooking(state, state.units[0])).toBe(false);
    expect(groundAmount(state, 'fish')).toBe(1);
  });

  it('ignites and maintains an island fire only with delivered wood', () => {
    const state = expedition();
    const worker = state.units[0];
    state.resources.wood = 100;
    expect(tryIgnite(state, worker.x, worker.y)).toBe(false);
    const wood = pile(state, 'wood', 7);
    expect(tryIgnite(state, worker.x, worker.y)).toBe(true);
    expect(wood.amount).toBe(2);
    state.time = 90;
    seasonalCore(state);
    const fire = state.buildings.find((building) => building.kind === 'campfire')!;
    expect(fire.active).toBe(true);
    expect(wood.amount).toBe(0);
    state.time = 180;
    seasonalCore(state);
    expect(fire.active).toBe(false);
    expect(fire.hp).toBe(BUILDING_SPECS.campfire.maxHp * 0.8);
    expect(state.resources.wood).toBe(100 * (1 - RESOURCE_SPECS.wood.spoil) ** 2);
  });

  it('smelts with local input and keeps the produced ingot on the island', () => {
    const state = expedition();
    const worker = state.units[0];
    const forge = createBuilding(state, 'foundry', worker.x, worker.y);
    state.resources.ore = 100;
    state.resources.wood = 100;
    pile(state, 'ore', 1);
    pile(state, 'wood', 2);
    Object.assign(worker, {
      action: 'smelting',
      command: ['S_02', 'V_12', 'O_07', 'O_05'],
      jobBuildingId: forge.id,
      targetId: forge.id,
    });
    work(state, worker, 10);
    expect(groundAmount(state, 'ingot')).toBe(1);
    expect([groundAmount(state, 'ore'), groundAmount(state, 'wood')]).toEqual([0, 0]);
    expect([state.resources.ingot, state.resources.ore, state.resources.wood]).toEqual([
      0, 100, 100,
    ]);
  });

  it('does not grant remote camp tools to an island gatherer', () => {
    const state = expedition();
    const worker = state.units[0];
    state.resources.tool = 5;
    state.entities.push({
      id: 'island-tree',
      kind: 'tree',
      x: worker.x,
      y: worker.y,
      amount: 10,
      hp: 100,
      maxHp: 100,
    });
    Object.assign(worker, {
      action: 'gathering',
      targetId: 'island-tree',
      command: ['S_02', 'V_03'],
    });
    expect(gatheringEquipmentFor(state, worker, 'wood').speed).toBe(1);
    const tool = pile(state, 'tool', 1);
    expect(gatheringEquipmentFor(state, worker, 'wood').speed).toBe(1.5);
    work(state, worker);
    expect(groundAmount(state, 'wood')).toBeGreaterThan(0);
    expect(tool.amount).toBeCloseTo(0.9);
    expect(state.resources.tool).toBe(5);
  });

  it('settles actual island farm and pen shifts into physical output', () => {
    let state = expedition();
    const farmer = state.units[0];
    const herder = { ...structuredClone(farmer), id: 'island-herder' };
    state.units.push(herder);
    const farm = createBuilding(state, 'farm', farmer.x, farmer.y);
    const pen = createBuilding(state, 'pen', herder.x, herder.y);
    pen.livestock = 1;
    state.time = 180;
    state.seasonIndex = 2;
    state = issueCommand(
      state,
      ['S_02', 'V_09', 'O_04'],
      { type: 'building', id: farm.id, x: farm.x, y: farm.y },
      farmer.id,
    );
    state = issueCommand(
      state,
      ['S_02', 'V_10', 'O_04'],
      { type: 'building', id: pen.id, x: pen.x, y: pen.y },
      herder.id,
    );
    expect(state.stats.commands).toBe(2);
    for (let frame = 0; frame < 240; frame++) {
      state.time += 0.25;
      simulationStep(state, 0.25);
    }
    expect(
      state.buildings.find((building) => building.id === farm.id)?.seasonWork?.[2]
        ?.efficiencySeconds,
    ).toBeCloseTo(20);
    expect(
      state.buildings.find((building) => building.id === pen.id)?.seasonWork?.[2]
        ?.efficiencySeconds,
    ).toBeCloseTo(30);
    state.time = 270;
    state.seasonIndex = 3;
    seasonalCore(state);
    expect(groundAmount(state, 'food')).toBeCloseTo(12.5);
    expect(groundAmount(state, 'meat')).toBeCloseTo(10);
    expect(groundAmount(state, 'pelt')).toBeCloseTo(2.5);
    expect([state.resources.food, state.resources.meat, state.resources.pelt]).toEqual([0, 0, 0]);
  });

  it('retains an absent urban captain in population without a second city job or delegation', () => {
    const state = expedition();
    const worker = state.units[0];
    const city = capital(state);
    city.cohorts.sages = 1;
    state.urbanized = true;
    Object.assign(worker, { cityId: city.id, caste: 'sage', intelligence: 8, boatId: 'ship' });
    const archive = createBuilding(state, 'archive', city.x, city.y, city.id);
    allocateCityWorkers(state, city);
    expect(archive.lastEfficiency).toBe(0);
    expect(archive.workerIds).toEqual([]);
    expect(chooseDelegateIdentity(state, city).available).toBe(false);
    expect(playerPopulation(state)).toBe(1);
    delete worker.boatId;
    Object.assign(worker, state.home);
    allocateCityWorkers(state, city);
    expect(archive.lastEfficiency).toBe(1 / BUILDING_SPECS.archive.workers);
    expect(chooseDelegateIdentity(state, city).available).toBe(true);
    expect(playerPopulation(state)).toBe(1);
  });

  it('condenses only mainland residents and leaves an island expedition physical', () => {
    const state = expedition();
    const explorer = state.units[0];
    const tree = createBuilding(state, 'depot', explorer.x, explorer.y);
    for (let index = 0; index < 150; index++)
      state.units.push({ ...structuredClone(explorer), ...state.home, id: `resident-${index}` });
    condenseCities(state);
    expect(state.urbanized).toBe(true);
    expect(explorer.cityId).toBeUndefined();
    expect(tree.cityId).toBeUndefined();
    expect(state.cities.find((city) => city.capital)?.cohorts.workers).toBe(150);
    expect(playerPopulation(state)).toBe(151);
  });

  it('retains the shared-stock behavior of worlds without maritime rules', () => {
    const state = expedition();
    Object.assign(state.units[0], state.home, { x: state.home.x + 20 });
    delete state.mapGeneration!.maritimeRules;
    delete state.boats;
    state.resources.stone = 2;
    expect(canPayLocally(state, { stone: 1 }, state.units[0])).toBe(true);
    payLocally(state, { stone: 1 }, state.units[0]);
    expect(state.resources.stone).toBe(1);
  });
});
