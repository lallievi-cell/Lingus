import type { GameState } from './types';
import {
  createCoastIslands,
  islandInlandDistance,
  islandInlandDistanceLimit,
  islandDistanceUpperBound,
  islandSegmentInterval,
  type CoastIsland,
} from './islandGeometry';
import {
  getWorldRegionGeometry,
  worldLandDistance,
  worldLandmassAt,
  worldSegmentCuts,
  type WorldRegionGeometry,
  type WorldShoreEdge,
} from './worldGeography';

export type CoastPoint = { x: number; y: number };
export type CoastWorld = Pick<GameState, 'mapGeneration' | 'sectors'>;
export interface CoastGeometry {
  side: 'north' | 'south' | 'west' | 'east';
  points: readonly CoastPoint[];
  worldSize: number;
  islands?: readonly CoastIsland[];
  world?: WorldRegionGeometry;
}

export const coastalRulesEnabled = (world: CoastWorld) => world.mapGeneration?.coastalRules === 1;
const geometries = new Map<string, CoastGeometry>();
const worldGeometries = new WeakMap<
  CoastWorld['sectors'],
  { seed: number; maritime: boolean; worldKey?: string; geometry: CoastGeometry }
>();
const islandDepthLimits = new WeakMap<CoastGeometry, number>();

/** The original map seed owns this small immutable line. Simulation RNG and
 * the camera never change the shoreline used by both paint and walking. */
export function createCoastGeometry(world: CoastWorld): CoastGeometry | undefined {
  if (!coastalRulesEnabled(world)) return undefined;
  const seed = world.mapGeneration!.seed;
  const maritime = world.mapGeneration?.maritimeRules === 1;
  const generation = world.mapGeneration!;
  const worldKey =
    generation.worldRules === 1
      ? `${generation.worldSeed ?? seed}:${generation.regionX ?? 0}:${generation.regionY ?? 0}`
      : undefined;
  const existing = worldGeometries.get(world.sectors);
  if (existing?.seed === seed && existing.maritime === maritime && existing.worldKey === worldKey)
    return existing.geometry;
  if (worldKey) {
    const key = `world:${worldKey}`;
    let geometry = geometries.get(key);
    if (!geometry) {
      const region = getWorldRegionGeometry({
        seed: generation.worldSeed ?? seed,
        regionX: generation.regionX ?? 0,
        regionY: generation.regionY ?? 0,
      });
      geometry = Object.freeze({
        side: 'north' as const,
        points: Object.freeze([]),
        worldSize: 1000,
        world: region,
      });
      if (geometries.size >= 32) geometries.delete(geometries.keys().next().value!);
      geometries.set(key, geometry);
    }
    worldGeometries.set(world.sectors, { seed, maritime, worldKey, geometry });
    return geometry;
  }
  // The terrestrial generator's third private draw chooses river rotation.
  // Replay only that fixed decision from the original seed: neither saved
  // sector edits nor the evolving simulation RNG can rotate the sea.
  let riverSeed = (seed ^ 0x9e3779b9) >>> 0;
  for (let draw = 0; draw < 3; draw++)
    riverSeed = (Math.imul(riverSeed, 1664525) + 1013904223) >>> 0;
  const vertical = riverSeed / 4294967296 >= 0.5;
  const side = vertical ? (seed & 1 ? 'south' : 'north') : seed & 1 ? 'east' : 'west';
  const key = `${seed}:${side}:${maritime}`;
  const cached = geometries.get(key);
  if (cached) {
    worldGeometries.set(world.sectors, { seed, maritime, geometry: cached });
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
  const result = Object.freeze({
    side,
    points: Object.freeze(points),
    worldSize: 1000,
    ...(maritime ? { islands: createCoastIslands(seed, side) } : {}),
  });
  if (geometries.size >= 32) geometries.delete(geometries.keys().next().value!);
  geometries.set(key, result);
  worldGeometries.set(world.sectors, { seed, maritime, geometry: result });
  return result;
}

const horizontal = (coast: CoastGeometry) => coast.side === 'north' || coast.side === 'south';
const alongValue = (coast: CoastGeometry, point: CoastPoint) =>
  horizontal(coast) ? point.x : point.y;

/** Positive values are inland. Linear interpolation is the physical bank. */
function mainlandInlandDistance(coast: CoastGeometry, point: CoastPoint): number {
  const along = Math.max(0, Math.min(coast.worldSize, alongValue(coast, point)));
  const index = Math.min(coast.points.length - 2, Math.floor(along / 50));
  const a = coast.points[index],
    b = coast.points[index + 1];
  const fraction = (along - alongValue(coast, a)) / 50;
  const shore = horizontal(coast) ? a.y + (b.y - a.y) * fraction : a.x + (b.x - a.x) * fraction;
  const across = horizontal(coast) ? point.y : point.x;
  return coast.side === 'south' || coast.side === 'east' ? shore - across : across - shore;
}

/** The land is the union of the unchanged mainland and the optional islands. */
export function coastInlandDistance(coast: CoastGeometry, point: CoastPoint): number {
  if (coast.world) return worldLandDistance(coast.world, point);
  let distance = mainlandInlandDistance(coast, point);
  if (!coast.islands?.length) return distance;
  let depthLimit = islandDepthLimits.get(coast);
  if (depthLimit === undefined) {
    depthLimit = Math.max(...coast.islands.map(islandInlandDistanceLimit));
    islandDepthLimits.set(coast, depthLimit);
  }
  // A signed island distance cannot improve a mainland value above the
  // island's greatest possible depth. Most land queries stop here exactly.
  if (distance >= depthLimit) return distance;
  for (const island of coast.islands)
    if (islandDistanceUpperBound(island, point) > distance)
      distance = Math.max(distance, islandInlandDistance(island, point));
  return distance;
}

/** Mainland distance is affine between bank vertices. Its minimum along a
 * segment is attained at an endpoint or one of the crossed vertex axes. */
function isMainlandLandSegment(coast: CoastGeometry, a: CoastPoint, b: CoastPoint): boolean {
  if (!(mainlandInlandDistance(coast, a) > 0.25) || !(mainlandInlandDistance(coast, b) > 0.25))
    return false;
  const from = alongValue(coast, a),
    delta = alongValue(coast, b) - from;
  if (!delta) return true;
  const low = Math.min(from, from + delta),
    high = Math.max(from, from + delta);
  const first = Math.max(0, Math.floor(low / 50) + 1);
  const last = Math.min(coast.points.length - 1, Math.ceil(high / 50) - 1);
  for (let index = first; index <= last; index++) {
    const t = (alongValue(coast, coast.points[index]) - from) / delta;
    if (
      mainlandInlandDistance(coast, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }) <= 0.25
    )
      return false;
  }
  return true;
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
  if (coast.world) return worldSegmentCuts(coast.world, a, b, offset);
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
    mainlandInlandDistance(coast, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }) - offset;
  for (let index = 1; index < cuts.length; index++) {
    const lo = cuts[index - 1],
      hi = cuts[index],
      left = at(lo),
      right = at(hi);
    if (left * right < 0) crossings.push(lo + ((hi - lo) * left) / (left - right));
  }
  for (const island of coast.islands ?? []) {
    const interval = islandSegmentInterval(island, a, b, offset);
    if (interval) crossings.push(...interval);
  }
  return [...cuts, ...crossings].sort((left, right) => left - right);
}

