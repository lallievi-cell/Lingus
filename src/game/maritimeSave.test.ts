import { describe, expect, it } from 'vitest';
import {
  BUILDING_ORDER,
  BUILDING_SPECS,
  emptyInventory,
  RESOURCE_ORDER,
  WORD_ORDER,
} from './content';
import { createCoastGeometry, isSeaPoint, isSeaSegment } from './coastGeometry';
import { isDryLandPoint } from './landNavigation';
import { BOAT_BUILD_COST, BOAT_CARGO_CAPACITY } from './maritimeConfig';
import { validSave } from './saveValidation';
import { createInitialState } from './state';
import type { Boat, GameState } from './types';
import { generateWorld } from './worldGeneration';

/** Prepared harbor records isolate persistence. Their paid hull materials
 * record an earlier real construction, rather than an ordinary opening. */
function maritimeScene() {
  const state = createInitialState(42, 'classic', 'random', 1000);
  const coast = createCoastGeometry(state)!;
  const inland = {
    x: coast.side === 'west' ? 1 : coast.side === 'east' ? -1 : 0,
    y: coast.side === 'north' ? 1 : coast.side === 'south' ? -1 : 0,
  };
  const shore = coast.points.find((point) => {
    const land = { x: point.x + inland.x * 8, y: point.y + inland.y * 8 };
    const water = { x: point.x - inland.x * 3, y: point.y - inland.y * 3 };
    return (
      isDryLandPoint(state, land) &&
      isSeaPoint(state, water) &&
      land.x > 5 &&
      land.y > 5 &&
      land.x < 995 &&
      land.y < 995
    );
  })!;
  if (!shore) throw new Error('The prepared harbor needs an actual dry coastal site.');
  const land = { x: shore.x + inland.x * 8, y: shore.y + inland.y * 8 };
  const water = { x: shore.x - inland.x * 3, y: shore.y - inland.y * 3 };
  state.buildings.push({
    id: 'paid-harbor',
    kind: 'harbor',
    ...land,
    hp: BUILDING_SPECS.harbor.maxHp,
    active: true,
    completed: true,
    seaAccess: { ...water },
  });
  const boat: Boat = {
    id: 'paid-canoe',
    ...water,
    hp: 100,
    maxHp: 100,
    ownerId: 'player',
    harborId: 'paid-harbor',
    status: 'moored',
    passengerIds: [],
    resources: emptyInventory(),
    paidMaterials: { ...emptyInventory(), ...BOAT_BUILD_COST },
    progress: 20,
    accessLand: { ...land },
  };
  state.boats!.push(boat);
  return { state, boat, land, water, inland };
}

function passenger(state: GameState, boat: Boat) {
  const person = state.units[0];
  Object.assign(person, { x: boat.x, y: boat.y, boatId: boat.id, action: 'sailing' });
  boat.passengerIds = [person.id];
  return person;
}

