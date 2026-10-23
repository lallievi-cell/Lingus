import { describe, expect, it } from 'vitest';
import { BASE_HOUSING, HOME } from './content';
import { createGame, createReadyBuilding } from './engine';
import {
  eligibleParents,
  fertilityBlockers,
  getGrowthReadiness,
  individualGrowthHint,
  villageHousing,
} from './growthReadiness';
import { seasonalCore } from './simulation';
import type { GameState } from './types';

/** Small family fixtures isolate readiness; these are not ordinary campaigns. */
function family(): GameState {
  const state = createGame(1);
  Object.assign(state, { started: true, cities: [], factions: [], entities: [] });
  state.units = state.units.slice(0, 2);
  for (const unit of state.units)
    Object.assign(unit, {
      ...HOME,
      age: 6,
      hp: 100,
      hunger: 20,
      intelligence: 5,
      sleptThisNight: true,
      action: 'sleeping',
    });
  return state;
}

describe('shared physical conditions for births', () => {
  it('uses completed active owned housing and ignores unfinished, foreign, inactive or destroyed homes', () => {
    const state = family();
    expect(villageHousing(state)).toBe(BASE_HOUSING);
    createReadyBuilding(state, 'house');
    const home = state.buildings[0];
    expect(villageHousing(state)).toBe(BASE_HOUSING + 12);
    home.completed = false;
    expect(villageHousing(state)).toBe(BASE_HOUSING);
    home.completed = true;
    home.active = false;
    expect(villageHousing(state)).toBe(BASE_HOUSING);
    home.active = true;
    home.hp = 0;
    expect(villageHousing(state)).toBe(BASE_HOUSING);
    home.hp = 200;
    home.cityId = 'foreign-city';
    expect(villageHousing(state)).toBe(BASE_HOUSING);
  });

  it('shares the exact food, rest and home requirements, including their boundaries', () => {
    const state = family(),
      unit = state.units[0];
    unit.hunger = 50;
    unit.x = HOME.x + 10;
    expect(fertilityBlockers(state, unit)).toEqual([]);
    unit.hunger = 50.01;
    unit.sleptThisNight = false;
    unit.x = HOME.x + 10.01;
    expect(fertilityBlockers(state, unit)).toEqual(['food', 'rest', 'home']);
  });

  it('uses captured seasonal rest rather than flags already cleared at settlement', () => {
    const state = family();
    const captured = new Set(state.units.map((unit) => unit.id));
    for (const unit of state.units) unit.sleptThisNight = false;
    expect(eligibleParents(state)).toHaveLength(0);
    expect(eligibleParents(state, { restedIds: captured })).toEqual(state.units);
    expect(eligibleParents(state, { restedIds: new Set() })).toHaveLength(0);
  });

  it('accepts daytime biological rest and excludes children, elders, foreigners and dead units', () => {
    const state = family(),
      unit = state.units[0];
    unit.sleptThisNight = false;
    unit.restedThisSeason = true;
    expect(fertilityBlockers(state, unit)).toEqual([]);
    unit.age = 3;
    expect(fertilityBlockers(state, unit)).toEqual(['child']);
    unit.age = 14;
    expect(fertilityBlockers(state, unit)).toEqual(['elder']);
    unit.age = 6;
    unit.factionId = 'foreign';
    expect(fertilityBlockers(state, unit)).toEqual(['foreign']);
    unit.hp = 0;
    expect(fertilityBlockers(state, unit)).toEqual(['dead']);
  });

  it('respects the actual celibate-sage dogma without excluding other adults', () => {
    const state = family();
    state.units[0].intelligence = 8;
    state.dogmas = [
      {
        id: 'celibacy',
        targetId: 'S_04',
        vectorId: 'V_05',
        name: 'Celibato',
        description: 'Test',
        age: 0,
        weight: 10,
      },
    ];
    expect(fertilityBlockers(state, state.units[0])).toContain('dogma');
    expect(fertilityBlockers(state, state.units[1])).toEqual([]);
    expect(getGrowthReadiness(state).blockers).toContain('dogma');
  });

  it('does not grant a birth into an unfinished house when the initial housing is already full', () => {
    const state = family();
    const originals = [...state.units];
    state.units = Array.from({ length: BASE_HOUSING }, (_, i) => ({
      ...originals[i % 2],
      id: `parent-${i}`,
      knows: [...originals[i % 2].knows],
    }));
    createReadyBuilding(state, 'house');
    state.buildings[0].completed = false;
    state.time = 90;
    expect(getGrowthReadiness(state).blockers).toEqual(['housing']);
    seasonalCore(state);
    expect(state.stats.births).toBe(0);
    expect(state.units).toHaveLength(BASE_HOUSING);
    state.buildings[0].completed = true;
    expect(villageHousing(state)).toBe(BASE_HOUSING + 12);
  });
});

