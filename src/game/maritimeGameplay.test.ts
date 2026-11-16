import { describe, expect, it } from 'vitest';
import { createCoastGeometry, isSeaPoint } from './coastGeometry';
import { emptyInventory, RESOURCE_SPECS } from './content';
import { createGame, parseGame, serializeGame, tick } from './engine';
import { isDryLandPoint, planLandRoute } from './landNavigation';
import { resolveInteractionPosition } from './interactionPositions';
import {
  assignBoarding,
  assignCargoTransfer,
  assignSailing,
  beginBoatBuild,
  BOAT_BUILD_COST,
  boatCargoAmount,
  boatFreeCapacity,
  boatReservedCargoAmount,
  canBoardBoat,
  canTransferCargo,
  consumeMaritimeFood,
  updateMaritime,
} from './maritime';
import { resourceSpoilage } from './math';
import { validSave } from './saveValidation';
import { findShoreAccess } from './shoreAccess';
import {
  canCookAt,
  canIgnite,
  consume,
  createBuilding,
  killUnit,
  processWork,
  resetUnitWithState,
  seasonalCore,
  updateUnits,
} from './simulation';
import type { Boat, GameState, Resource, Unit } from './types';

/** Paid vessel fixtures represent a coastal expedition already provisioned.
 * Gameplay assertions track subsequent costs, physical travel and every load. */
function scene() {
  const state = createGame(42, 'classic', 'random', 1000);
  state.started = true;
  state.paused = false;
  state.resources = emptyInventory();
  const coast = createCoastGeometry(state)!;
  const inward = {
    x: coast.side === 'west' ? 1 : coast.side === 'east' ? -1 : 0,
    y: coast.side === 'north' ? 1 : coast.side === 'south' ? -1 : 0,
  };
  const shore = coast.points
    .map((p) => ({ x: p.x + inward.x * 8, y: p.y + inward.y * 8 }))
    .find(
      (p) =>
        p.x > 10 &&
        p.y > 10 &&
        p.x < 990 &&
        p.y < 990 &&
        isDryLandPoint(state, p) &&
        findShoreAccess(state, p),
    )!;
  expect(shore).toBeDefined();
  const harbor = createBuilding(state, 'harbor', shore.x, shore.y);
  const water = harbor.seaAccess!;
  const boat: Boat = {
    id: 'prepared-vessel',
    ...water,
    hp: 150,
    maxHp: 150,
    ownerId: 'player',
    harborId: harbor.id,
    status: 'moored',
    passengerIds: [],
    resources: emptyInventory(),
    paidMaterials: { ...emptyInventory(), ...BOAT_BUILD_COST },
    progress: 20,
    accessLand: { ...shore },
  };
  state.boats!.push(boat);
  const unit = state.units[0];
  Object.assign(unit, { ...shore, age: 8, hunger: 0, temp: 100, hp: 100, action: 'idle' });
  return { state, boat, unit, harbor, land: shore, inward, coast };
}
function cycles(state: GameState, unit: Unit, seconds: number) {
  for (let time = 0; time < seconds - 1e-8; time += 0.25)
    processWork(state, unit, Math.min(0.25, seconds - time));
}
function board(state: GameState, boat: Boat, unit: Unit) {
  expect(assignBoarding(state, boat, [unit]).ok).toBe(true);
  for (let step = 0; !unit.boatId && step < 100; step++) processWork(state, unit, 0.25);
  expect(unit.boatId).toBe(boat.id);
}
function islandAccess(state: GameState) {
  const island = createCoastGeometry(state)!.islands![0];
  const center = island.points.reduce(
    (sum, point) => ({
      x: sum.x + point.x / island.points.length,
      y: sum.y + point.y / island.points.length,
    }),
    { x: 0, y: 0 },
  );
  for (const edge of island.points) {
    const land = { x: edge.x + (center.x - edge.x) * 0.2, y: edge.y + (center.y - edge.y) * 0.2 };
    const access = findShoreAccess(state, land);
    if (access) return access;
  }
  throw new Error('The generated island needs an actual accessible beach.');
}
function pile(state: GameState, resource: Resource, amount: number, point = state.home) {
  const entity = {
    id: `test-${resource}-${state.entities.length}`,
    kind: 'ground' as const,
    ...point,
    amount,
    maxAmount: amount,
    hp: 0,
    maxHp: 1,
    resource,
  };
  state.entities.push(entity);
  return entity;
}

