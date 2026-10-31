import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, emptyInventory, HOME } from './content';
import { dispatchForeignPolicy } from './foreignPolicy';
import { updateDogmas } from './dogmas';
import { seasonalImperial, updateImperial } from './imperial';
import { recordLawWork, seasonalDutyFulfilled } from './imperialLawPolicy';
import { getSeasonReadiness } from './seasonReadiness';
import { createInitialState } from './state';
import { thermalConditionsAt } from './thermal';

function opening(time = 0) {
  const state = createInitialState(6842, 'guided');
  state.openingBalanceVersion = 1;
  state.time = time;
  state.started = true;
  return state;
}

function pantry(time: number) {
  const state = opening(time);
  state.units = state.units.slice(0, 1);
  state.cities = [];
  state.factions = [];
  state.buildings = [];
  state.entities = [];
  state.resources = emptyInventory();
  Object.assign(state.units[0], { ...HOME, age: 6, hp: 100, hunger: 0, temp: 100 });
  return state;
}

describe('the patient opening shares one calendar with climate and economic planning', () => {
  it('changes day, night and winter at their actual new boundaries', () => {
    const state = opening();
    state.disasters.blizzard = false;
    for (const [time, ambient] of [
      [99.9, 55],
      [100, 45],
      [150, 75],
      [450, 20],
      [550, 5],
      [600, 55],
      [660, 45],
    ]) {
      state.time = time;
      expect(thermalConditionsAt(state, state.units[0]).ambient).toBe(ambient);
    }
    delete state.openingBalanceVersion;
    state.time = 60;
    expect(thermalConditionsAt(state, state.units[0]).ambient).toBe(45);
  });

  it('integrates the slower remaining winter and the ordinary next spring in the food forecast', () => {
    const state = pantry(550);
    // Cooked food loses 25% * 0.4 in the first year: 96 nutrition covers 30 equivalent
    // seconds of winter plus 90 of spring, at 0.8 nutrition per second.
    state.resources.cooked = 96 / (60 * 0.9);
    const report = getSeasonReadiness(state);
    expect(report.remaining).toBe(50);
    expect(report.nextSeason).toBe(0);
    expect(report.food[0].safeNutrition).toBeCloseTo(96);
    expect(report.food[0].seconds).toBeCloseTo(140);
    expect(report.food[0].sufficient).toBe(true);
    state.resources.cooked -= 0.01;
    expect(getSeasonReadiness(state).food[0].sufficient).toBe(false);
  });

  it('does not carry the slower food rate beyond the opening-year boundary', () => {
    const state = pantry(600);
    // Year two loses 25% * 0.7, while the food consumption rate is ordinary.
    state.resources.cooked = 96 / (60 * 0.825);
    const report = getSeasonReadiness(state);
    expect(report.remaining).toBe(90);
    expect(report.food[0].seconds).toBeCloseTo(120);
    expect(report.food[0].sufficient).toBe(false);
  });

  it('reserves annual farm and herd upkeep according to the real ending season', () => {
    const state = pantry(149);
    state.buildings = [
      {
        id: 'farm',
        kind: 'farm',
        ...HOME,
        hp: 100,
        active: true,
        completed: true,
      },
      {
        id: 'herd',
        kind: 'pen',
        ...HOME,
        hp: 100,
        active: true,
        completed: true,
        livestock: 2,
      },
    ];
    expect(getSeasonReadiness(state).upkeep.map((entry) => entry.building.id)).toEqual(['farm']);
    state.time = 599;
    expect(getSeasonReadiness(state).upkeep.map((entry) => entry.building.id)).toEqual(['herd']);
  });

  it('credits a completed delivery at the boundary to the season that just ended', () => {
    const state = opening(149.9);
    const duty = { verbId: 'V_04', objectId: 'O_03' };
    recordLawWork(state, 'worker', ['S_01', 'V_04', 'O_03']);
    state.time = 150;
    expect(seasonalDutyFulfilled(state, duty, { id: 'worker' })).toBe(true);
    state.time = 150.01;
    expect(seasonalDutyFulfilled(state, duty, { id: 'worker' })).toBe(false);
    state.time = 600;
    recordLawWork(state, 'worker', ['S_01', 'V_04', 'O_03']);
    expect(seasonalDutyFulfilled(state, duty, { id: 'worker' })).toBe(true);
    state.time = 600.01;
    expect(seasonalDutyFulfilled(state, duty, { id: 'worker' })).toBe(false);
  });

  it('preserves the two-cultural-year grace period before foreign pressure', () => {
    const state = opening(959.9);
    state.tier = 3;
    state.factions = state.factions.slice(0, 1);
    state.cities = state.cities.slice(0, 1);
    state.factions[0].hostile = false;
    state.factions[0].relation = 20;
    dispatchForeignPolicy(state);
    expect(state.eventTimes.foreignPolicyPlan).toBeUndefined();
    state.time = 960;
    dispatchForeignPolicy(state);
    expect(state.eventTimes.foreignPolicyPlan).toBe(960);
  });

  it('keeps urban nutrition and extraction on the same finite season budget', () => {
    const settle = (profile: boolean) => {
      const state = opening(profile ? 150 : 90);
      if (!profile) delete state.openingBalanceVersion;
      state.urbanized = true;
      state.units = [];
      state.factions = [];
      const capital = {
        ...state.cities[0],
        id: 'capital',
        name: 'Campo',
        ...HOME,
        sectorX: 2,
        sectorY: 2,
        factionId: 'player',
        capital: true,
        cohorts: { workers: 2, warriors: 0, sages: 0, slaves: 0 },
        resources: state.resources,
        housing: 0,
        buildingIds: ['depot'],
        vocations: [],
      };
      state.cities = [capital];
      state.resources = { ...emptyInventory(), cooked: 100 };
      state.buildings = [
        {
          id: 'depot',
          kind: 'depot',
          ...HOME,
          hp: BUILDING_SPECS.depot.maxHp,
          active: true,
          completed: true,
          cityId: capital.id,
          workerIds: [],
          lastEfficiency: 1,
        },
      ];
      state.entities = [
        {
          id: 'tree',
          kind: 'tree',
          ...HOME,
          amount: 1000,
          hp: 100,
          maxHp: 100,
        },
      ];
      seasonalImperial(state);
      return { state, capital };
    };
    const patient = settle(true),
      legacy = settle(false);
    expect(patient.capital.seasonFoodConsumed).toBeCloseTo(144);
    expect(patient.state.resources.cooked).toBeCloseTo(97.6);
    expect(patient.state.resources.wood).toBeCloseTo(90);
    expect(patient.state.resources).toEqual(legacy.state.resources);
  });

  it('integrates social pressure on the slower side of the final opening boundary', () => {
    const state = pantry(600);
    state.units[0].caste = 'slave';
    state.revoltTension = 0;
    updateImperial(state, 0.25);
    // The last quarter-second is 0.15 equivalent seconds, not 0.25.
    expect(state.revoltTension).toBeCloseTo((0.15 * 0.5) / 60);
    state.dogmas = [
      {
        id: 'private-wood',
        targetId: 'O_03',
        vectorId: 'M_04',
        name: 'Proprietà',
        description: '',
        age: 0,
        weight: 10,
      },
    ];
    state.inequality = 0;
    updateDogmas(state, 0.25);
    expect(state.inequality).toBeCloseTo(0.15 / 60);
  });
});
