import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import { validSave } from './saveValidation';
import { isDryLandPoint } from './landNavigation';
import { isSeaPoint } from './coastGeometry';
import { emptyInventory } from './content';
import { BOAT_BUILD_COST } from './maritimeConfig';
import { recordKnowledgeDiscovery } from './knowledgeHistory';
import { WORLD_LOCAL_KEYS, type RegionState } from './worldTypes';
import { switchWorldRegion } from './worldRuntime';
import type { GameState } from './types';

const worldScene = () => createInitialState(42, 'classic', 'random', 1000, true);

/** An empty generated neighbour isolates persistence from region generation. */
function addNeighbour(state: GameState): RegionState {
  const snapshot = Object.fromEntries(
    WORLD_LOCAL_KEYS.map((key) => [key, structuredClone(state[key])]),
  ) as RegionState;
  snapshot.mapGeneration = { ...snapshot.mapGeneration!, regionX: 1, regionY: 0 };
  snapshot.units = [];
  snapshot.entities = [];
  snapshot.buildings = [];
  snapshot.boats = [];
  snapshot.cities = [];
  snapshot.factions = [];
  snapshot.battalions = [];
  snapshot.caravans = [];
  snapshot.explored = [];
  snapshot.regionalRoutes = [];
  delete snapshot.foreignPolicy;
  state.world!.regions['1:0'] = { id: '1:0', x: 1, y: 0, discovered: true, snapshot };
  return snapshot;
}