describe('readiness is a conditional view of the next seasonal check', () => {
  it('reports an available rested pair without promising a birth', () => {
    const state = family();
    const ready = getGrowthReadiness(state);
    expect(ready).toMatchObject({
      candidateMales: 1,
      candidateFemales: 1,
      readyPairs: 1,
      blockers: [],
      freePlaces: BASE_HOUSING - 2,
    });
    expect(individualGrowthHint(state, state.units[0])).toContain('non una certezza');
  });

  it('explains food, rest and distance changes that prevent the best available pair', () => {
    const state = family();
    Object.assign(state.units[1], { hunger: 51, sleptThisNight: false, x: HOME.x + 11 });
    expect(getGrowthReadiness(state).blockers).toEqual(['food', 'rest', 'home']);
    expect(individualGrowthHint(state, state.units[1])).toContain('futuri genitori sazi');
    Object.assign(state.units[1], { hunger: 50, restedThisSeason: true, ...HOME });
    expect(getGrowthReadiness(state).readyPairs).toBe(1);
  });

  it.each(['M', 'F'] as const)('identifies the missing opposite sex for an all-%s group', (sex) => {
    const state = family();
    for (const unit of state.units) unit.sex = sex;
    expect(getGrowthReadiness(state)).toMatchObject({
      readyPairs: 0,
      blockers: ['partner'],
      missingSex: sex === 'M' ? 'F' : 'M',
    });
    expect(individualGrowthHint(state, state.units[0])).toContain('serve anche un partner');
  });

  it('does not call other hungry adults a blocker if one real pair is ready', () => {
    const state = family();
    state.units.push({ ...state.units[0], id: 'hungry-adult', hunger: 100, sleptThisNight: false });
    expect(getGrowthReadiness(state)).toMatchObject({ readyPairs: 1, blockers: [] });
  });

  it('forecasts the age increment: a nearly adult child can qualify, an outgoing adult cannot', () => {
    const state = family();
    state.units[0].age = 3;
    expect(eligibleParents(state)).toHaveLength(1);
    expect(getGrowthReadiness(state).readyPairs).toBe(1);
    state.units[0].age = 13;
    expect(eligibleParents(state)).toHaveLength(2);
    expect(getGrowthReadiness(state).readyPairs).toBe(0);
    expect(individualGrowthHint(state, state.units[0])).toContain('entrerà nell’età anziana');
    state.time = 90;
    seasonalCore(state);
    expect(state.units[0].age).toBe(14);
    expect(state.stats.births).toBe(0);
  });

  it('carries a rested future adult through the same seasonal check shown by the forecast', () => {
    const state = family();
    state.units[0].age = 3;
    state.time = 90;
    expect(getGrowthReadiness(state).readyPairs).toBe(1);
    seasonalCore(state);
    expect(state.units[0].age).toBe(4);
    expect(state.units.slice(0, 2).every((unit) => !unit.sleptThisNight)).toBe(true);
    expect(state.stats.births).toBe(1);
    expect(state.units.find((unit) => unit.age === 0)?.parentIds).toEqual(
      state.units.slice(0, 2).map((unit) => unit.id),
    );
  });

  it('keeps children and elders out of growth promises and distinguishes the urban model', () => {
    const state = family();
    state.units[0].age = 2;
    expect(individualGrowthHint(state, state.units[0])).toContain('Cresce ancora');
    state.units[0].age = 14;
    expect(individualGrowthHint(state, state.units[0])).toContain('tramandare');
    state.urbanized = true;
    expect(getGrowthReadiness(state).urbanized).toBe(true);
    expect(individualGrowthHint(state, state.units[0])).toContain('insediamento');
  });
});
