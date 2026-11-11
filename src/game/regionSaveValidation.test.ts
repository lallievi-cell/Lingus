import { describe, expect, it } from 'vitest';
import { emptyInventory } from './content';
import { parseGame, serializeGame } from './engine';
import { createInitialState } from './state';
import { validSave } from './saveValidation';
import type { GameState } from './types';

function regionalSave() {
  const state = createInitialState(42, 'classic', 'random', 1000);
  state.time = 20;
  const city = state.cities[0];
  Object.assign(city, { x: 850, y: 900, sectorX: 8, sectorY: 9 });
  Object.assign(state.units[0], {
    x: 900,
    y: 950,
    action: 'moving',
    tx: 1000,
    ty: 1000,
    workOrigin: { x: 850, y: 900 },
    lastTaskResult: {
      time: 0,
      tokens: ['S_01', 'V_01'],
      reason: 'completed',
      suspended: false,
      target: { type: 'point', x: 900, y: 950 },
    },
  });
  state.entities[0].originX = 950;
  state.entities[0].originY = 950;
  state.buildings.push({
    id: 'regional-store',
    kind: 'storage',
    x: 850,
    y: 900,
    hp: 100,
    active: true,
  });
  state.battalions = [
    {
      id: 'regional-army',
      name: 'Regional army',
      x: 900,
      y: 950,
      cityId: city.id,
      factionId: city.factionId,
      hp: 100,
      maxHp: 100,
      morale: 100,
      action: 'moving',
      catapult: false,
      occupation: 0,
      tx: 1000,
      ty: 1000,
      target: { type: 'point', x: 950, y: 950 },
      lastSiegeShot: {
        time: 0,
        cityId: city.id,
        wallId: 'regional-wall',
        fromX: 950,
        fromY: 975,
        damage: 5,
      },
    },
  ];
  state.caravans = [
    {
      id: 'regional-caravan',
      kind: 'trade',
      x: 900,
      y: 950,
      fromCityId: city.id,
      factionId: city.factionId,
      resources: emptyInventory(),
      population: 1,
      hp: 100,
      target: { type: 'point', x: 950, y: 950 },
    },
  ];
  state.regionalRoutes = [
    {
      key: '0:0:68:72',
      from: { x: 850, y: 900 },
      to: { x: 862.5, y: 900 },
      travelled: 12.5,
    },
  ];
  state.traditions = [
    {
      id: 'regional-tradition',
      tokens: ['S_01', 'V_01'],
      createdAt: 0,
      target: { type: 'point', x: 900, y: 950 },
    },
  ];
  state.foreignPolicy = {
    raids: [
      {
        id: 'regional-raid',
        factionId: city.factionId,
        originCityId: city.id,
        memberIds: state.units.slice(0, 2).map((unit) => unit.id),
        phase: 'approaching',
        resources: emptyInventory(),
        startedAt: 0,
        progress: 0,
        target: { x: 950, y: 950 },
      },
    ],
    ultimata: [],
    relations: [],
  };
  state.explored.push({ x: 1000, y: 1000 });
  return state;
}

describe('regional save boundaries', () => {
  it('round-trips an actual generated region and its nested journeys beyond the old valley', () => {
    const state = regionalSave();
    expect(state.mapGeneration?.worldSize).toBe(1000);
    expect(state.sectors).toHaveLength(100);
    expect(state.entities.some((entity) => entity.x > 500 || entity.y > 500)).toBe(true);
    expect(validSave(state)).toBe(true);
    expect(parseGame(serializeGame(state))).toEqual({ ...state, paused: true });
  });

  const outside: [string, (state: GameState) => void][] = [
    [
      'home',
      (state) => {
        state.home.x = 1000.1;
      },
    ],
    [
      'person',
      (state) => {
        state.units[0].x = 1001;
      },
    ],
    [
      'person destination',
      (state) => {
        state.units[0].tx = 1001;
      },
    ],
    [
      'work origin',
      (state) => {
        state.units[0].workOrigin!.y = 1001;
      },
    ],
    [
      'previous task destination',
      (state) => {
        state.units[0].lastTaskResult!.target!.x = 1001;
      },
    ],
    [
      'animal origin',
      (state) => {
        state.entities[0].originX = 1001;
      },
    ],
    [
      'city',
      (state) => {
        state.cities[0].x = 1001;
      },
    ],
    [
      'city sector',
      (state) => {
        state.cities[0].sectorX = 10;
      },
    ],
    [
      'building',
      (state) => {
        state.buildings[0].x = 1001;
      },
    ],
    [
      'army destination',
      (state) => {
        state.battalions[0].target!.x = 1001;
      },
    ],
    [
      'army movement',
      (state) => {
        state.battalions[0].tx = 1001;
      },
    ],
    [
      'siege origin',
      (state) => {
        state.battalions[0].lastSiegeShot!.fromY = 1001;
      },
    ],
    [
      'caravan destination',
      (state) => {
        state.caravans[0].target.y = 1001;
      },
    ],
    [
      'road geometry',
      (state) => {
        state.regionalRoutes![0].to.x = 1001;
      },
    ],
    [
      'tradition destination',
      (state) => {
        state.traditions[0].target!.y = 1001;
      },
    ],
    [
      'raiding destination',
      (state) => {
        state.foreignPolicy!.raids[0].target.y = 1001;
      },
    ],
    [
      'exploration',
      (state) => {
        state.explored[0].x = 1001;
      },
    ],
    [
      'sector coordinate',
      (state) => {
        state.sectors[0].x = 10;
      },
    ],
  ];
  it.each(outside)('rejects an out-of-region %s', (_, mutate) => {
    const state = regionalSave();
    mutate(state);
    expect(validSave(state)).toBe(false);
  });

  it('keeps legacy bounds strict when validation alternates between world sizes', () => {
    const region = regionalSave();
    const valley = createInitialState(42, 'classic', 'random');
    expect(validSave(region)).toBe(true);
    expect(validSave(valley)).toBe(true);
    const broken = structuredClone(valley);
    broken.units[0].x = 750;
    expect(validSave(broken)).toBe(false);
    expect(validSave(region)).toBe(true);
    expect(validSave(valley)).toBe(true);
    delete region.mapGeneration!.worldSize;
    expect(validSave(region)).toBe(false);
  });

  it.each([500, 750, 2000, '1000', true, null])(
    'rejects malformed world-size metadata %j',
    (size) => {
      const state = regionalSave();
      state.mapGeneration!.worldSize = size as never;
      expect(validSave(state)).toBe(false);
    },
  );

  it('requires a complete region with unique integer sector coordinates', () => {
    const state = regionalSave();
    state.sectors.pop();
    expect(validSave(state)).toBe(false);
    const duplicate = regionalSave();
    Object.assign(duplicate.sectors[1], { x: duplicate.sectors[0].x, y: duplicate.sectors[0].y });
    expect(validSave(duplicate)).toBe(false);
    const fractional = regionalSave();
    fractional.sectors[0].x = 0.5;
    expect(validSave(fractional)).toBe(false);
    const seedZero = regionalSave();
    seedZero.mapGeneration!.mode = 'seed-zero';
    expect(validSave(seedZero)).toBe(false);
    const noLandRoutes = regionalSave();
    delete noLandRoutes.mapGeneration!.landNavigation;
    expect(validSave(noLandRoutes)).toBe(false);
  });
});
