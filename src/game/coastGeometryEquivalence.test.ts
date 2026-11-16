import { describe, expect, it } from 'vitest';
import {
  coastInlandDistance,
  coastSegmentCuts,
  createCoastGeometry,
  isCoastLandSegment,
  type CoastGeometry,
  type CoastPoint,
} from './coastGeometry';
import { islandInlandDistance } from './islandGeometry';

const seeds = [
  0,
  1,
  42,
  6842,
  4294967295,
  ...Array.from({ length: 95 }, (_, index) => Math.imul(index + 1, 2654435761) >>> 0),
];
const at = (a: CoastPoint, b: CoastPoint, t: number) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const centerOf = (points: readonly CoastPoint[]) => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
});

/** Deliberately evaluate every polygon, including when the mainland is deep.
 * The segment oracle uses the full boundary subdivision rather than the new
 * mainland shortcut, retaining the original 0.8 observations for old coasts. */
function geometricReference(coast: CoastGeometry) {
  const mainland = { ...coast, islands: undefined };
  const distance = (point: CoastPoint) =>
    Math.max(
      coastInlandDistance(mainland, point),
      ...(coast.islands ?? []).map((island) => islandInlandDistance(island, point)),
    );
  const segment = (a: CoastPoint, b: CoastPoint) => {
    const cuts = coastSegmentCuts(coast, a, b);
    const observations = coast.islands?.length
      ? [...cuts, ...cuts.slice(1).map((cut, index) => (cut + cuts[index]) / 2)]
      : cuts;
    return observations.every((t) => distance(at(a, b, t)) > 0.25);
  };
  return { distance, segment };
}

describe('coastal geometry shortcuts preserve the full physical union', () => {
  it('matches all polygon distances and full segment subdivisions on one hundred current and old coasts', () => {
    for (const seed of seeds) {
      const coast = createCoastGeometry({
        sectors: [],
        mapGeneration: {
          mode: 'random',
          seed,
          version: 1,
          worldSize: 1000,
          landNavigation: 1,
          regionalCultures: 1,
          biomeRules: 1,
          coastalRules: 1,
          maritimeRules: 1,
        },
      })!;
      const oldCoast = { ...coast, islands: undefined };
      const horizontal = coast.side === 'north' || coast.side === 'south';
      const sign = coast.side === 'north' || coast.side === 'west' ? 1 : -1;
      const inset = (point: CoastPoint, depth: number) =>
        horizontal
          ? { x: point.x, y: point.y + sign * depth }
          : { x: point.x + sign * depth, y: point.y };
      const home = { x: 550, y: 550 };
      const points: CoastPoint[] = [
        home,
        { x: 1, y: 1 },
        { x: 999, y: 1 },
        { x: 1, y: 999 },
        { x: 999, y: 999 },
      ];
      const segments: [CoastPoint, CoastPoint][] = [];
      for (let index = 1; index < coast.points.length - 1; index++) {
        const shore = coast.points[index];
        for (const depth of [-0.26, -0.25, 0, 0.25, 0.26, 5, 17.99, 18.01, 34.99, 35.01, 42, 80])
          points.push(inset(shore, depth));
        segments.push(
          [home, inset(shore, 10)],
          [inset(coast.points[index - 1], 2), inset(coast.points[index + 1], 2)],
        );
      }
      for (const island of coast.islands!) {
        const center = centerOf(island.points);
        points.push(center);
        segments.push([home, center], [center, home]);
        for (let index = 0; index < island.points.length; index++) {
          const vertex = island.points[index];
          points.push(vertex, at(center, vertex, 0.98), at(center, vertex, 0.5));
          segments.push([
            at(center, vertex, 0.85),
            at(center, island.points[(index + 10) % island.points.length], 0.85),
          ]);
        }
      }
      for (let index = 0; index < 32; index++) {
        const a = {
          x: ((Math.imul(seed ^ (index + 1), 1664525) >>> 0) % 99900) / 100,
          y: ((Math.imul(seed ^ (index + 19), 1013904223) >>> 0) % 99900) / 100,
        };
        points.push(a);
        segments.push([a, points[(index * 17) % points.length]]);
      }
      for (const candidate of [coast, oldCoast]) {
        const reference = geometricReference(candidate);
        for (const point of points)
          expect(
            coastInlandDistance(candidate, point),
            `distance seed ${seed} ${JSON.stringify(point)}`,
          ).toBeCloseTo(reference.distance(point), 10);
        for (const [a, b] of segments)
          expect(
            isCoastLandSegment(candidate, a, b),
            `segment seed ${seed} ${JSON.stringify([a, b])}`,
          ).toBe(reference.segment(a, b));
      }
    }
  });

  it('retains the union fallback when a polygon joins dry mainland endpoints across a bay', () => {
    const coast: CoastGeometry = {
      side: 'north',
      worldSize: 1000,
      points: Array.from({ length: 21 }, (_, index) => ({
        x: index * 50,
        y: index === 10 ? 160 : 100,
      })),
      islands: [
        {
          id: 'overlapping-test-island',
          points: [
            { x: 440, y: 100 },
            { x: 560, y: 100 },
            { x: 560, y: 180 },
            { x: 440, y: 180 },
          ],
        },
      ],
    };
    const a = { x: 450, y: 110 },
      b = { x: 550, y: 110 };
    expect(isCoastLandSegment({ ...coast, islands: undefined }, a, b)).toBe(false);
    expect(isCoastLandSegment(coast, a, b)).toBe(true);
    const reference = geometricReference(coast);
    for (const point of [
      { x: 450, y: 110 },
      { x: 500, y: 110 },
      { x: 500, y: 180 },
      { x: 500, y: 200 },
      { x: 500, y: 250 },
    ])
      expect(coastInlandDistance(coast, point)).toBeCloseTo(reference.distance(point), 10);
    expect(isCoastLandSegment(coast, a, { x: NaN, y: 110 })).toBe(false);
    expect(isCoastLandSegment(coast, a, { x: 500, y: Infinity })).toBe(false);
  });
});
