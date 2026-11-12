import { describe, expect, it } from 'vitest';
import { createGame } from './engine';
import { terrainSegmentEffort } from './biomes';
import {
  getRiverFords,
  isDryLandPoint,
  isLandPoint,
  isLandSegment,
  landRouteEffort,
  moveOnLand,
  planLandRoute,
  type LandPoint,
} from './landNavigation';
import type { Sector } from './types';

function prepared(biome: (x: number, y: number) => Sector['biome'] = () => 'plain') {
  const state = createGame(42, 'classic', 'random', 1000);
  state.mapGeneration!.biomeRules = 1;
  state.sectors = state.sectors.map((sector) => ({
    ...sector,
    biome: biome(sector.x, sector.y),
  }));
  return state;
}

describe('biome-aware land travel', () => {
  it('keeps a cheaper detour around a mountain through both smoothing passes', () => {
    const state = prepared((x, y) => (x === 4 && y === 4 ? 'mountain' : 'plain'));
    const start = { x: 350, y: 410 },
      target = { x: 550, y: 410 };
    const before = structuredClone(state),
      path = planLandRoute(state, start, target)!;
    expect(path.length).toBeGreaterThan(1);
    expect(path.at(-1)).toEqual(target);
    expect(landRouteEffort(state, start, path)).toBeLessThan(
      terrainSegmentEffort(state, start, target) - 10,
    );
    let previous = start;
    for (const point of path) {
      expect(isLandSegment(state, previous, point)).toBe(true);
      previous = point;
    }
    expect(planLandRoute(structuredClone(state), start, target)).toEqual(path);
    expect(state).toEqual(before);
  });

  it('conserves effort on small ticks and reaches a detour without a planning loop', () => {
    const state = prepared((x, y) => (x === 4 && y === 4 ? 'mountain' : 'plain'));
    const start = { x: 350, y: 410 },
      target = { x: 550, y: 410 },
      actor = { ...start };
    let reached = false,
      spent = 0;
    for (let tick = 0; tick < 1000 && !reached; tick++) {
      let tickEffort = 0;
      reached = moveOnLand(state, actor, target, 0.5, (from, to) => {
        expect(isLandSegment(state, from, to)).toBe(true);
        tickEffort += terrainSegmentEffort(state, from, to);
      });
      expect(tickEffort).toBeLessThanOrEqual(0.5 + 1e-8);
      spent += tickEffort;
    }
    expect(reached).toBe(true);
    expect(actor).toEqual(target);
    expect(spent).toBeLessThan(terrainSegmentEffort(state, start, target));
  });

  it('charges both terrain intervals when a tick crosses a sector boundary', () => {
    const state = prepared((x) => (x === 4 ? 'mountain' : 'plain'));
    const start = { x: 390, y: 450 },
      target = { x: 450, y: 450 };
    const actor = { ...start },
      subdivided = { ...start };
    expect(moveOnLand(state, actor, target, 23)).toBe(false);
    expect(actor.x).toBeCloseTo(410, 8);
    expect(actor.y).toBe(450);
    for (let tick = 0; tick < 23; tick++) moveOnLand(state, subdivided, target, 1);
    expect(subdivided.x).toBeCloseTo(actor.x, 8);
    expect(subdivided.y).toBeCloseTo(actor.y, 8);
    expect(terrainSegmentEffort(state, start, actor)).toBeCloseTo(23, 8);
  });

  it('retains physical ford crossings while charging terrain effort', () => {
    const state = prepared((x) => (x === 7 ? 'river' : 'forest'));
    const ford = getRiverFords(state).find((entry) => entry.y > 500)!;
    const start = { x: ford.x - 30, y: ford.y + 30 },
      target = { x: ford.x + 30, y: ford.y + 30 },
      actor = { ...start };
    expect(isLandSegment(state, start, target)).toBe(false);
    const path = planLandRoute(state, start, target)!;
    expect(path.length).toBeGreaterThan(1);
    let enteredFord = false;
    const legs: [LandPoint, LandPoint][] = [];
    expect(moveOnLand(state, actor, target, 1000, (from, to) => legs.push([from, to]))).toBe(true);
    expect(actor).toEqual(target);
    for (const [from, to] of legs) {
      expect(isLandSegment(state, from, to)).toBe(true);
      const samples = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y)));
      for (let index = 0; index <= samples; index++) {
        const point = {
          x: from.x + ((to.x - from.x) * index) / samples,
          y: from.y + ((to.y - from.y) * index) / samples,
        };
        expect(isLandPoint(state, point)).toBe(true);
        if (!isDryLandPoint(state, point)) enteredFord = true;
      }
    }
    expect(enteredFord).toBe(true);
    expect(landRouteEffort(state, start, path)).toBeGreaterThan(
      path.reduce((sum, point, index) => {
        const previous = index ? path[index - 1] : start;
        return sum + Math.hypot(point.x - previous.x, point.y - previous.y);
      }, 0),
    );
  });

  it('leaves an earlier saved region on metre-based direct routing and walking', () => {
    const state = prepared((x, y) => (x === 4 && y === 4 ? 'mountain' : 'plain'));
    const start = { x: 350, y: 410 },
      target = { x: 550, y: 410 };
    // Populate the biome model first: removing the metadata must invalidate it.
    expect(planLandRoute(state, start, target)!.length).toBeGreaterThan(1);
    delete state.mapGeneration!.biomeRules;
    expect(planLandRoute(state, start, target)).toEqual([target]);
    expect(landRouteEffort(state, start, [target])).toBe(200);
    const actor = { ...start };
    expect(moveOnLand(state, actor, target, 60)).toBe(false);
    expect(actor).toEqual({ x: 410, y: 410 });
  });
});
