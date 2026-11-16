import { describe, expect, it } from 'vitest';
import { coastEdges, createCoastGeometry, isSeaSegment } from './coastGeometry';
import { getRiverFords, isLandPoint, isLandSegment, planLandRoute } from './landNavigation';
import { planSeaRoute } from './seaNavigation';
import { findShoreAccess, isShoreConnection } from './shoreAccess';
import { sameLandmass } from './maritimeInventory';
import { createRiverArtGeometry } from './riverGeometry';
import type { GameState } from './types';

function region(regionX = 0, regionY = 0): GameState {
  return {
    mapGeneration: {
      mode: 'random',
      seed: 555,
      version: 1,
      worldSize: 1000,
      landNavigation: 1,
      regionalCultures: 1,
      biomeRules: 1,
      coastalRules: 1,
      maritimeRules: 1,
      worldRules: 1,
      worldSeed: 42,
      regionX,
      regionY,
    },
    sectors: Array.from({ length: 100 }, (_, index) => ({
      id: `sector-${index % 10}-${Math.floor(index / 10)}`,
      x: index % 10,
      y: Math.floor(index / 10),
      biome: 'plain',
      explored: true,
      faunaCapacity: 20,
    })),
  } as GameState;
}

describe('world geography navigation integration', () => {
  it('uses global river banks, real fords and continuous painted stream endpoints', () => {
    const state = region();
    const from = { x: 550, y: 550 },
      to = { x: 940, y: 550 };
    expect(isLandPoint(state, from)).toBe(true);
    expect(isLandPoint(state, to)).toBe(true);
    expect(isLandSegment(state, from, to)).toBe(false);
    expect(getRiverFords(state).length).toBeGreaterThan(0);
    const route = planLandRoute(state, from, to);
    expect(route).not.toBeNull();
    let previous = from;
    for (const point of route!) {
      expect(isLandSegment(state, previous, point)).toBe(true);
      previous = point;
    }
    const northRiver = createRiverArtGeometry(state);
    const southRiver = createRiverArtGeometry(region(0, 1));
    expect(northRiver.points.at(-1)!.x).toBeCloseTo(southRiver.points[0].x, 10);
    expect(northRiver.points.at(-1)!.y).toBe(1000);
    expect(southRiver.points[0].y).toBe(0);
    expect(createRiverArtGeometry(region(2, 0)).points).toEqual([]);
  });

  it('connects a dry shore workstation to water using the actual global shore normal', () => {
    const state = region();
    const coast = createCoastGeometry(state)!;
    const shore = coastEdges(coast).find(({ a, b }) => Math.hypot(b.x - a.x, b.y - a.y) > 300)!;
    const dx = shore.b.x - shore.a.x,
      dy = shore.b.y - shore.a.y,
      length = Math.hypot(dx, dy);
    const land = {
      x: (shore.a.x + shore.b.x) / 2 - (dy * shore.inward * 10) / length,
      y: (shore.a.y + shore.b.y) / 2 + (dx * shore.inward * 10) / length,
    };
    const access = findShoreAccess(state, land);
    expect(access).toBeDefined();
    expect(isShoreConnection(state, access!.land, access!.water)).toBe(true);
    expect(findShoreAccess(state, { x: 990, y: 500 })).toBeUndefined();
  });

  it('sails around the physical archipelago instead of cutting across its island', () => {
    const state = region(2, 0);
    const from = { x: 20, y: 560 },
      to = { x: 600, y: 560 };
    expect(isSeaSegment(state, from, to)).toBe(false);
    const route = planSeaRoute(state, from, to);
    expect(route).not.toBeNull();
    expect(route!.at(-1)).toEqual(to);
    let previous = from;
    for (const point of route!) {
      expect(isSeaSegment(state, previous, point)).toBe(true);
      previous = point;
    }
    expect(sameLandmass(state, { x: 280, y: 560 }, { x: 990, y: 830 })).toBe(false);
  });

  it('never reuses a different region navigation model even with shared local sectors', () => {
    const state = region();
    expect(isLandPoint(state, { x: 550, y: 550 })).toBe(true);
    state.mapGeneration!.regionX = 2;
    state.mapGeneration!.regionY = 2;
    expect(isLandPoint(state, { x: 550, y: 550 })).toBe(false);
    state.mapGeneration!.regionX = 0;
    state.mapGeneration!.regionY = 0;
    expect(isLandPoint(state, { x: 550, y: 550 })).toBe(true);
  });
});
