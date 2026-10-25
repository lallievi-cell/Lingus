import { describe, expect, it } from 'vitest';
import { emptyInventory } from './content';
import { createGame, parseGame, serializeGame } from './engine';
import { updateImperial } from './imperial';
import { recordCaravanTravel, REGIONAL_ROUTE_LIMIT } from './regionalHistory';
import { validSave } from './saveValidation';
import type { Battalion, Caravan, GameState } from './types';

const caravan = (overrides: Partial<Caravan> = {}): Caravan => ({
  id: 'travel-test',
  kind: 'tax',
  x: 250,
  y: 250,
  fromCityId: 'source',
  factionId: 'player',
  resources: emptyInventory(),
  population: 0,
  target: { type: 'point', x: 350, y: 250 },
  hp: 100,
  ...overrides,
});
const length = (state: GameState) =>
  (state.regionalRoutes ?? []).reduce(
    (sum, segment) =>
      sum + Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y),
    0,
  );
const travelled = (state: GameState) =>
  (state.regionalRoutes ?? []).reduce((sum, segment) => sum + segment.travelled, 0);
function record(state: GameState, fromX: number, toX: number, y = 250) {
  recordCaravanTravel(state, caravan({ x: toX, y }), { x: fromX, y });
}

describe('persistent regional visual history', () => {
  it('records only actual trade/tax movement and leaves the rest of the route absent', () => {
    const state = createGame(6842);
    state.factions = [];
    state.cities = [];
    state.caravans = [caravan()];
    const beforeSeed = state.seed;
    updateImperial(state, 0.25);
    expect(state.caravans[0].x).toBe(251);
    expect(length(state)).toBeCloseTo(1);
    expect(travelled(state)).toBeCloseTo(1);
    expect(state.regionalRoutes?.every((s) => s.from.x >= 250 && s.to.x <= 251)).toBe(true);
    expect(state.seed).toBe(beforeSeed);
    expect(state.caravans[0].resources).toEqual(emptyInventory());
  });

  it('is independent from tick size, accumulates repeated traversals and survives version-two saves', () => {
    const single = createGame(6842),
      stepped = createGame(6842);
    record(single, 250, 300);
    for (let x = 250; x < 300; x += 0.5) record(stepped, x, x + 0.5);
    expect(stepped.regionalRoutes).toEqual(single.regionalRoutes);
    record(single, 300, 250);
    expect(length(single)).toBeCloseTo(50);
    expect(travelled(single)).toBeCloseTo(100);
    expect(validSave(single)).toBe(true);
    expect(parseGame(serializeGame(single))?.regionalRoutes).toEqual(single.regionalRoutes);
    expect(parseGame(serializeGame(createGame(6842)))?.regionalRoutes).toBeUndefined();
  });

  it('keeps disconnected visits separate until traffic really crosses the gap', () => {
    const state = createGame(6842);
    record(state, 100, 102);
    record(state, 110, 112);
    expect(state.regionalRoutes).toHaveLength(2);
    expect(length(state)).toBeCloseTo(4);
    expect(state.regionalRoutes?.some((s) => s.from.x <= 103 && s.to.x >= 109)).toBe(false);
    record(state, 102, 110);
    expect(state.regionalRoutes).toHaveLength(1);
    expect(length(state)).toBeCloseTo(12);
    expect(travelled(state)).toBeCloseTo(12);
    expect(validSave(state)).toBe(true);
  });

  it('retains the same diagonal corridor across differently sized movement samples', () => {
    const single = createGame(6842),
      stepped = createGame(6842);
    recordCaravanTravel(single, caravan({ x: 317, y: 289 }), { x: 211, y: 203 });
    let previous = { x: 211, y: 203 };
    for (let step = 1; step <= 73; step++) {
      const next = { x: 211 + (106 * step) / 73, y: 203 + (86 * step) / 73 };
      recordCaravanTravel(stepped, caravan(next), previous);
      previous = next;
    }
    expect(validSave(stepped)).toBe(true);
    expect(stepped.regionalRoutes?.map((piece) => piece.key)).toEqual(
      single.regionalRoutes?.map((piece) => piece.key),
    );
    expect(length(stepped)).toBeCloseTo(length(single), 6);
    expect(travelled(stepped)).toBeCloseTo(travelled(single), 6);
    for (let i = 0; i < single.regionalRoutes!.length; i++) {
      expect(stepped.regionalRoutes![i].from.x).toBeCloseTo(single.regionalRoutes![i].from.x, 6);
      expect(stepped.regionalRoutes![i].to.y).toBeCloseTo(single.regionalRoutes![i].to.y, 6);
    }
  });

  it('cannot fabricate wear for a stopped, dead, arrived or non-commercial traveller', () => {
    const state = createGame(6842);
    const previous = { x: 250, y: 250 };
    for (const c of [
      caravan(),
      caravan({ x: 252, hp: 0 }),
      caravan({ x: 252, arrived: true }),
      caravan({ x: 252, customsRefused: true }),
      caravan({ x: 252, kind: 'delegate' }),
      caravan({ x: 252, kind: 'colonists' }),
    ])
      recordCaravanTravel(state, c, previous);
    expect(state.regionalRoutes).toBeUndefined();
    recordCaravanTravel(
      state,
      caravan({ x: 252, customsRefused: true, returning: true }),
      previous,
    );
    expect(length(state)).toBeCloseTo(2);
  });

  it('bounds history and rejects invalid or oversized imported visual data', () => {
    const state = createGame(6842);
    state.regionalRoutes = Array.from({ length: REGIONAL_ROUTE_LIMIT }, (_, i) => ({
      key: `0:${i * 5}:0:0`,
      from: { x: 0.1, y: i * 0.005 },
      to: { x: 1, y: i * 0.005 },
      travelled: 0.9,
    }));
    expect(validSave(state)).toBe(true);
    record(state, 250, 252);
    expect(state.regionalRoutes).toHaveLength(REGIONAL_ROUTE_LIMIT);
    expect(validSave(state)).toBe(true);
    const valid = structuredClone(state.regionalRoutes);
    state.regionalRoutes.push({ ...valid[0], key: '0:0:1:1' });
    expect(validSave(state)).toBe(false);
    state.regionalRoutes = [{ ...valid[0], travelled: Infinity }];
    expect(validSave(state)).toBe(false);
    state.regionalRoutes = [{ ...valid[0], to: { x: 501, y: 250 } }];
    expect(validSave(state)).toBe(false);
    state.regionalRoutes = [valid[0], { ...valid[0] }];
    expect(validSave(state)).toBe(false);
  });
});

