import { describe, expect, it } from 'vitest';
import { createGame } from './engine';
import { createRiverArtGeometry, sampleRiverArt } from './riverGeometry';
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
import type { GameState } from './types';

function fixture(seed = 6842) {
  const state = createGame(seed, 'classic', 'random');
  state.mapGeneration = { mode: 'random', seed, version: 1, landNavigation: 1 };
  return state;
}
const distance = (a: LandPoint, b: LandPoint) => Math.hypot(a.x - b.x, a.y - b.y);

function blockedCrossing(state: GameState) {
  const geometry = createRiverArtGeometry(state);
  for (let along = 40; along < geometry.length - 40; along += 11) {
    const p = sampleRiverArt(geometry, along);
    const a = { x: p.x - p.dy * 16, y: p.y + p.dx * 16 };
    const b = { x: p.x + p.dy * 16, y: p.y - p.dx * 16 };
    if (isLandPoint(state, a) && isLandPoint(state, b) && !isLandSegment(state, a, b))
      return { a, b, water: { x: p.x, y: p.y } };
  }
  throw new Error('The prepared river never blocked a dry bank-to-bank trip.');
}

function verifyRoute(state: GameState, start: LandPoint, end: LandPoint) {
  const path = planLandRoute(state, start, end);
  expect(path).not.toBeNull();
  expect(path!.at(-1)).toEqual(end);
  let previous = start;
  for (const point of path!) {
    expect(isLandSegment(state, previous, point)).toBe(true);
    previous = point;
  }
  return path!;
}