describe('versioned maritime catalogs and save records', () => {
  it('adds one paid harbor while preserving every original building and all forty-five words', () => {
    expect(BUILDING_ORDER.filter((kind) => kind !== 'harbor')).toHaveLength(20);
    expect(BUILDING_ORDER).toHaveLength(21);
    expect(WORD_ORDER).toHaveLength(45);
    expect(RESOURCE_ORDER).toHaveLength(16);
    expect(BUILDING_SPECS.harbor).toMatchObject({
      id: 'BLD_21',
      maxHp: 250,
      workers: 0,
      cost: { wood: 10, stone: 5 },
      upkeep: { wood: 1 },
      recipe: ['V_08', 'O_03', 'M_02'],
    });
  });

  it('opts in only new random regions, requiring a vessel collection without modifying old profiles', () => {
    const current = createInitialState(42, 'guided', 'random', 1000);
    expect(current.mapGeneration?.maritimeRules).toBe(1);
    expect(current.boats).toEqual([]);
    expect(validSave(current)).toBe(true);
    const missing = structuredClone(current);
    delete missing.boats;
    expect(validSave(missing)).toBe(false);
    for (const [mode, size] of [
      ['seed-zero', 500],
      ['seed-zero', 1000],
      ['random', 500],
    ] as const) {
      const legacy = createInitialState(42, 'classic', mode, size);
      expect(legacy.mapGeneration?.maritimeRules).toBeUndefined();
      expect(legacy.boats).toBeUndefined();
      expect(validSave(legacy)).toBe(true);
      legacy.boats = [];
      expect(validSave(legacy)).toBe(false);
    }
    for (const patch of [
      { maritimeRules: 2 },
      { maritimeRules: null },
      { coastalRules: undefined },
      { biomeRules: undefined },
      { landNavigation: undefined },
      { regionalCultures: undefined },
      { worldSize: undefined },
      { mode: 'seed-zero' },
    ]) {
      const invalid = structuredClone(current);
      Object.assign(invalid.mapGeneration!, patch);
      expect(validSave(invalid)).toBe(false);
    }
  });

  it('retains paid unfinished hulls, mooring, voyage and landing state through JSON round trips', () => {
    const { state, boat, land, water, inland } = maritimeScene();
    expect(validSave(state)).toBe(true);
    const phases: GameState[] = [structuredClone(state)];
    const building = structuredClone(state);
    const builder = building.units[0];
    Object.assign(builder, { ...land, targetBoatId: boat.id, action: 'boatbuilding' });
    Object.assign(building.boats![0], { status: 'building', progress: 7.5, builderId: builder.id });
    phases.push(building);
    const abandoned = structuredClone(building);
    delete abandoned.boats![0].builderId;
    delete abandoned.units[0].targetBoatId;
    abandoned.units[0].hp = 0;
    abandoned.units[0].action = 'idle';
    delete abandoned.boats![0].harborId;
    phases.push(abandoned);
    const sailing = structuredClone(state);
    passenger(sailing, sailing.boats![0]);
    const destination = { x: water.x - inland.x * 8, y: water.y - inland.y * 8 };
    Object.assign(sailing.boats![0], {
      status: 'sailing',
      route: [{ ...water }, destination],
      routeIndex: 1,
      destination,
      harborId: undefined,
      accessLand: undefined,
    });
    sailing.boats![0].resources.fish = 3;
    phases.push(sailing);
    const underway = structuredClone(sailing);
    Object.assign(underway.boats![0], {
      x: (water.x + destination.x) / 2,
      y: (water.y + destination.y) / 2,
      accessLand: undefined,
    });
    Object.assign(underway.units[0], {
      x: underway.boats![0].x,
      y: underway.boats![0].y,
    });
    phases.push(underway);
    const landing = structuredClone(sailing);
    Object.assign(landing.boats![0], {
      status: 'landing',
      landing: { ...land },
      destination: { ...land },
    });
    Object.assign(landing.units[0], {
      x: (water.x + land.x) / 2,
      y: (water.y + land.y) / 2,
      action: 'disembarking',
      embarkFrom: { ...water },
    });
    phases.push(landing);
    for (const phase of phases) {
      expect(validSave(phase), phase.boats![0].status).toBe(true);
      const loaded = JSON.parse(JSON.stringify(phase));
      expect(validSave(loaded), phase.boats![0].status).toBe(true);
      expect(loaded).toEqual(phase);
    }
  });

  it('keeps a previous coastal region valid without adding islands, vessels or maritime fields', () => {
    const legacy = createInitialState(42, 'classic', 'random', 1000);
    delete legacy.mapGeneration!.maritimeRules;
    delete legacy.boats;
    Object.assign(legacy, generateWorld(42, legacy.factions, 1000, true, true, false));
    const before = JSON.stringify(legacy);
    expect(legacy.mapGeneration?.coastalRules).toBe(1);
    expect(createCoastGeometry(legacy)?.islands).toBeUndefined();
    expect(validSave(legacy)).toBe(true);
    expect(JSON.stringify(legacy)).toBe(before);
    expect(validSave(JSON.parse(before))).toBe(true);
    for (const patch of [
      { boatId: 'missing' },
      { targetBoatId: 'missing' },
      { deliveryBoatId: 'missing' },
      { deliveryPoint: { ...legacy.home } },
      { embarkFrom: { ...legacy.home } },
    ]) {
      const invalid = JSON.parse(before) as GameState;
      Object.assign(invalid.units[0], patch);
      expect(validSave(invalid)).toBe(false);
    }
  });

  it('saves the real shore walk and bridge crossing before membership begins', () => {
    const { state, boat, land, water } = maritimeScene();
    const person = state.units[0];
    Object.assign(person, { ...land, targetBoatId: boat.id, action: 'embarking' });
    expect(validSave(state)).toBe(true);
    Object.assign(person, {
      x: land.x * 0.2 + water.x * 0.8,
      y: land.y * 0.2 + water.y * 0.8,
      embarkFrom: { ...land },
    });
    expect(isSeaPoint(state, person)).toBe(true);
    expect(person.boatId).toBeUndefined();
    expect(boat.passengerIds).toEqual([]);
    expect(validSave(JSON.parse(JSON.stringify(state)))).toBe(true);
    person.x += 4;
    person.y += 4;
    expect(validSave(state)).toBe(false);
  });

  it('rejects partial or corrupted new inventories without filling, clamping or sanitizing them', () => {
    for (const field of ['resources', 'paidMaterials'] as const) {
      for (const value of [undefined, null, -1, '2', NaN, Infinity]) {
        const { state, boat } = maritimeScene();
        if (value === undefined) delete (boat[field] as Partial<typeof boat.resources>).fish;
        else boat[field].fish = value as never;
        const before = structuredClone(boat[field]);
        expect(validSave(state)).toBe(false);
        expect(boat[field]).toEqual(before);
      }
    }
    const { state, boat } = maritimeScene();
    boat.paidMaterials.wood--;
    expect(validSave(state)).toBe(false);
    for (const field of ['resources', 'paidMaterials'] as const) {
      const extra = maritimeScene();
      Object.assign(extra.boat[field], { unknownResource: 0 });
      expect(validSave(extra.state)).toBe(false);
    }
  });

  it('counts real passenger loads against the same cargo limit as vessel stores', () => {
    const { state, boat } = maritimeScene();
    const person = passenger(state, boat);
    person.carry = { resource: 'wood', amount: 3 };
    boat.resources.wood = BOAT_CARGO_CAPACITY - 3;
    expect(validSave(state)).toBe(true);
    boat.resources.wood++;
    expect(validSave(state)).toBe(false);
    boat.resources.wood--;
    boat.resources.coin = 10000;
    person.carry = { resource: 'coin', amount: 10000 };
    expect(validSave(state)).toBe(true);
  });

  it('reserves both seats and real personal cargo while boarding is still on shore', () => {
    const { state, boat, land } = maritimeScene();
    const crew = state.units.slice(0, 4);
    for (const person of crew)
      Object.assign(person, { ...land, targetBoatId: boat.id, action: 'embarking' });
    expect(validSave(state)).toBe(false);
    crew[3].action = 'idle';
    delete crew[3].targetBoatId;
    crew[0].carry = { resource: 'wood', amount: 3 };
    boat.resources.wood = 17;
    expect(validSave(state)).toBe(true);
    boat.resources.wood++;
    expect(validSave(state)).toBe(false);
  });

  it('rejects stale, duplicated, foreign and contradictory passenger ownership references', () => {
    for (const corrupt of [
      (s: GameState) => {
        s.boats![0].passengerIds = ['missing'];
      },
      (s: GameState) => {
        s.units[0].boatId = 'missing';
      },
      (s: GameState) => {
        s.units[0].targetBoatId = 'missing';
      },
      (s: GameState) => {
        s.units[0].deliveryBoatId = 'missing';
      },
      (s: GameState) => {
        s.boats![0].passengerIds.push(s.units[0].id);
      },
      (s: GameState) => {
        delete s.units[0].boatId;
      },
      (s: GameState) => {
        s.boats![0].passengerIds = [];
      },
      (s: GameState) => {
        s.units[0].hp = 0;
      },
      (s: GameState) => {
        Object.assign(s.units[0], s.home);
      },
      (s: GameState) => {
        s.units[0].factionId = s.factions[0].id;
      },
      (s: GameState) => {
        s.boats![0].ownerId = 'missing';
      },
      (s: GameState) => {
        s.boats!.push(structuredClone(s.boats![0]));
      },
      (s: GameState) => {
        s.boats!.push({ ...structuredClone(s.boats![0]), id: 'other' });
      },
    ]) {
      const { state, boat } = maritimeScene();
      passenger(state, boat);
      corrupt(state);
      expect(validSave(state)).toBe(false);
    }
  });

  it('persists only valid cargo requests attached to an active shore transfer', () => {
    const { state, boat, land } = maritimeScene();
    const worker = state.units[0];
    Object.assign(worker, {
      ...land,
      action: 'loadingBoat',
      targetBoatId: boat.id,
      cargoResources: ['wood', 'stone'],
    });
    expect(validSave(state)).toBe(true);
    for (const patch of [
      { cargoResources: [] },
      { cargoResources: ['wood', 'wood'] },
      { cargoResources: ['unknown'] },
      { cargoResources: null },
      { action: 'idle' },
      { targetBoatId: undefined },
    ]) {
      const invalid = structuredClone(state);
      Object.assign(invalid.units[0], patch);
      expect(validSave(invalid)).toBe(false);
    }
  });

  it('persists an explicit cargo resource only on maritime boat targets', () => {
    const { state, boat } = maritimeScene();
    const result = {
      time: state.time,
      tokens: ['S_01', 'V_04', 'M_02'],
      reason: 'completed' as const,
      suspended: false,
      target: { type: 'boat' as const, id: boat.id, x: boat.x, y: boat.y },
    };
    for (const resource of RESOURCE_ORDER) {
      state.units[0].lastTaskResult = {
        ...result,
        target: { ...result.target, cargoResource: resource },
      };
      expect(validSave(JSON.parse(JSON.stringify(state))), resource).toBe(true);
    }
    for (const patch of [
      { cargoResource: 'unknown' },
      { cargoResource: null },
      { type: 'point' },
      { type: 'building' },
    ]) {
      const invalid = structuredClone(state);
      Object.assign(invalid.units[0].lastTaskResult!.target!, patch);
      expect(validSave(invalid)).toBe(false);
    }
    const legacy = createInitialState(42, 'classic', 'random', 1000);
    delete legacy.mapGeneration!.maritimeRules;
    delete legacy.boats;
    Object.assign(legacy, generateWorld(42, legacy.factions, 1000, true, true, false));
    legacy.units[0].lastTaskResult = { ...result, target: { ...result.target } };
    expect(validSave(legacy)).toBe(true);
    legacy.units[0].lastTaskResult.target!.cargoResource = 'wood';
    expect(validSave(legacy)).toBe(false);
  });

  it('rejects vessels on land, dry berths, offshore landing points and invalid routes', () => {
    for (const corrupt of [
      (s: GameState) => Object.assign(s.boats![0], s.home),
      (s: GameState) => {
        s.buildings[0].seaAccess = { ...s.home };
      },
      (s: GameState) => {
        s.boats![0].accessLand = { x: s.boats![0].x, y: s.boats![0].y };
      },
      (s: GameState) => {
        s.boats![0].landing = { x: -1, y: 20 };
      },
      (s: GameState) => {
        s.boats![0].route = [{ ...s.home }];
      },
      (s: GameState) => {
        s.boats![0].routeIndex = 2;
      },
      (s: GameState) => {
        s.boats![0].route = [];
        s.boats![0].status = 'sailing';
      },
      (s: GameState) => {
        s.boats![0].status = 'landing';
      },
      (s: GameState) => {
        s.boats![0].harborId = 'missing';
      },
      (s: GameState) => {
        s.boats![0].builderId = 'missing';
        s.boats![0].status = 'building';
      },
      (s: GameState) => {
        s.boats![0].progress = 21;
      },
      (s: GameState) => {
        s.boats![0].progress = 1;
      },
      (s: GameState) => {
        s.boats![0].accessLand = { ...s.home };
      },
      (s: GameState) => {
        s.boats![0].status = 'sailing';
        s.boats![0].route = [{ x: s.boats![0].x, y: s.boats![0].y }];
        s.boats![0].routeIndex = 0;
        s.boats![0].destination = { x: s.boats![0].x, y: s.boats![0].y };
        s.boats![0].landing = { ...s.home };
        passenger(s, s.boats![0]);
      },
    ]) {
      const { state } = maritimeScene();
      corrupt(state);
      expect(validSave(state)).toBe(false);
    }
  });

  it('rejects a sea route that cuts through a real island despite wet endpoints', () => {
    const { state, boat } = maritimeScene();
    const coast = createCoastGeometry(state)!;
    const island = coast.islands![0];
    const center = island.points.reduce(
      (sum, point) => ({
        x: sum.x + point.x / island.points.length,
        y: sum.y + point.y / island.points.length,
      }),
      { x: 0, y: 0 },
    );
    const across = coast.side === 'north' || coast.side === 'south' ? 'y' : 'x';
    const a = { ...center, [across]: Math.min(...island.points.map((point) => point[across])) - 5 };
    const b = { ...center, [across]: Math.max(...island.points.map((point) => point[across])) + 5 };
    expect(isSeaPoint(state, a)).toBe(true);
    expect(isSeaPoint(state, b)).toBe(true);
    expect(isSeaSegment(state, a, b)).toBe(false);
    Object.assign(boat, {
      ...a,
      status: 'sailing',
      route: [a, b],
      routeIndex: 1,
      destination: b,
      accessLand: undefined,
      harborId: undefined,
    });
    passenger(state, boat);
    expect(validSave(state)).toBe(false);
  });

  it('rejects a short berth or landing whose apparent shore approach crosses river water', () => {
    for (const phase of ['harbor', 'access', 'landing']) {
      const { state, boat } = maritimeScene();
      const vertex = createCoastGeometry(state)!.points[1];
      const land = { x: vertex.x + 8, y: vertex.y + 8 };
      const water = { x: land.x - 19 / Math.SQRT2, y: land.y - 19 / Math.SQRT2 };
      expect(isDryLandPoint(state, land)).toBe(true);
      expect(isSeaPoint(state, water)).toBe(true);
      Object.assign(boat, water);
      if (phase === 'harbor') {
        const harbor = state.buildings.find((building) => building.id === boat.harborId)!;
        Object.assign(harbor, land, { seaAccess: water });
        boat.accessLand = land;
      } else {
        delete boat.harborId;
        if (phase === 'access') boat.accessLand = land;
        else {
          delete boat.accessLand;
          Object.assign(boat, {
            status: 'sailing',
            route: [water],
            routeIndex: 0,
            destination: water,
            landing: land,
          });
          passenger(state, boat);
        }
      }
      expect(validSave(state), phase).toBe(false);
    }
  });
});