describe('real catapult impact observation', () => {
  it('records only real wall damage after arrival, with capped HP loss and unchanged attack cadence', () => {
    const state = createGame(6842);
    state.factions = [];
    state.urbanized = true;
    state.tier = 4;
    state.time = 12;
    const source = state.cities[0],
      target = state.cities[1];
    source.factionId = 'player';
    source.capital = true;
    source.resources = state.resources;
    Object.assign(target, { x: 300, y: 250, garrisonHp: 0 });
    state.cities = [source, target];
    const wall = {
      id: 'target-walls',
      kind: 'walls' as const,
      cityId: target.id,
      x: target.x,
      y: target.y,
      hp: 250,
      active: true,
      completed: true,
    };
    state.buildings = [wall];
    target.buildingIds = [wall.id];
    const army: Battalion = {
      id: 'siege-test',
      name: 'Siege',
      x: 280,
      y: 250,
      cityId: source.id,
      factionId: 'player',
      hp: 2000,
      maxHp: 2000,
      morale: 1,
      action: 'conquering',
      targetId: target.id,
      catapult: true,
      occupation: 0,
    };
    state.battalions = [army];
    updateImperial(state, 0.25);
    expect(army.lastSiegeShot).toBeUndefined();
    expect(wall.hp).toBe(250);
    army.x = 299;
    for (let i = 0; i < 3; i++) updateImperial(state, 0.25);
    expect(army.lastSiegeShot).toBeUndefined();
    updateImperial(state, 0.25);
    expect(wall.hp).toBe(50);
    expect(army.lastSiegeShot).toEqual({
      time: 12,
      cityId: target.id,
      wallId: wall.id,
      fromX: 299,
      fromY: 250,
      damage: 200,
    });
    state.time = 13;
    for (let i = 0; i < 4; i++) updateImperial(state, 0.25);
    expect(wall.hp).toBe(0);
    expect(army.lastSiegeShot?.damage).toBe(50);
    expect(validSave(state)).toBe(true);
    const shot = structuredClone(army.lastSiegeShot!);
    army.lastSiegeShot = { ...shot, time: 14 };
    expect(validSave(state)).toBe(false);
    army.lastSiegeShot = { ...shot, damage: 0 };
    expect(validSave(state)).toBe(false);
    army.lastSiegeShot = { ...shot, fromX: -1 };
    expect(validSave(state)).toBe(false);
  });
});
