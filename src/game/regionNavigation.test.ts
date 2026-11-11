import { describe, expect, it } from 'vitest';
import { createGame } from './engine';
import {
  getRiverFords,
  isDryLandPoint,
  isInRiverFord,
  isLandPoint,
  isLandSegment,
  moveOnLand,
  planLandRoute,
  type LandPoint,
} from './landNavigation';

/** A prepared regional river makes every eastward trip cross the old boundary.
 * Its actual painted course and ford positions still come from the shared model. */
function region() {
  const state = createGame(6842, 'classic', 'random');
  state.mapGeneration!.worldSize = 1000;
  state.sectors = Array.from({ length: 100 }, (_, index) => ({
    id: `sector-${index % 10}-${Math.floor(index / 10)}`,
    x: index % 10,
    y: Math.floor(index / 10),
    explored: true,
    faunaCapacity: 20,
    initialFauna: 0,
    biome: index % 10 === 7 ? 'river' : 'plain',
  }));
  return state;
}

const distance = (a: LandPoint, b: LandPoint) => Math.hypot(b.x - a.x, b.y - a.y);

describe('regional land navigation', () => {
  it('connects generated regional settlements to the actual starting valley', () => {
    for (const seed of [0, 1, 42, 6842]) {
      const state = createGame(seed, 'classic', 'random', 1000);
      expect(state.mapGeneration?.worldSize).toBe(1000);
      expect(state.sectors).toHaveLength(100);
      const before = structuredClone(state);
      for (const city of state.cities) {
        const route = planLandRoute(state, state.home, city);
        expect(route, `Unreachable ${city.id} in region ${seed}`).not.toBeNull();
        expect(route!.at(-1)).toMatchObject({ x: city.x, y: city.y });
        let previous = state.home;
        for (const point of route!) {
          expect(isLandSegment(state, previous, point)).toBe(true);
          previous = point;
        }
      }
      expect(state).toEqual(before);
    }
  });

  it('uses the complete regional extent for dry ground, water and fords', () => {
    const state = region();
    const before = structuredClone(state);
    expect(isLandPoint(state, { x: 990, y: 990 })).toBe(true);
    expect(isDryLandPoint(state, { x: 1000, y: 1000 })).toBe(true);
    expect(isLandPoint(state, { x: 1000.001, y: 990 })).toBe(false);
    expect(isDryLandPoint(state, { x: 990, y: -0.001 })).toBe(false);
    // The shared river must reach the expanded map edge, not end at 500m.
    expect(isLandPoint(state, { x: 750, y: 999 })).toBe(false);
    const fords = getRiverFords(state);
    expect(fords.some((ford) => ford.y > 800)).toBe(true);
    for (const ford of fords) {
      expect(ford.x).toBeCloseTo(750);
      expect(isDryLandPoint(state, ford.bankA)).toBe(true);
      expect(isDryLandPoint(state, ford.bankB)).toBe(true);
      expect(isLandSegment(state, ford.bankA, ford.bankB)).toBe(true);
    }
    expect(state).toEqual(before);
    const restored = structuredClone(state);
    restored.seed = 10;
    expect(getRiverFords(restored)).toEqual(fords);
  });

  it('walks beyond the old boundary through a regional ford without loops or extra speed', () => {
    const state = region();
    const start = { x: 450, y: 560 },
      goal = { x: 900, y: 560 },
      actor = { ...start };
    const before = structuredClone(state);
    const path = planLandRoute(state, start, goal);
    expect(path?.at(-1)).toEqual(goal);
    expect(path!.length).toBeGreaterThan(1);
    let previous = start;
    for (const point of path!) {
      expect(isLandSegment(state, previous, point)).toBe(true);
      previous = point;
    }
    const fords = getRiverFords(state);
    let reached = false,
      crossedWater = false,
      walked = 0;
    for (let tick = 0; tick < 500 && !reached; tick++) {
      let travelled = 0;
      reached = moveOnLand(state, actor, goal, 2, (from, to) => {
        const length = distance(from, to);
        travelled += length;
        for (let index = 0; index <= Math.ceil(length / 0.2); index++) {
          const fraction = index / Math.max(1, Math.ceil(length / 0.2));
          const point = {
            x: from.x + (to.x - from.x) * fraction,
            y: from.y + (to.y - from.y) * fraction,
          };
          expect(isLandPoint(state, point)).toBe(true);
          if (Math.abs(point.x - 750) <= 6.25) {
            crossedWater = true;
            expect(fords.some((ford) => isInRiverFord(point, ford))).toBe(true);
          }
        }
      });
      expect(travelled).toBeLessThanOrEqual(2 + 1e-8);
      walked += travelled;
    }
    expect(reached).toBe(true);
    expect(actor).toEqual(goal);
    expect(crossedWater).toBe(true);
    expect(walked).toBeGreaterThan(distance(start, goal));
    expect(walked).toBeLessThan(650);
    expect(state).toEqual(before);
  });

  it('keeps new orders and legacy valley limits independent of cached regional routes', () => {
    const state = region(),
      start = { x: 700, y: 560 },
      goal = { x: 900, y: 560 },
      actor = { ...start };
    moveOnLand(state, actor, goal, 3);
    let reached = false;
    for (let tick = 0; tick < 30 && !reached; tick++)
      reached = moveOnLand(state, actor, start, 0.5);
    expect(reached).toBe(true);
    expect(actor).toEqual(start);
    expect(isLandPoint(createGame(6842), goal)).toBe(false);
    expect(isDryLandPoint(createGame(6842), { x: 500.001, y: 400 })).toBe(false);
    expect(isLandPoint(state, goal)).toBe(true);
    // Even a prepared state's metadata switch must not reuse stale bounds.
    delete state.mapGeneration!.worldSize;
    expect(isLandPoint(state, goal)).toBe(false);
    state.mapGeneration!.worldSize = 1000;
    expect(isLandPoint(state, goal)).toBe(true);
  });
});
