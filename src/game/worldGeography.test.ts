import { describe, expect, it } from 'vitest';
import {
  getWorldRegionGeometry,
  getWorldRiverSegments,
  worldLandDistance,
  worldLandmassAt,
  worldSegmentCuts,
} from './worldGeography';
import {
  coastEdges,
  coastInlandDistance,
  createCoastGeometry,
  isCoastLandSegment,
  isSeaSegment,
} from './coastGeometry';
import type { CoastWorld } from './coastGeometry';

const world = (seed: number, regionX = 0, regionY = 0): CoastWorld => ({
  mapGeneration: {
    mode: 'random',
    seed: seed ^ 121,
    version: 1,
    worldSize: 1000,
    landNavigation: 1,
    regionalCultures: 1,
    biomeRules: 1,
    coastalRules: 1,
    maritimeRules: 1,
    worldRules: 1,
    worldSeed: seed,
    regionX,
    regionY,
  },
  sectors: [],
});

describe('continuous regional world geography', () => {
  it('keeps opening land dry and uses immutable geography independent of local seeds', () => {
    for (const seed of [0, 1, 42, 4294967295]) {
      const geometry = getWorldRegionGeometry({ seed, regionX: 0, regionY: 0 });
      expect(getWorldRegionGeometry({ seed, regionX: 0, regionY: 0 })).toBe(geometry);
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 18)
        expect(
          worldLandDistance(geometry, {
            x: 550 + Math.cos(angle) * 200,
            y: 550 + Math.sin(angle) * 200,
          }),
        ).toBeGreaterThan(0.25);
      const state = world(seed);
      const coast = createCoastGeometry(state)!;
      state.mapGeneration!.seed = 1234;
      expect(coastInlandDistance(createCoastGeometry(state)!, { x: 510, y: 590 })).toBe(
        coastInlandDistance(coast, { x: 510, y: 590 }),
      );
    }
  });

  it('shares exactly the same physical coast on every regional seam', () => {
    for (const seed of [0, 1, 42, 4294967295])
      for (let x = 0; x < 4; x++)
        for (let y = 0; y < 4; y++) {
          const region = getWorldRegionGeometry({ seed, regionX: x, regionY: y });
          for (let along = 0; along <= 1000; along += 10) {
            if (x < 3) {
              const east = getWorldRegionGeometry({ seed, regionX: x + 1, regionY: y });
              expect(worldLandDistance(region, { x: 1000, y: along })).toBeCloseTo(
                worldLandDistance(east, { x: 0, y: along }),
                8,
              );
              expect(worldLandmassAt(region, { x: 1000, y: along })).toBe(
                worldLandmassAt(east, { x: 0, y: along }),
              );
            }
            if (y < 3) {
              const south = getWorldRegionGeometry({ seed, regionX: x, regionY: y + 1 });
              expect(worldLandDistance(region, { x: along, y: 1000 })).toBeCloseTo(
                worldLandDistance(south, { x: along, y: 0 }),
                8,
              );
            }
          }
        }
  });

  it('has distinct continents, an actual enclosed inland sea and offshore islands', () => {
    const west = getWorldRegionGeometry({ seed: 42, regionX: 0, regionY: 0 });
    const east = getWorldRegionGeometry({ seed: 42, regionX: 2, regionY: 2 });
    const island = getWorldRegionGeometry({ seed: 42, regionX: 2, regionY: 0 });
    expect(worldLandmassAt(west, { x: 550, y: 550 })).toBe('continent-west');
    expect(worldLandmassAt(east, { x: 350, y: 480 })).toBe('continent-east');
    expect(worldLandmassAt(island, { x: 280, y: 560 })).toBe('island-northwest');
    expect(worldLandDistance(east, { x: 730, y: 480 })).toBeLessThan(-250);
    const coast = createCoastGeometry(world(42, 2, 2))!;
    const a = { x: 350, y: 480 },
      b = { x: 900, y: 900 };
    expect(coastInlandDistance(coast, a)).toBeGreaterThan(0.25);
    expect(coastInlandDistance(coast, b)).toBeGreaterThan(0.25);
    expect(isCoastLandSegment(coast, a, b)).toBe(false);
    // Dry endpoints cannot conceal a crossing of the basin between them.
    const cuts = worldSegmentCuts(east, a, b);
    expect(
      cuts.some(
        (cut, index) =>
          index > 0 &&
          worldLandDistance(east, {
            x: a.x + ((b.x - a.x) * (cut + cuts[index - 1])) / 2,
            y: a.y + ((b.y - a.y) * (cut + cuts[index - 1])) / 2,
          }) < 0,
      ),
    ).toBe(true);
    expect(isSeaSegment(world(42), { x: 5, y: 500 }, { x: 500, y: 5 })).toBe(false);
  });

  it('places every clipped shore edge on the actual boundary with a landward normal', () => {
    for (let x = 0; x < 4; x++)
      for (let y = 0; y < 4; y++) {
        const coast = createCoastGeometry(world(42, x, y))!;
        for (const { a, b, inward } of coastEdges(coast)) {
          for (const point of [a, b]) {
            expect(point.x).toBeGreaterThanOrEqual(-1e-8);
            expect(point.x).toBeLessThanOrEqual(1000 + 1e-8);
            expect(point.y).toBeGreaterThanOrEqual(-1e-8);
            expect(point.y).toBeLessThanOrEqual(1000 + 1e-8);
          }
          const dx = b.x - a.x,
            dy = b.y - a.y,
            length = Math.hypot(dx, dy);
          const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          expect(Math.abs(coastInlandDistance(coast, middle))).toBeLessThan(1e-7);
          expect(
            coastInlandDistance(coast, {
              x: middle.x - (dy * inward) / length,
              y: middle.y + (dx * inward) / length,
            }),
          ).toBeGreaterThan(0.25);
          expect(
            coastInlandDistance(coast, {
              x: middle.x + (dy * inward) / length,
              y: middle.y - (dx * inward) / length,
            }),
          ).toBeLessThan(-0.25);
        }
      }
  });

  it('continues the global river at its exact regional boundary position', () => {
    for (const seed of [0, 42, 4294967295]) {
      const north = getWorldRiverSegments({ seed, regionX: 0, regionY: 0 });
      const south = getWorldRiverSegments({ seed, regionX: 0, regionY: 1 });
      expect(north.at(-1)![1].y).toBe(1000);
      expect(south[0][0].y).toBe(0);
      expect(north.at(-1)![1].x).toBeCloseTo(south[0][0].x, 10);
    }
  });
});