describe('connected world save schema', () => {
  it('opts in explicitly without adding metadata or archives to old regions', () => {
    for (const [mode, size, enabled] of [
      ['seed-zero', 500, false],
      ['random', 500, false],
      ['random', 1000, false],
      ['seed-zero', 500, true],
      ['random', 500, true],
    ] as const) {
      const state = createInitialState(42, 'classic', mode, size, enabled);
      expect(state.world).toBeUndefined();
      expect(state.mapGeneration?.worldRules).toBeUndefined();
      expect(state.mapGeneration?.worldSeed).toBeUndefined();
      expect(state.mapGeneration?.regionX).toBeUndefined();
      expect(validSave(state)).toBe(true);
    }
    const state = worldScene();
    expect(state.world).toMatchObject({
      version: 1,
      seed: 42,
      width: 4,
      height: 4,
      activeRegionId: '0:0',
      homeRegionId: '0:0',
      transfers: [],
    });
    expect(Object.keys(state.world!.regions)).toEqual(['0:0']);
    expect(state.world!.regions['0:0'].snapshot).toBeUndefined();
    expect(validSave(state)).toBe(true);
    expect(validSave(JSON.parse(JSON.stringify(state)))).toBe(true);
  });

  it('requires complete compatible metadata and rejects unsupported world versions', () => {
    const state = worldScene();
    for (const patch of [
      { seed: 43 },
      { worldRules: 2 },
      { worldSeed: undefined },
      { worldSeed: 43 },
      { worldSeed: 1.5 },
      { regionX: undefined },
      { regionX: 4 },
      { regionY: -1 },
      { regionY: 0.5 },
      { maritimeRules: undefined },
      { coastalRules: undefined },
      { biomeRules: undefined },
    ]) {
      const invalid = structuredClone(state);
      Object.assign(invalid.mapGeneration!, patch);
      expect(validSave(invalid), JSON.stringify(patch)).toBe(false);
    }
    const missing = structuredClone(state);
    delete missing.world;
    expect(validSave(missing)).toBe(false);
    for (const patch of [
      { version: 2 },
      { seed: 43 },
      { width: 5 },
      { height: 0 },
      { activeRegionId: '1:0' },
      { homeRegionId: '1:0' },
    ]) {
      const invalid = structuredClone(state);
      Object.assign(invalid.world!, patch);
      expect(validSave(invalid), JSON.stringify(patch)).toBe(false);
    }
    const old = createInitialState(42, 'classic', 'random', 1000);
    Object.assign(old.mapGeneration!, { regionX: 0 });
    expect(validSave(old)).toBe(false);
  });

  it('validates each archived physical inventory and rejects nested global state', () => {
    const state = worldScene();
    addNeighbour(state);
    expect(validSave(state)).toBe(true);
    for (const amount of [-1, null, '3', Number.NaN, undefined]) {
      const invalid = structuredClone(state);
      Object.assign(invalid.world!.regions['1:0'].snapshot!.resources, { wood: amount });
      expect(validSave(invalid)).toBe(false);
    }
    for (const resource of ['fish', 'cookedFish'] as const) {
      const invalid = structuredClone(state);
      delete (invalid.world!.regions['1:0'].snapshot!.resources as Partial<GameState['resources']>)[
        resource
      ];
      expect(validSave(invalid)).toBe(false);
    }
    for (const patch of [
      { world: structuredClone(state.world) },
      { words: state.words },
      { time: 0 },
      { seed: 42 },
    ]) {
      const invalid = structuredClone(state);
      Object.assign(invalid.world!.regions['1:0'].snapshot!, patch);
      expect(validSave(invalid)).toBe(false);
    }
    const duplicateActive = structuredClone(state);
    duplicateActive.world!.regions['0:0'].snapshot = structuredClone(
      duplicateActive.world!.regions['1:0'].snapshot,
    );
    expect(validSave(duplicateActive)).toBe(false);
    const missingArchive = structuredClone(state);
    delete missingArchive.world!.regions['1:0'].snapshot;
    expect(validSave(missingArchive)).toBe(false);
  });

  it('keeps discovery history valid when its actual teacher lives in another region', () => {
    const state = worldScene();
    const person = state.units[0];
    const wordId = 'O_01';
    person.knows.push(wordId);
    state.words[wordId] = { retention: 100, custodians: [person.id], uses: 1 };
    recordKnowledgeDiscovery(state, wordId, person.id);
    expect(state.knowledgeHistory).toHaveLength(1);
    const snapshot = addNeighbour(state);
    state.units.splice(state.units.indexOf(person), 1);
    snapshot.units.push(person);
    const projection = { ...state, ...snapshot, world: undefined };
    const point = Array.from({ length: 100 }, (_, i) => ({
      x: 5 + (i % 10) * 100,
      y: 5 + Math.floor(i / 10) * 100,
    })).find((candidate) => isDryLandPoint(projection, candidate));
    expect(point).toBeDefined();
    Object.assign(person, point);
    expect(validSave(state)).toBe(true);
    const serialized = JSON.stringify(state);
    expect(validSave(JSON.parse(serialized))).toBe(true);
    expect(JSON.parse(serialized).knowledgeHistory).toEqual(state.knowledgeHistory);

    const duplicate = structuredClone(state);
    duplicate.units.push(structuredClone(person));
    expect(validSave(duplicate)).toBe(false);
    const missing = structuredClone(state);
    missing.world!.regions['1:0'].snapshot!.units = [];
    expect(validSave(missing)).toBe(false);
  });

  it('allows region destinations only for point targets in a connected world', () => {
    const state = worldScene();
    const person = state.units[0];
    person.lastTaskResult = {
      time: 0,
      tokens: ['S_01', 'V_01'],
      reason: 'completed',
      suspended: false,
      target: { type: 'point', x: 1000, y: 550, regionId: '1:0' },
    };
    expect(validSave(state)).toBe(true);
    person.lastTaskResult.target!.type = 'unit';
    expect(validSave(state)).toBe(false);
    person.lastTaskResult.target!.type = 'point';
    person.lastTaskResult.target!.regionId = '4:0';
    expect(validSave(state)).toBe(false);
    const old = createInitialState(42, 'classic', 'random', 1000);
    old.units[0].lastTaskResult = structuredClone(person.lastTaskResult);
    old.units[0].lastTaskResult.target!.regionId = '1:0';
    expect(validSave(old)).toBe(false);
  });

  it('requires adjacent physical borders and unique living actors in saved crossings', () => {
    const state = worldScene();
    const neighbour = addNeighbour(state);
    const view = { ...state, ...neighbour, world: undefined };
    const y = Array.from({ length: 19 }, (_, index) => 25 + index * 50).find(
      (y) => isDryLandPoint(state, { x: 1000, y }) && isDryLandPoint(view, { x: 0, y }),
    );
    expect(y).toBeDefined();
    state.world!.transfers.push({
      id: 'crossing-1',
      from: '0:0',
      to: '1:0',
      kind: 'people',
      actorIds: [state.units[0].id],
      exit: { x: 1000, y: y! },
      entry: { x: 0, y: y! },
    });
    expect(validSave(state)).toBe(true);
    for (const patch of [
      { to: '3:0' },
      { from: '1:0' },
      { entry: { x: 10, y } },
      { actorIds: ['missing-person'] },
      { actorIds: [state.units[0].id, state.units[0].id] },
    ]) {
      const invalid = structuredClone(state);
      Object.assign(invalid.world!.transfers[0], patch);
      expect(validSave(invalid)).toBe(false);
    }
    const duplicate = structuredClone(state);
    duplicate.world!.transfers.push({ ...duplicate.world!.transfers[0], id: 'crossing-2' });
    expect(validSave(duplicate)).toBe(false);
    const dead = structuredClone(state);
    dead.units[0].hp = 0;
    expect(validSave(dead)).toBe(false);
    const settled = structuredClone(state);
    settled.units[0].cityId = settled.cities[0].id;
    expect(validSave(settled)).toBe(false);
  });

  it('persists a pending crossing without generating or revealing its destination', () => {
    const state = worldScene();
    const destination = {
      ...state,
      mapGeneration: { ...state.mapGeneration!, regionX: 1, regionY: 0 },
      sectors: [],
    };
    const y = Array.from({ length: 99 }, (_, index) => 10 + index * 10).find(
      (y) => isDryLandPoint(state, { x: 1000, y }) && isDryLandPoint(destination, { x: 0, y }),
    );
    expect(y).toBeDefined();
    state.world!.transfers.push({
      id: 'pending-unvisited',
      from: '0:0',
      to: '1:0',
      kind: 'people',
      actorIds: [state.units[0].id],
      exit: { x: 1000, y: y! },
      entry: { x: 0, y: y! },
    });
    const serialized = JSON.stringify(state);
    expect(validSave(state)).toBe(true);
    expect(validSave(JSON.parse(serialized))).toBe(true);
    expect(JSON.stringify(state)).toBe(serialized);
    expect(Object.keys(state.world!.regions)).toEqual(['0:0']);

    const nonAdjacent = structuredClone(state);
    nonAdjacent.world!.transfers[0].to = '2:0';
    expect(validSave(nonAdjacent)).toBe(false);
    const corner = structuredClone(state);
    corner.world!.transfers[0].exit.y = 0;
    corner.world!.transfers[0].entry.y = 0;
    expect(validSave(corner)).toBe(false);
  });

  it('keeps a crossing vessel and every passenger together on an actual sea border', () => {
    const state = worldScene();
    const neighbour = addNeighbour(state);
    const view = { ...state, ...neighbour, world: undefined };
    const y = Array.from({ length: 100 }, (_, index) => 5 + index * 10).find(
      (y) => isSeaPoint(state, { x: 1000, y }) && isSeaPoint(view, { x: 0, y }),
    );
    expect(y).toBeDefined();
    const person = state.units[0];
    const boatId = 'crossing-boat';
    Object.assign(person, { x: 980, y, boatId, action: 'sailing' });
    state.boats!.push({
      id: boatId,
      x: 980,
      y: y!,
      hp: 100,
      maxHp: 100,
      ownerId: 'player',
      status: 'moored',
      passengerIds: [person.id],
      resources: { ...emptyInventory(), fish: 3 },
      paidMaterials: { ...emptyInventory(), ...BOAT_BUILD_COST },
      progress: 20,
    });
    state.world!.transfers.push({
      id: 'crossing-1',
      from: '0:0',
      to: '1:0',
      kind: 'boat',
      actorIds: [boatId, person.id],
      exit: { x: 1000, y: y! },
      entry: { x: 0, y: y! },
    });
    expect(validSave(state)).toBe(true);
    expect(validSave(JSON.parse(JSON.stringify(state)))).toBe(true);
    const ungenerated = structuredClone(state);
    delete ungenerated.world!.regions['1:0'];
    expect(validSave(ungenerated)).toBe(true);
    expect(validSave(JSON.parse(JSON.stringify(ungenerated)))).toBe(true);
    const observedNeighbour = switchWorldRegion(state, '1:0');
    expect(validSave(observedNeighbour)).toBe(true);
    const invalidArchivedCargo = structuredClone(observedNeighbour);
    invalidArchivedCargo.world!.regions['0:0'].snapshot!.boats![0].resources.fish = -1;
    expect(validSave(invalidArchivedCargo)).toBe(false);
    const invalidArchivedPassenger = structuredClone(observedNeighbour);
    invalidArchivedPassenger.world!.regions['0:0'].snapshot!.boats![0].passengerIds = [];
    expect(validSave(invalidArchivedPassenger)).toBe(false);
    const missingPassenger = structuredClone(state);
    missingPassenger.world!.transfers[0].actorIds = [boatId];
    expect(validSave(missingPassenger)).toBe(false);
    const extraPassenger = structuredClone(state);
    extraPassenger.world!.transfers[0].actorIds.push(state.units[1].id);
    expect(validSave(extraPassenger)).toBe(false);
    const wrongActorOrder = structuredClone(state);
    wrongActorOrder.world!.transfers[0].actorIds.reverse();
    expect(validSave(wrongActorOrder)).toBe(false);
    const wrongMedium = structuredClone(state);
    wrongMedium.world!.transfers[0].kind = 'people';
    expect(validSave(wrongMedium)).toBe(false);
  });
});