describe('land routes respect the shared painted river', () => {
  it('distinguishes walkable shallows from dry ground for construction', () => {
    const state = fixture(),
      ford = getRiverFords(state)[0];
    const before = structuredClone(state);
    expect(isLandPoint(state, ford)).toBe(true);
    expect(isDryLandPoint(state, ford)).toBe(false);
    expect(isDryLandPoint(state, ford.bankA)).toBe(true);
    expect(isDryLandPoint(state, ford.bankB)).toBe(true);
    expect(isDryLandPoint(state, { x: -1, y: 250 })).toBe(false);
    expect(isDryLandPoint(state, { x: Number.NaN, y: 250 })).toBe(false);
    expect(state).toEqual(before);
    delete state.mapGeneration!.landNavigation;
    expect(isDryLandPoint(state, ford)).toBe(true);
  });

  it('rejects even a three-centimetre forbidden wedge at a ford exit', () => {
    const state = fixture();
    state.sectors = state.sectors.map((sector) => ({
      ...sector,
      biome: sector.x === 2 ? 'river' : 'plain',
    }));
    const ford = getRiverFords(state).find((entry) => Math.abs(entry.y - 180) < 0.01)!;
    expect(ford).toBeDefined();
    // Both endpoints and the old 0.4m sampling positions are passable, but a
    // short piece between the ford corner and the bank enters deep water.
    const from = { x: 244.1, y: ford.y + 4 };
    const to = { x: 243.5, y: ford.y + 4.9 };
    for (const t of [0, 1 / 3, 2 / 3, 1])
      expect(
        isLandPoint(state, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }),
      ).toBe(true);
    expect(isLandSegment(state, from, to)).toBe(false);
    verifyRoute(state, from, to);
  });

  it('keeps old saved maps and Seed Zero on the previous straight-line movement', () => {
    const state = fixture();
    delete state.mapGeneration!.landNavigation;
    const start = { x: 20, y: 20 },
      end = { x: 400, y: 350 };
    expect(getRiverFords(state)).toEqual([]);
    expect(planLandRoute(state, start, end)).toEqual([end]);
    const actor = { ...start };
    const step = 3.2,
      length = distance(start, end);
    expect(moveOnLand(state, actor, end, step)).toBe(false);
    expect(actor.x).toBe(start.x + ((end.x - start.x) / length) * step);
    expect(actor.y).toBe(start.y + ((end.y - start.y) / length) * step);
    expect(getRiverFords(createGame(6842))).toEqual([]);
  });

  it('derives stable dry-bank fords without consuming randomness or changing a saved world', () => {
    for (const seed of [0, 1, 42, 6842, 1283672715]) {
      const state = fixture(seed),
        before = structuredClone(state);
      const fords = getRiverFords(state);
      expect(fords.length).toBeGreaterThanOrEqual(3);
      for (const ford of fords) {
        expect(isLandPoint(state, ford.bankA)).toBe(true);
        expect(isLandPoint(state, ford.bankB)).toBe(true);
        expect(isLandSegment(state, ford.bankA, ford.bankB)).toBe(true);
        expect(distance(ford.bankA, ford.bankB)).toBeCloseTo(20);
      }
      expect(state).toEqual(before);
      const restored = structuredClone(state);
      restored.seed = 12345678;
      expect(getRiverFords(restored)).toEqual(fords);
    }
  });

  it('routes around deep water through a real ford in several seeded geographies', () => {
    for (const seed of [0, 1, 42, 6842, 1283672715]) {
      const state = fixture(seed),
        { a, b, water } = blockedCrossing(state);
      expect(isLandPoint(state, water)).toBe(false);
      const route = verifyRoute(state, a, b);
      expect(route.length).toBeGreaterThan(1);
      const length = route.reduce(
        (sum, point, index) => sum + distance(index ? route[index - 1] : a, point),
        0,
      );
      expect(length).toBeGreaterThan(distance(a, b));
      expect(planLandRoute(state, a, water)).toBeNull();
      const actor = { ...a };
      expect(moveOnLand(state, actor, water, 50)).toBe(false);
      expect(actor).toEqual(a);
    }
  });

  it('walks across grid cells without loops, obeys every tick budget and crosses water only inside a ford', () => {
    const state = fixture(42),
      { a, b } = blockedCrossing(state),
      actor = { ...a };
    const geometry = createRiverArtGeometry(state),
      fords = getRiverFords(state);
    const before = JSON.stringify(state);
    let reached = false,
      walked = 0,
      wetSamples = 0;
    for (let tick = 0; tick < 400 && !reached; tick++) {
      let travelled = 0;
      reached = moveOnLand(state, actor, b, 1.3, (from, to) => {
        const segment = distance(from, to);
        travelled += segment;
        for (let index = 0; index <= Math.ceil(segment / 0.2); index++) {
          const t = index / Math.max(1, Math.ceil(segment / 0.2));
          const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
          expect(isLandPoint(state, point)).toBe(true);
          // Independent distance to the actual painted centreline, not grid occupancy.
          const water = geometry.points.some((p) => distance(point, p) < 5.8);
          if (water) {
            wetSamples++;
            expect(fords.some((ford) => isInRiverFord(point, ford))).toBe(true);
          }
        }
      });
      expect(travelled).toBeLessThanOrEqual(1.3 + 1e-8);
      walked += travelled;
    }
    expect(reached).toBe(true);
    expect(actor).toEqual(b);
    expect(wetSamples).toBeGreaterThan(0);
    expect(walked).toBeLessThan(300);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('records every bent leg on a large step and discards stale destinations on a new order', () => {
    const state = fixture(1),
      { a, b } = blockedCrossing(state);
    const actor = { ...a },
      legs: [LandPoint, LandPoint][] = [];
    expect(moveOnLand(state, actor, b, 1000, (from, to) => legs.push([from, to]))).toBe(true);
    expect(legs.length).toBeGreaterThan(1);
    for (const [from, to] of legs) expect(isLandSegment(state, from, to)).toBe(true);
    expect(moveOnLand(state, actor, a, 2)).toBe(false);
    const newDestination = { ...b };
    let reached = false;
    for (let tick = 0; tick < 100 && !reached; tick++)
      reached = moveOnLand(state, actor, newDestination, 0.7);
    expect(reached).toBe(true);
    expect(actor).toEqual(newDestination);
    const stopped = { ...actor };
    expect(moveOnLand(state, actor, a, 0)).toBe(false);
    expect(actor).toEqual(stopped);
  });

  it('handles several river bends and a different geography with the same original seed', () => {
    const state = fixture(42);
    const river = new Set(['1,0', '1,1', '2,1', '2,2', '3,2', '3,3', '3,4']);
    state.sectors = state.sectors.map((sector) => ({
      ...sector,
      biome: river.has(`${sector.x},${sector.y}`) ? 'river' : 'plain',
    }));
    const { a, b } = blockedCrossing(state);
    verifyRoute(state, a, b);
    expect(getRiverFords(state)).not.toEqual(getRiverFords(fixture(42)));
    expect(planLandRoute(state, a, { x: -1, y: 200 })).toBeNull();
    expect(planLandRoute(state, a, { x: Number.NaN, y: 200 })).toBeNull();
  });
});
