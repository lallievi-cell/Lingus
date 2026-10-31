import { describe, expect, it } from 'vitest';
import { createGame, tick } from './engine';
import { emptyInventory } from './content';
import { getSeasonReadiness } from './seasonReadiness';
import { seasonalCore } from './simulation';
import { seasonalImperial } from './imperial';
import { openingFoodSpoilageMultiplier } from './foodPreservation';

describe('gradual food preservation in a new Guided community', () => {
  it('uses absolute seasons, returning to full spoilage in the third year', () => {
    const state = createGame(6842, 'guided');
    expect(
      [0, 3, 4, 7, 8, 12].map((season) => openingFoodSpoilageMultiplier(state, season)),
    ).toEqual([0.4, 0.4, 0.7, 0.7, 1, 1]);
    delete state.openingBalanceVersion;
    delete state.openingCouncilsCompleted;
    expect(openingFoodSpoilageMultiplier(state, 0)).toBe(1);
    expect(openingFoodSpoilageMultiplier(createGame(6842, 'classic'), 0)).toBe(1);
  });

  it.each([true, false])(
    'settles actual village food without changing wood, balanced=%s',
    (balanced) => {
      const state = createGame(6842, 'guided');
      if (!balanced) {
        delete state.openingBalanceVersion;
        delete state.openingCouncilsCompleted;
      }
      state.time = balanced ? 450 : 270;
      state.resources.food = 30;
      state.resources.wood = 20;
      seasonalCore(state);
      expect(state.resources.food).toBeCloseTo(balanced ? 24 : 15);
      expect(state.resources.wood).toBeCloseTo(19);
    },
  );

  it.each([
    [300, 21],
    [450, 24],
    [600, 24],
    [690, 19.5],
  ])('predicts the same food that the boundary at %ss actually leaves', (boundary, food) => {
    let state = createGame(6842, 'guided');
    Object.assign(state, { started: true, time: boundary - 0.25 });
    state.resources.food = 30;
    const estimate = getSeasonReadiness(state).food.find((entry) => entry.id === 'home')!;
    state = tick(state, 0.25);
    expect(state.resources.food).toBeCloseTo(food);
    expect(estimate.safeNutrition).toBeCloseTo(food * 25);
  });

  it.each([true, false])(
    'uses the same preservation in provincial stocks, balanced=%s',
    (balanced) => {
      const state = createGame(6842, 'guided');
      if (!balanced) {
        delete state.openingBalanceVersion;
        delete state.openingCouncilsCompleted;
      }
      state.time = balanced ? 450 : 270;
      const province = {
        ...state.cities[0],
        id: 'province',
        name: 'Riserve',
        capital: false,
        factionId: 'player',
        resources: { ...emptyInventory(), food: 30 },
        cohorts: { workers: 0, warriors: 0, sages: 0, slaves: 0 },
        buildingIds: [],
      };
      state.cities.push(
        { ...province, id: 'capital', capital: true, resources: state.resources },
        province,
      );
      seasonalImperial(state);
      expect(province.resources.food).toBeCloseTo(balanced ? 24 : 15);
    },
  );
});
