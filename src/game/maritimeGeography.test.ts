import { describe, expect, it } from 'vitest';
import {
  coastInlandDistance,
  createCoastGeometry,
  isCoastLandSegment,
  isSeaPoint,
  isSeaSegment,
  type CoastPoint,
} from './coastGeometry';
import { islandInlandDistance, polygonOrientation } from './islandGeometry';
import {
  getRiverFords,
  isDryLandPoint,
  isDryLandSegment,
  isLandSegment,
  planLandRoute,
} from './landNavigation';
import { planSeaRoute, seaRouteLength } from './seaNavigation';
import { findShoreAccess, isShoreConnection } from './shoreAccess';
import { createInitialState } from './state';
import { generateWorld } from './worldGeneration';
import { terrainBiomeAt, terrainSegmentEffort } from './biomes';

const centerOf = (points: readonly CoastPoint[]) => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
});
const seeds = [
  0,
  1,
  42,
  6842,
  4294967295,
  ...Array.from({ length: 95 }, (_, index) => Math.imul(index + 1, 2654435761) >>> 0),
];

describe('physical offshore landmasses', () => {
  it('adds two distinct convex dry islets on one hundred seeds without changing the 0.8 mainland', () => {
    const shapes = new Set<string>();
    for (const seed of seeds) {
      const state = createInitialState(seed, 'guided', 'random', 1000);
      const coast = createCoastGeometry(state)!;
      const previous = generateWorld(seed, state.factions, 1000, true, true, false);
      expect(state.sectors).toEqual(previous.sectors);
      expect(state.cities).toEqual(previous.cities);
      expect(state.entities.slice(0, previous.entities.length)).toEqual(previous.entities);
      const legacy = {
        ...state,
        mapGeneration: { ...state.mapGeneration!, maritimeRules: undefined },
      };
      const oldCoast = createCoastGeometry(legacy)!;
      expect(oldCoast.islands).toBeUndefined();
      expect(coast.points).toEqual(oldCoast.points);
      expect(coast.islands).toHaveLength(2);
      shapes.add(JSON.stringify(coast.islands));
      const horizontal = coast.side === 'north' || coast.side === 'south';
      for (const [index, island] of coast.islands!.entries()) {
        expect(island.points).toHaveLength(20);
        const orientation = polygonOrientation(island.points),
          center = centerOf(island.points);
        expect(horizontal ? center.y : center.x).toBeCloseTo(
          coast.side === 'north' || coast.side === 'west' ? 30 : 970,
        );
        expect(
          Math.abs((horizontal ? center.x : center.y) - [300, 700][index]),
        ).toBeLessThanOrEqual(12);
        expect(isDryLandPoint(state, center)).toBe(true);
        expect(isSeaPoint(state, center)).toBe(false);
        expect(terrainBiomeAt(state, center)).toBe('coast');
        for (let vertex = 0; vertex < island.points.length; vertex++) {
          const a = island.points[vertex],
            b = island.points[(vertex + 1) % 20],
            c = island.points[(vertex + 2) % 20];
          expect(
            orientation * ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)),
          ).toBeGreaterThan(0);
          expect(Math.min(a.x, a.y, 1000 - a.x, 1000 - a.y)).toBeGreaterThan(10);
          expect(coastInlandDistance(oldCoast, a)).toBeLessThan(-30);
        }
        const nodes = state.entities.filter(
          (entity) => islandInlandDistance(island, entity) > 0.25,
        );
        expect(nodes.filter((entity) => entity.kind === 'tree')).toHaveLength(4);
        expect(nodes.filter((entity) => entity.kind === 'berries')).toHaveLength(3);
        expect(nodes.filter((entity) => entity.kind === 'stone')).toHaveLength(2);
        expect(nodes.filter((entity) => entity.kind === 'fishery')).toHaveLength(2);
        for (const node of nodes) {
          expect(isDryLandPoint(state, node), `${seed} ${node.id}`).toBe(true);
          expect(node.amount).toBeGreaterThan(0);
          expect(node.maxAmount).toBe(node.amount);
          expect(planLandRoute(state, state.home, node)).toBeNull();
          if (node.kind === 'fishery') {
            expect(islandInlandDistance(island, node)).toBeGreaterThanOrEqual(7.99);
            expect(islandInlandDistance(island, node)).toBeLessThanOrEqual(12.01);
            expect(node.amount).toBeGreaterThanOrEqual(40);
            expect(node.amount).toBeLessThanOrEqual(60);
            const access = findShoreAccess(state, node)!;
            expect(access, `${seed} ${node.id}`).toBeDefined();
            expect(access.land).toEqual({ x: node.x, y: node.y });
            expect(isSeaPoint(state, access.water)).toBe(true);
          }
        }
      }
    }
    expect(shapes.size).toBe(100);
  }, 30_000);

  it('sails around island polygons and never walks between disconnected dry endpoints', () => {
    for (const seed of [0, 1, 42, 6842]) {
      const state = createInitialState(seed, 'guided', 'random', 1000);
      const coast = createCoastGeometry(state)!;
      const horizontal = coast.side === 'north' || coast.side === 'south';
      for (const island of coast.islands!) {
        const center = centerOf(island.points);
        const start = horizontal
          ? { x: center.x - 70, y: center.y }
          : { x: center.x, y: center.y - 70 };
        const end = horizontal
          ? { x: center.x + 70, y: center.y }
          : { x: center.x, y: center.y + 70 };
        expect(isSeaPoint(state, start)).toBe(true);
        expect(isSeaPoint(state, end)).toBe(true);
        expect(isSeaSegment(state, start, end)).toBe(false);
        const unbalancedStart = horizontal
          ? { x: center.x - 90, y: center.y }
          : { x: center.x, y: center.y - 90 };
        const unbalancedEnd = horizontal
          ? { x: center.x + 210, y: center.y }
          : { x: center.x, y: center.y + 210 };
        const unbalancedMiddle = {
          x: (unbalancedStart.x + unbalancedEnd.x) / 2,
          y: (unbalancedStart.y + unbalancedEnd.y) / 2,
        };
        expect(isSeaPoint(state, unbalancedStart)).toBe(true);
        expect(isSeaPoint(state, unbalancedEnd)).toBe(true);
        expect(isSeaPoint(state, unbalancedMiddle)).toBe(true);
        expect(isSeaSegment(state, unbalancedStart, unbalancedEnd)).toBe(false);
        const route = planSeaRoute(state, start, end)!;
        expect(route).not.toBeNull();
        expect(seaRouteLength(start, route)).toBeGreaterThan(140);
        let previous = start;
        for (const point of route) {
          expect(isSeaSegment(state, previous, point)).toBe(true);
          previous = point;
        }
        expect(route.at(-1)).toEqual(end);
        expect(isLandSegment(state, state.home, center)).toBe(false);
        expect(isCoastLandSegment(coast, state.home, center)).toBe(false);
        expect(planLandRoute(state, state.home, center)).toBeNull();
        const local = horizontal
          ? { x: center.x + 15, y: center.y }
          : { x: center.x, y: center.y + 15 };
        expect(isLandSegment(state, center, local)).toBe(true);
        expect(planLandRoute(state, center, local)).not.toBeNull();
        expect(terrainSegmentEffort(state, center, local)).toBeCloseTo(16.5);
      }
    }
  });

  it('separates maritime caches and preserves old worlds when the new flag is absent', () => {
    const state = createInitialState(42, 'guided', 'random', 1000);
    const coast = createCoastGeometry(state)!;
    const center = centerOf(coast.islands![0].points);
    expect(isDryLandPoint(state, center)).toBe(true);
    state.seed = 123456;
    expect(createCoastGeometry(state)).toBe(coast);
    delete state.mapGeneration!.maritimeRules;
    expect(createCoastGeometry(state)!.islands).toBeUndefined();
    expect(isSeaPoint(state, center)).toBe(true);
    expect(isDryLandPoint(state, center)).toBe(false);
    state.mapGeneration!.maritimeRules = 1;
    expect(createCoastGeometry(state)).toBe(coast);
    expect(isDryLandPoint(state, center)).toBe(true);
  });

  it('finds short dry approaches and rejects inland, river, water and invalid access points', () => {
    const state = createInitialState(42, 'guided', 'random', 1000);
    const fishery = state.entities.find((entity) => entity.kind === 'fishery')!;
    const access = findShoreAccess(state, fishery)!;
    expect(access).toBeDefined();
    expect(isDryLandPoint(state, access.land)).toBe(true);
    expect(isSeaPoint(state, access.water)).toBe(true);
    expect(isShoreConnection(state, access.land, access.water)).toBe(true);
    expect(
      Math.hypot(access.land.x - access.water.x, access.land.y - access.water.y),
    ).toBeLessThanOrEqual(20);
    expect(findShoreAccess(state, state.home)).toBeUndefined();
    expect(findShoreAccess(state, getRiverFords(state)[0])).toBeUndefined();
    expect(findShoreAccess(state, access.water)).toBeUndefined();
    expect(findShoreAccess(state, fishery, 1)).toBeUndefined();
    expect(findShoreAccess(state, fishery, -1)).toBeUndefined();
    expect(findShoreAccess(state, { x: NaN, y: 0 })).toBeUndefined();
    expect(isSeaSegment(state, access.water, { x: -1, y: access.water.y })).toBe(false);
  });

  it('rejects short shore connections that cut river water before reaching the sea', () => {
    const state = createInitialState(42, 'classic', 'random', 1000);
    const vertex = createCoastGeometry(state)!.points[1];
    const land = { x: vertex.x + 8, y: vertex.y + 8 };
    const water = { x: land.x - 19 / Math.SQRT2, y: land.y - 19 / Math.SQRT2 };
    expect(isDryLandPoint(state, land)).toBe(true);
    expect(isSeaPoint(state, water)).toBe(true);
    expect(Math.hypot(water.x - land.x, water.y - land.y)).toBeCloseTo(19);
    expect(isShoreConnection(state, land, water)).toBe(false);
    expect(isShoreConnection(state, water, land)).toBe(false);
    const ford = getRiverFords(state)[0];
    expect(isLandSegment(state, ford.bankA, ford.bankB)).toBe(true);
    expect(isDryLandSegment(state, ford.bankA, ford.bankB)).toBe(false);
  });
});
