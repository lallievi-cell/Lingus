import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import { coastInlandDistance, createCoastGeometry, isSeaPoint } from './coastGeometry';
import {
  getRiverFords,
  isDryLandPoint,
  isLandPoint,
  isLandSegment,
  moveOnLand,
  landRouteEffort,
  planLandRoute,
} from './landNavigation';
import { terrainBiomeAt, farmYieldMultiplier } from './biomes';

describe('walking beside physical seas', () => {
  it('reuses exact geographic observations without exposing mutable cached paths', () => {
    const state = createInitialState(42, 'guided', 'random', 1000);
    const target = state.entities.find((entity) => entity.kind === 'fishery')!;
    const destination = { x: target.x + 0.001, y: target.y + 0.001 };
    const first = planLandRoute(state, state.home, destination)!;
    expect(first).not.toBeNull();
    const expected = structuredClone(first);
    const effort = landRouteEffort(state, state.home, first);
    first[0].x = -100;
    first.pop();
    const warm = planLandRoute(state, state.home, destination)!;
    expect(warm).toEqual(expected);
    expect(warm.at(-1)).toEqual(destination);
    expect(landRouteEffort(state, state.home, warm)).toBe(effort);
    expect(planLandRoute(structuredClone(state), state.home, destination)).toEqual(expected);
    const nearby = { x: destination.x + 0.001, y: destination.y + 0.001 };
    expect(planLandRoute(state, state.home, nearby)!.at(-1)).toEqual(nearby);
  });

  it('rejects open water before any ford exception and invalidates caches when coastalRules changes', () => {
    const state = createInitialState(42, 'guided', 'random', 1000);
    const coast = createCoastGeometry(state)!;
    const shore = coast.points[10];
    const sea =
      coast.side === 'north'
        ? { x: shore.x, y: shore.y - 15 }
        : coast.side === 'south'
          ? { x: shore.x, y: shore.y + 15 }
          : coast.side === 'west'
            ? { x: shore.x - 15, y: shore.y }
            : { x: shore.x + 15, y: shore.y };
    expect(isSeaPoint(state, sea)).toBe(true);
    expect(isLandPoint(state, sea)).toBe(false);
    expect(isDryLandPoint(state, sea)).toBe(false);
    expect(planLandRoute(state, state.home, sea)).toBeNull();
    const point = { ...state.home };
    expect(moveOnLand(state, point, sea, 10000)).toBe(false);
    expect(point).toEqual(state.home);
    expect(terrainBiomeAt(state, sea)).toBe('sea');
    expect(farmYieldMultiplier(state, sea)).toBe(0);
    for (const ford of getRiverFords(state)) {
      expect(coastInlandDistance(coast, ford.bankA)).toBeGreaterThan(0.25);
      expect(coastInlandDistance(coast, ford.bankB)).toBeGreaterThan(0.25);
    }
    delete state.mapGeneration!.coastalRules;
    expect(isSeaPoint(state, sea)).toBe(false);
    expect(isLandPoint(state, sea)).toBe(true);
  });

  it('routes around a bay with dry endpoints rather than cutting the water', () => {
    const state = createInitialState(42, 'guided', 'random', 1000);
    const coast = createCoastGeometry(state)!;
    let found = false;
    for (let i = 1; i < coast.points.length - 1; i++) {
      const [a, middle, b] = [coast.points[i - 1], coast.points[i], coast.points[i + 1]];
      const sign = coast.side === 'north' || coast.side === 'west' ? 1 : -1;
      const horizontal = coast.side === 'north' || coast.side === 'south';
      const offset = (point: { x: number; y: number }) =>
        horizontal ? { x: point.x, y: point.y + sign * 2 } : { x: point.x + sign * 2, y: point.y };
      const start = offset(a),
        end = offset(b);
      const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      if (
        !isDryLandPoint(state, start) ||
        !isDryLandPoint(state, end) ||
        !isSeaPoint(state, midpoint)
      )
        continue;
      found = true;
      expect(isLandSegment(state, start, end)).toBe(false);
      const route = planLandRoute(state, start, end);
      expect(route).not.toBeNull();
      let previous = start;
      for (const point of route!) {
        expect(isLandSegment(state, previous, point)).toBe(true);
        previous = point;
      }
      expect(route!.at(-1)).toEqual(end);
      expect(coastInlandDistance(coast, middle)).toBeCloseTo(0);
      break;
    }
    expect(found).toBe(true);
  });
});