export function isCoastLandSegment(coast: CoastGeometry, a: CoastPoint, b: CoastPoint): boolean {
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return false;
  // The union contains every mainland segment. Island boundaries cannot
  // change this result, so avoid their cuts on ordinary mainland walks.
  // Worlds without islands retain the original 0.8 calculation below.
  if (coast.islands?.length && isMainlandLandSegment(coast, a, b)) return true;
  const cuts = coastSegmentCuts(coast, a, b);
  const observations =
    coast.world || coast.islands?.length
      ? [...cuts, ...cuts.slice(1).map((cut, index) => (cut + cuts[index]) / 2)]
      : cuts;
  return observations.every(
    (t) =>
      coastInlandDistance(coast, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }) > 0.25,
  );
}

/** One source for fishing workstations, short jetties and coastal painting. */
export function coastEdges(coast: CoastGeometry): readonly WorldShoreEdge[] {
  if (coast.world) return coast.world.shoreEdges;
  const edges: WorldShoreEdge[] = [];
  const inward = coast.side === 'north' || coast.side === 'east' ? 1 : -1;
  for (let index = 1; index < coast.points.length; index++)
    edges.push({ a: coast.points[index - 1], b: coast.points[index], inward });
  for (const island of coast.islands ?? []) {
    // These generated ellipses are counterclockwise in simulation coordinates.
    let area = 0;
    for (let index = 0; index < island.points.length; index++) {
      const a = island.points[index],
        b = island.points[(index + 1) % island.points.length];
      area += a.x * b.y - a.y * b.x;
    }
    const islandInward = area >= 0 ? 1 : -1;
    for (let index = 0; index < island.points.length; index++)
      edges.push({
        a: island.points[index],
        b: island.points[(index + 1) % island.points.length],
        inward: islandInward,
      });
  }
  return edges;
}

/** Stable across regions; an inland sea never joins separate inventories. */
export function coastLandmassAt(coast: CoastGeometry, point: CoastPoint): string | undefined {
  if (coast.world) return worldLandmassAt(coast.world, point);
  for (const island of coast.islands ?? [])
    if (
      islandDistanceUpperBound(island, point) > 0.25 &&
      islandInlandDistance(island, point) > 0.25
    )
      return island.id;
  return coastInlandDistance(coast, point) > 0.25 ? 'mainland' : undefined;
}

/** Both endpoints and every intervening physical shore interval must be water. */
export function isSeaSegment(world: CoastWorld, a: CoastPoint, b: CoastPoint): boolean {
  const coast = createCoastGeometry(world);
  if (
    !coast ||
    ![a, b].every(
      (point) =>
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.x >= 0 &&
        point.y >= 0 &&
        point.x <= coast.worldSize &&
        point.y <= coast.worldSize &&
        isSeaPoint(world, point),
    )
  )
    return false;
  const cuts = coastSegmentCuts(coast, a, b);
  for (let index = 1; index < cuts.length; index++) {
    const t = (cuts[index - 1] + cuts[index]) / 2;
    if (coastInlandDistance(coast, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }) > 0.25)
      return false;
  }
  return true;
}