describe('physical maritime work and conservation', () => {
  it('works for twenty seconds on a paid harbor and records its real sea access at completion', () => {
    const { state, unit, harbor, land } = scene();
    state.boats = [];
    state.buildings = state.buildings.filter((building) => building.id !== harbor.id);
    Object.assign(unit, {
      action: 'building',
      buildingKind: 'harbor',
      paidConstruction: { wood: 10, stone: 5 },
      tx: land.x,
      ty: land.y,
      command: ['S_01', 'V_08', 'O_03', 'M_02'],
    });
    const workstation = resolveInteractionPosition(state, unit, land, {
      kind: 'build',
      key: `build:${land.x.toFixed(3)}:${land.y.toFixed(3)}`,
    });
    const workPoint = isDryLandPoint(state, workstation) ? workstation : land;
    unit.x = workPoint.x;
    unit.y = workPoint.y;
    cycles(state, unit, 19.75);
    expect(state.buildings.some((building) => building.kind === 'harbor')).toBe(false);
    processWork(state, unit, 0.25);
    const completed = state.buildings.find((building) => building.kind === 'harbor')!;
    expect(completed).toBeDefined();
    expect(isDryLandPoint(state, completed)).toBe(true);
    expect(isSeaPoint(state, completed.seaAccess!)).toBe(true);
    expect(validSave(state)).toBe(true);
  });

  it('pays a hull once, preserves interrupted work, and finishes only after twenty work seconds', () => {
    const { state, unit, harbor } = scene();
    state.boats = [];
    state.resources.wood = 30;
    state.resources.tool = 2;
    const first = beginBoatBuild(state, unit, harbor);
    expect(first.ok).toBe(true);
    const hull = first.boat!;
    expect(state.resources).toMatchObject({ wood: 15, tool: 1 });
    processWork(state, unit, 5);
    expect(hull.progress).toBe(5);
    resetUnitWithState(state, unit);
    expect(hull.builderId).toBeUndefined();
    expect(hull.status).toBe('building');
    expect(validSave(state)).toBe(true);
    expect(beginBoatBuild(state, unit, harbor).boat).toBe(hull);
    expect(state.resources).toMatchObject({ wood: 15, tool: 1 });
    processWork(state, unit, 14.75);
    expect(hull.status).toBe('building');
    expect(validSave(state)).toBe(true);
    processWork(state, unit, 0.25);
    expect(hull).toMatchObject({ status: 'moored', progress: 20, builderId: undefined });
    expect(validSave(state)).toBe(true);
  });

  it('walks to the jetty and interpolates boarding without dropping the personal load', () => {
    const { state, boat, unit, land, inward } = scene();
    unit.x += inward.x * 20;
    unit.y += inward.y * 20;
    unit.carry = { resource: 'wood', amount: 3 };
    expect(assignBoarding(state, boat, [unit]).ok).toBe(true);
    processWork(state, unit, 0.25);
    expect(unit.boatId).toBeUndefined();
    expect(isDryLandPoint(state, unit)).toBe(true);
    for (let step = 0; !unit.embarkFrom && step < 100; step++) processWork(state, unit, 0.25);
    expect(unit.embarkFrom).toEqual(land);
    processWork(state, unit, 0.25);
    expect(unit.boatId).toBeUndefined();
    expect(Math.hypot(unit.x - land.x, unit.y - land.y)).toBeCloseTo(1);
    expect(validSave(state)).toBe(true);
    for (let step = 0; !unit.boatId && step < 100; step++) processWork(state, unit, 0.25);
    expect(unit).toMatchObject({
      boatId: boat.id,
      x: boat.x,
      y: boat.y,
      carry: { resource: 'wood', amount: 3 },
    });
    expect(boatCargoAmount(state, boat)).toBe(3);
    expect(validSave(state)).toBe(true);
  });

  it('keeps a deceased artisan’s paid unfinished hull resumable by a different adult', () => {
    const { state, unit, harbor, land } = scene();
    state.boats = [];
    state.resources.wood = 15;
    state.resources.tool = 1;
    const hull = beginBoatBuild(state, unit, harbor).boat!;
    processWork(state, unit, 3);
    killUnit(state, unit);
    expect(hull).toMatchObject({ status: 'building', progress: 3, builderId: undefined });
    const successor = state.units[1];
    Object.assign(successor, land, { age: 8, hp: 100, hunger: 0, temp: 100 });
    expect(beginBoatBuild(state, successor, harbor).boat).toBe(hull);
    expect(state.resources).toMatchObject({ wood: 0, tool: 0 });
    processWork(state, successor, 17);
    expect(hull.status).toBe('moored');
    expect(validSave(state)).toBe(true);
  });

  it('rejects a whole group beyond three seats and counts personal cargo in the hold limit', () => {
    const { state, boat, land } = scene();
    const crew = state.units.slice(0, 4);
    for (const unit of crew) Object.assign(unit, { ...land, age: 8, hp: 100 });
    expect(canBoardBoat(state, boat, crew)).toMatch(/posti/);
    expect(boat.passengerIds).toEqual([]);
    crew[0].carry = { resource: 'wood', amount: 3 };
    boat.resources.stone = 18;
    expect(canBoardBoat(state, boat, [crew[0]])).toMatch(/carico/);
    boat.resources.stone = 17;
    expect(canBoardBoat(state, boat, [crew[0]])).toBeUndefined();
  });

  it('reserves a boarding person’s load before an already assigned loader reaches the hold', () => {
    const { state, boat, unit, land, inward } = scene();
    const loader = state.units[1];
    Object.assign(loader, land, {
      age: 8,
      hp: 100,
      hunger: 0,
      temp: 100,
      carry: { resource: 'wood', amount: 3 },
    });
    Object.assign(unit, {
      x: land.x + inward.x * 20,
      y: land.y + inward.y * 20,
      carry: { resource: 'wood', amount: 3 },
    });
    boat.resources.wood = 17;
    expect(assignCargoTransfer(state, boat, [loader], 'wood', 'load').ok).toBe(true);
    expect(assignBoarding(state, boat, [unit]).ok).toBe(true);
    expect(boatReservedCargoAmount(state, boat)).toBe(3);
    expect(boatFreeCapacity(state, boat)).toBe(0);
    expect(canTransferCargo(state, boat, [loader], 'wood', 'load')).toMatch(/piena/);
    processWork(state, loader, 2);
    expect(boat.resources.wood).toBe(17);
    expect(loader.carry).toEqual({ resource: 'wood', amount: 3 });
    expect(validSave(state)).toBe(true);
    for (let step = 0; !unit.boatId && step < 100; step++) processWork(state, unit, 0.25);
    expect(unit.boatId).toBe(boat.id);
    expect(boatReservedCargoAmount(state, boat)).toBe(0);
    expect(boatCargoAmount(state, boat)).toBe(20);
    expect(boatFreeCapacity(state, boat)).toBe(0);
    expect(validSave(state)).toBe(true);
    expect(parseGame(serializeGame(state))).not.toBeNull();
  });

  it('does not count an earlier boarding reservation twice when admitting a second loaded adult', () => {
    const { state, boat, unit, land } = scene();
    boat.resources.wood = 15;
    unit.carry = { resource: 'wood', amount: 3 };
    const other = state.units[1];
    Object.assign(other, land, { age: 8, hp: 100, carry: { resource: 'stone', amount: 2 } });
    expect(assignBoarding(state, boat, [unit]).ok).toBe(true);
    expect(boatFreeCapacity(state, boat)).toBe(2);
    expect(canBoardBoat(state, boat, [other])).toBeUndefined();
    expect(assignBoarding(state, boat, [other]).ok).toBe(true);
    expect(boatReservedCargoAmount(state, boat)).toBe(5);
    expect(boatFreeCapacity(state, boat)).toBe(0);
    expect(validSave(state)).toBe(true);
  });

  it('sails with finite speed, pauses, survives save/reload, and lands physically on an isolated island', () => {
    let { state, boat, unit } = scene();
    board(state, boat, unit);
    const access = islandAccess(state);
    expect(planLandRoute(state, state.home, access.land)).toBeNull();
    expect(assignSailing(state, boat, access.water, access.land).ok).toBe(true);
    const start = { x: boat.x, y: boat.y };
    state.paused = true;
    updateMaritime(state, 1);
    expect(boat).toMatchObject(start);
    expect(tick(state, 1)).toBe(state);
    state.paused = false;
    updateMaritime(state, 0.25);
    expect(Math.hypot(boat.x - start.x, boat.y - start.y)).toBeLessThanOrEqual(2 + 1e-7);
    expect(unit).toMatchObject({ x: boat.x, y: boat.y });
    expect(validSave(state)).toBe(true);
    const restored = parseGame(serializeGame(state));
    expect(restored).not.toBeNull();
    state = restored!;
    state.paused = false;
    boat = state.boats![0];
    unit = state.units[0];
    for (let step = 0; boat.status === 'sailing' && step < 600; step++) updateMaritime(state, 0.25);
    expect(boat.status).toBe('landing');
    expect(isSeaPoint(state, unit)).toBe(true);
    expect(validSave(state)).toBe(true);
    processWork(state, unit, 0.25);
    expect(unit.boatId).toBe(boat.id);
    expect(validSave(state)).toBe(true);
    for (let step = 0; unit.boatId && step < 100; step++) {
      processWork(state, unit, 0.25);
      updateMaritime(state, 0.25);
    }
    expect(unit.boatId).toBeUndefined();
    expect(unit).toMatchObject(access.land);
    expect(boat).toMatchObject({ status: 'moored', accessLand: access.land });
    expect(isDryLandPoint(state, unit)).toBe(true);
    expect(validSave(state)).toBe(true);
  });

  it('loads and unloads carried stock only through actual shore trips', () => {
    const { state, boat, unit, land } = scene();
    const source = pile(state, 'wood', 3, land);
    expect(assignCargoTransfer(state, boat, [unit], 'wood', 'load').ok).toBe(true);
    cycles(state, unit, 2);
    expect(source.amount).toBe(2);
    expect(unit.carry).toEqual({ resource: 'wood', amount: 1 });
    expect(boat.resources.wood).toBe(0);
    cycles(state, unit, 2);
    expect(boat.resources.wood).toBe(1);
    expect(unit.carry).toBeUndefined();
    resetUnitWithState(state, unit);
    expect(assignCargoTransfer(state, boat, [unit], 'wood', 'unload').ok).toBe(true);
    cycles(state, unit, 2);
    expect(boat.resources.wood).toBe(0);
    expect(unit.carry).toEqual({ resource: 'wood', amount: 1 });
    expect(state.resources.wood).toBe(0);
    expect(validSave(state)).toBe(true);
    for (let step = 0; unit.carry && step < 1000; step++) processWork(state, unit, 0.25);
    expect(unit.carry).toBeUndefined();
    expect(state.resources.wood).toBe(1);
    expect(validSave(state)).toBe(true);
  });

  it('keeps a nearby beach separate from the harbor berth, and associates only the exact harbor arrival', () => {
    const { state, boat, unit, harbor, land, coast } = scene();
    board(state, boat, unit);
    const nearbyLand = { ...land };
    if (coast.side === 'north' || coast.side === 'south') nearbyLand.x += 0.5;
    else nearbyLand.y += 0.5;
    const nearbyAccess = findShoreAccess(state, nearbyLand)!;
    expect(
      Math.hypot(
        nearbyAccess.water.x - harbor.seaAccess!.x,
        nearbyAccess.water.y - harbor.seaAccess!.y,
      ),
    ).toBeGreaterThan(0.1);
    expect(assignSailing(state, boat, nearbyAccess.water, nearbyLand).ok).toBe(true);
    updateMaritime(state, 10);
    processWork(state, unit, 10);
    updateMaritime(state, 0.25);
    expect(boat).toMatchObject({ status: 'moored', accessLand: nearbyLand });
    expect(boat.harborId).toBeUndefined();
    expect(validSave(state)).toBe(true);
    expect(parseGame(serializeGame(state))).not.toBeNull();
    board(state, boat, unit);
    expect(assignSailing(state, boat, harbor.seaAccess!, land).ok).toBe(true);
    updateMaritime(state, 10);
    processWork(state, unit, 10);
    updateMaritime(state, 0.25);
    expect(boat).toMatchObject({ status: 'moored', accessLand: land, harborId: harbor.id });
    expect(validSave(state)).toBe(true);
    expect(parseGame(serializeGame(state))).not.toBeNull();
  });

  it('refuses nonexistent or mismatched loads and unloads island stock into a real shore pile', () => {
    const { state, boat, unit } = scene();
    expect(canTransferCargo(state, boat, [unit], 'stone', 'load')).toMatch(/scorte/);
    unit.carry = { resource: 'fish', amount: 1 };
    expect(canTransferCargo(state, boat, [unit], 'wood', 'load')).toMatch(/diverso/);
    unit.carry = undefined;
    const access = islandAccess(state);
    Object.assign(boat, access.water, { accessLand: access.land, harborId: undefined });
    Object.assign(unit, access.land);
    boat.resources.stone = 1;
    expect(assignCargoTransfer(state, boat, [unit], 'stone', 'unload').ok).toBe(true);
    cycles(state, unit, 2.25);
    expect(state.resources.stone).toBe(0);
    expect(boat.resources.stone).toBe(0);
    expect(
      state.entities
        .filter(
          (e) =>
            e.kind === 'ground' &&
            e.resource === 'stone' &&
            Math.hypot(e.x - access.land.x, e.y - access.land.y) < 0.01,
        )
        .reduce((sum, e) => sum + e.amount, 0),
    ).toBe(1);
    expect(validSave(state)).toBe(true);
  });

  it('returns gathered island loads to the waiting boat without crediting the camp', () => {
    const { state, boat, unit } = scene();
    const access = islandAccess(state);
    Object.assign(boat, access.water, { accessLand: access.land, harborId: undefined });
    Object.assign(unit, access.land, {
      action: 'returning',
      carry: { resource: 'stone', amount: 3 },
      command: ['S_01', 'V_04', 'O_02'],
    });
    cycles(state, unit, 2);
    expect(boat.resources.stone).toBe(3);
    expect(state.resources.stone).toBe(0);
    expect(unit.carry).toBeUndefined();
    expect(validSave(state)).toBe(true);
  });

  it('continues city passengers’ hunger and cold using only provisions actually aboard', () => {
    const { state, boat, unit } = scene();
    board(state, boat, unit);
    state.urbanized = true;
    unit.cityId = state.cities[0].id;
    unit.hunger = 70;
    boat.resources.cookedFish = 1;
    const homeFood = (state.resources.cookedFish = 12);
    const cityFood = (state.cities[0].resources.cookedFish = 12);
    updateUnits(state, 1);
    expect(unit.hunger).toBeLessThan(20);
    expect(boat.resources.cookedFish).toBe(0);
    expect(state.resources.cookedFish).toBe(homeFood);
    expect(state.cities[0].resources.cookedFish).toBe(cityFood);
    unit.hunger = 100;
    unit.temp = 0;
    const hp = unit.hp;
    updateUnits(state, 1);
    expect(unit.hp).toBeLessThan(hp);
    expect(unit).toMatchObject({ x: boat.x, y: boat.y, boatId: boat.id });
  });

  it('preserves carried material on death and stops a vessel without a living adult', () => {
    const { state, boat, unit } = scene();
    unit.carry = { resource: 'wood', amount: 3 };
    board(state, boat, unit);
    const access = islandAccess(state);
    expect(assignSailing(state, boat, access.water, access.land).ok).toBe(true);
    killUnit(state, unit);
    updateMaritime(state, 0.25);
    expect(boat).toMatchObject({
      passengerIds: [],
      status: 'moored',
      route: undefined,
      destination: undefined,
    });
    expect(boat.resources.wood).toBe(3);
    expect(unit.boatId).toBeUndefined();
    expect(validSave(state)).toBe(true);
  });

  it('does not duplicate a personal ration when a real raw-fish meal kills its passenger', () => {
    const { state, boat, unit } = scene();
    unit.carry = { resource: 'fish', amount: 2 };
    board(state, boat, unit);
    unit.hp = 10;
    unit.hunger = 90;
    state.seed = 2000; // The next real simulation draw triggers raw-animal illness.
    expect(consumeMaritimeFood(state, unit, consume)).toBe(true);
    expect(unit.hp).toBe(0);
    expect(unit.carry).toBeUndefined();
    expect(boat.resources.fish).toBe(1);
    expect(boat.passengerIds).toEqual([]);
    expect(
      state.entities
        .filter(
          (e) =>
            e.kind === 'ground' &&
            e.resource === 'fish' &&
            Math.hypot(e.x - boat.x, e.y - boat.y) < 1,
        )
        .reduce((sum, e) => sum + e.amount, 0),
    ).toBe(0);
    expect(validSave(state)).toBe(true);
  });

  it('shares vegetarian meal refusal aboard and keeps remote fires and stores inaccessible', () => {
    const { state, boat, unit } = scene();
    board(state, boat, unit);
    state.dogmas.push({
      id: 'vegetarian',
      targetId: 'O_04',
      vectorId: 'M_01',
      name: 'Vegetariani',
      description: '',
      weight: 1,
      age: 0,
    });
    unit.carry = { resource: 'fish', amount: 2 };
    expect(consumeMaritimeFood(state, unit, consume)).toBe(false);
    expect(unit.carry).toEqual({ resource: 'fish', amount: 2 });
    unit.carry = undefined;
    const access = islandAccess(state);
    boat.passengerIds = [];
    delete unit.boatId;
    Object.assign(unit, access.land, { action: 'idle' });
    createBuilding(state, 'campfire');
    state.resources.wood = 50;
    expect(canCookAt(state, unit)).toBe(false);
    expect(canIgnite(state, unit.x, unit.y)).toBe(false);
  });

  it('spoils real raw and cooked fish in the hold without remote storage bonuses', () => {
    const { state, boat } = scene();
    state.time = 60;
    boat.resources.fish = 4;
    boat.resources.cookedFish = 4;
    boat.resources.wood = 7;
    createBuilding(state, 'storage');
    seasonalCore(state);
    expect(boat.resources.fish).toBeCloseTo(4 * (1 - resourceSpoilage(0.6, false, false, false)));
    expect(boat.resources.cookedFish).toBeCloseTo(
      4 * (1 - resourceSpoilage(0.25, false, false, false)),
    );
    expect(boat.resources.wood).toBeCloseTo(7 * (1 - RESOURCE_SPECS.wood.spoil));
  });
});
