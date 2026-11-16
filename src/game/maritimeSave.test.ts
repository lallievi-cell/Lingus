import { describe, expect, it } from 'vitest';
import { BUILDING_ORDER, BUILDING_SPECS, emptyInventory, WORD_ORDER } from './content';
import { createCoastGeometry, isSeaPoint } from './coastGeometry';
import { isDryLandPoint } from './landNavigation';
import { BOAT_BUILD_COST, BOAT_CARGO_CAPACITY } from './maritimeConfig';
import { validSave } from './saveValidation';
import { createInitialState } from './state';
import type { Boat, GameState } from './types';

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
    abandoned.units[0].action = 'idle';
    phases.push(abandoned);
    const sailing = structuredClone(state);
    passenger(sailing, sailing.boats![0]);
    const destination = { x: water.x - inland.x * 8, y: water.y - inland.y * 8 };
    Object.assign(sailing.boats![0], {
      status: 'sailing',
      route: [{ ...water }, destination],
      routeIndex: 1,
      destination,
    });
    sailing.boats![0].resources.fish = 3;
    phases.push(sailing);
    const landing = structuredClone(sailing);
    Object.assign(landing.boats![0], {
      status: 'landing',
      landing: { ...land },
      destination: { ...land },
    });
    Object.assign(landing.units[0], { action: 'disembarking', embarkFrom: { ...water } });
    phases.push(landing);
    for (const phase of phases) {
      expect(validSave(phase), phase.boats![0].status).toBe(true);
      const loaded = JSON.parse(JSON.stringify(phase));
      expect(validSave(loaded), phase.boats![0].status).toBe(true);
      expect(loaded).toEqual(phase);
    }
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
  });

  it('counts real passenger loads against the same cargo limit as vessel stores', () => {
    const { state, boat } = maritimeScene();
    const person = passenger(state, boat);
    person.carry = { resource: 'wood', amount: 3 };
    boat.resources.wood = BOAT_CARGO_CAPACITY - 3;
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
    ]) {
      const { state } = maritimeScene();
      corrupt(state);
      expect(validSave(state)).toBe(false);
    }
  });
});
