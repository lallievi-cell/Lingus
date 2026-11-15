import type { GameState } from './types';

export type CoastPoint = { x: number; y: number };
export type CoastWorld = Pick<GameState, 'mapGeneration' | 'sectors'>;
export interface CoastGeometry {
  side: 'north' | 'south' | 'west' | 'east';
  points: readonly CoastPoint[];
  worldSize: number;
}

export const coastalRulesEnabled = (world: CoastWorld) => world.mapGeneration?.coastalRules === 1;
const geometries = new Map<string, CoastGeometry>();
const worldGeometries = new WeakMap<
  CoastWorld['sectors'],
  { seed: number; geometry: CoastGeometry }
>();

/** The original map seed owns this small immutable line. Simulation RNG and
 * the camera never change the shoreline used by both paint and walking. */
export function createCoastGeometry(world: CoastWorld): CoastGeometry | undefined {
  if (!coastalRulesEnabled(world)) return undefined;
  const seed = world.mapGeneration!.seed;
  const existing = worldGeometries.get(world.sectors);
  if (existing?.seed === seed) return existing.geometry;
  // The terrestrial generator's third private draw chooses river rotation.
  // Replay only that fixed decision from the original seed: neither saved
  // sector edits nor the evolving simulation RNG can rotate the sea.
  let riverSeed = (seed ^ 0x9e3779b9) >>> 0;
  for (let draw = 0; draw < 3; draw++)
    riverSeed = (Math.imul(riverSeed, 1664525) + 1013904223) >>> 0;
  const vertical = riverSeed / 4294967296 >= 0.5;
  const side = vertical ? (seed & 1 ? 'south' : 'north') : seed & 1 ? 'east' : 'west';
  const key = `${seed}:${side}`;
  const cached = geometries.get(key);
  if (cached) {
    worldGeometries.set(world.sectors, { seed, geometry: cached });
    return cached;
  }
  let value = (seed ^ 0xc0a57a1) >>> 0;
  const random = () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
  const points: CoastPoint[] = [];
  for (let along = 0; along <= 1000; along += 50) {
    const depth = 82 + random() * 48;
    const across = side === 'south' || side === 'east' ? 1000 - depth : depth;
    points.push(Object.freeze(vertical ? { x: along, y: across } : { x: across, y: along }));
  }
  const result = Object.freeze({ side, points: Object.freeze(points), worldSize: 1000 });
  if (geometries.size >= 32) geometries.delete(geometries.keys().next().value!);
  geometries.set(key, result);
  worldGeometries.set(world.sectors, { seed, geometry: result });
  return result;
}

const horizontal = (coast: CoastGeometry) => coast.side === 'north' || coast.side === 'south';
const alongValue = (coast: CoastGeometry, point: CoastPoint) =>
  horizontal(coast) ? point.x : point.y;

/** Positive values are inland. Linear interpolation is the physical bank. */
export function coastInlandDistance(coast: CoastGeometry, point: CoastPoint): number {
  const along = Math.max(0, Math.min(coast.worldSize, alongValue(coast, point)));
  const index = Math.min(coast.points.length - 2, Math.floor(along / 50));
  const a = coast.points[index],
    b = coast.points[index + 1];
  const fraction = (along - alongValue(coast, a)) / 50;
  const shore = horizontal(coast) ? a.y + (b.y - a.y) * fraction : a.x + (b.x - a.x) * fraction;
  const across = horizontal(coast) ? point.y : point.x;
  return coast.side === 'south' || coast.side === 'east' ? shore - across : across - shore;
}

export function coastDistance(world: CoastWorld, point: CoastPoint): number {
  const coast = createCoastGeometry(world);
  return coast ? coastInlandDistance(coast, point) : Infinity;
}

export function isSeaPoint(world: CoastWorld, point: CoastPoint): boolean {
  return coastDistance(world, point) <= 0.25;
}

/** Cuts at each bank vertex and each crossing of an inland contour. This is
 * exact for the shared polyline, including dry endpoints across a small bay. */
export function coastSegmentCuts(
  coast: CoastGeometry,
  a: CoastPoint,
  b: CoastPoint,
  offset = 0.25,
) {
  const from = alongValue(coast, a),
    delta = alongValue(coast, b) - from;
  const cuts = [0, 1];
  if (delta)
    for (const point of coast.points) {
      const t = (alongValue(coast, point) - from) / delta;
      if (t > 0 && t < 1) cuts.push(t);
    }
  cuts.sort((left, right) => left - right);
  const crossings: number[] = [];
  const at = (t: number) =>
    coastInlandDistance(coast, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }) - offset;
  for (let index = 1; index < cuts.length; index++) {
    const lo = cuts[index - 1],
      hi = cuts[index],
      left = at(lo),
      right = at(hi);
    if (left * right < 0) crossings.push(lo + ((hi - lo) * left) / (left - right));
  }
  return [...cuts, ...crossings].sort((left, right) => left - right);
}

export function isCoastLandSegment(coast: CoastGeometry, a: CoastPoint, b: CoastPoint): boolean {
  return coastSegmentCuts(coast, a, b).every(
    (t) =>
      coastInlandDistance(coast, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }) > 0.25,
  );
}
