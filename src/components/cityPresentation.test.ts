import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, emptyInventory } from '../game/content';
import { createGame } from '../game/engine';
import { registerTradition } from '../game/imperial';
import type { Building, BuildingKind, GameState } from '../game/types';
import { getCityPresentation } from './cityPresentation';
import { targetPresentation } from './targetPresentation';

function fixture() {
  const state = createGame(6842);
  state.tier = 4;
  state.urbanized = true;
  state.started = true;
  const city = state.cities[0];
  city.factionId = 'player';
  city.resources = emptyInventory();
  for (const id of ['C_02', 'S_09', 'V_09', 'O_04', 'V_12', 'O_07', 'V_11', 'O_12'])
    state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
  return state;
}

function building(state: GameState, kind: BuildingKind, patch: Partial<Building> = {}) {
  const city = state.cities[0];
  const result: Building = {
    id: `${kind}-landmark`,
    kind,
    cityId: city.id,
    x: city.x,
    y: city.y,
    active: true,
    completed: true,
    hp: BUILDING_SPECS[kind].maxHp,
    ...patch,
  };
  state.buildings.push(result);
  city.buildingIds.push(result.id);
  return result;
}

describe('regional city identity', () => {
  it('follows both real registered city vocations without creating institutions or stocks', () => {
    let state = fixture();
    const target = {
      type: 'city' as const,
      id: state.cities[0].id,
      x: state.cities[0].x,
      y: state.cities[0].y,
    };
    state = registerTradition(state, ['C_02', 'S_09', 'V_09', 'O_04'], target);
    state = registerTradition(state, ['C_02', 'S_09', 'V_12', 'O_07'], target);
    const before = structuredClone(state);
    const profile = getCityPresentation(state, state.cities[0]);
    expect(profile.vocations).toEqual(['agriculture', 'industry']);
    expect(profile.farms).toEqual([]);
    expect(profile.foundries).toEqual([]);
    expect(profile.productiveFoundries).toEqual([]);
    expect(state).toEqual(before);
  });

  it('distinguishes an actual productive furnace from specialization and paid upkeep alone', () => {
    const state = fixture();
    const city = state.cities[0];
    const furnace = building(state, 'foundry', { lastEfficiency: 1 });
    expect(getCityPresentation(state, city).foundries).toEqual([furnace]);
    expect(getCityPresentation(state, city).productiveFoundries).toEqual([]);
    Object.assign(city.resources, { ore: 0.5, wood: 1 });
    expect(getCityPresentation(state, city).productiveFoundries).toEqual([furnace]);
    furnace.lastEfficiency = 0;
    expect(getCityPresentation(state, city).productiveFoundries).toEqual([]);
    furnace.lastEfficiency = 1;
    furnace.active = false;
    expect(getCityPresentation(state, city).foundries).toEqual([furnace]);
    expect(getCityPresentation(state, city).productiveFoundries).toEqual([]);
  });

  it('preserves physical walls through inactivity and shows real damage or demolition', () => {
    const state = fixture();
    const city = state.cities[0];
    const walls = building(state, 'walls', { hp: BUILDING_SPECS.walls.maxHp / 4, active: false });
    let profile = getCityPresentation(state, city);
    expect(profile.walls).toEqual(walls);
    expect(profile.wallIntegrity).toBe(0.25);
    expect(profile.ruinedWalls).toBe(false);
    walls.hp = 0;
    profile = getCityPresentation(state, city);
    expect(profile.walls).toBeUndefined();
    expect(profile.wallIntegrity).toBe(0);
    expect(profile.ruinedWalls).toBe(true);
  });

  it('requires the city’s completed palace or farm rather than a title or a foreign building', () => {
    const state = fixture();
    const city = state.cities[0];
    city.capital = true;
    building(state, 'palace', { cityId: state.cities[1].id });
    const farm = building(state, 'farm', { completed: false });
    let profile = getCityPresentation(state, city);
    expect(profile.palace).toBeUndefined();
    expect(profile.farms).toEqual([]);
    farm.completed = true;
    const palace = building(state, 'palace');
    profile = getCityPresentation(state, city);
    expect(profile.palace).toEqual(palace);
    expect(profile.farms).toEqual([farm]);
    palace.hp = 0;
    expect(getCityPresentation(state, city).palace).toBeUndefined();
  });

  it('explains real occupation to the player without revealing exact time before Numero', () => {
    const state = fixture();
    const city = state.cities[0];
    city.factionId = 'foreign';
    city.garrisonHp = 0;
    state.battalions = [
      {
        id: 'occupier',
        name: 'Guardia',
        x: city.x,
        y: city.y,
        cityId: 'home',
        factionId: 'player',
        hp: 1000,
        maxHp: 1000,
        morale: 1,
        action: 'conquering',
        catapult: false,
        occupation: 15,
        targetId: city.id,
      },
    ];
    const target = { type: 'city' as const, id: city.id, x: city.x, y: city.y };
    expect(targetPresentation(state, target)?.stage).toBe('Città sotto assedio');
    expect(targetPresentation(state, target)?.hint).not.toMatch(/\d/);
    state.words.O_08 = { retention: 100, custodians: [], uses: 0 };
    expect(targetPresentation(state, target)?.hint).toContain('15/30 secondi');
    state.battalions[0].action = 'moving';
    city.occupation = 29;
    expect(targetPresentation(state, target)?.stage).toBe('Città');
  });
});
