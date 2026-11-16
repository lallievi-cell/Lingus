import type { CoastPoint } from './coastGeometry';

export interface CoastIsland {
  id: string;
  points: readonly CoastPoint[];
}

const islandModels = new WeakMap<
  CoastIsland,
  {
    orientation: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    edges: { a: CoastPoint; dx: number; dy: number; length: number; squared: number }[];
  }
>();
function islandModel(island: CoastIsland) {
  let model = islandModels.get(island);
  if (!model) {
    const xs = island.points.map((point) => point.x),
      ys = island.points.map((point) => point.y);
    model = {
      orientation: polygonOrientation(island.points),
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
      edges: island.points.map((a, index) => {
        const b = island.points[(index + 1) % island.points.length],
          dx = b.x - a.x,
          dy = b.y - a.y;
        return { a, dx, dy, length: Math.hypot(dx, dy), squared: dx * dx + dy * dy };
      }),
    };
    islandModels.set(island, model);
  }
  return model;
}

/** Cheap conservative bound lets inland navigation avoid offshore polygons. */
export function islandDistanceUpperBound(island: CoastIsland, point: CoastPoint) {
  const model = islandModel(island);
  const dx = Math.max(model.minX - point.x, 0, point.x - model.maxX),
    dy = Math.max(model.minY - point.y, 0, point.y - model.maxY);
  return dx || dy ? -Math.hypot(dx, dy) : Infinity;
}

/** Any disk inside the polygon also fits its bounding box. Its radius, and
 * therefore every positive signed distance, is at most this semispan. */
export function islandInlandDistanceLimit(island: CoastIsland) {
  const { minX, maxX, minY, maxY } = islandModel(island);
  return Math.min(maxX - minX, maxY - minY) / 2;
}

/** A separate, original-seed stream leaves the mainland and its resources intact. */
export function createCoastIslands(
  seed: number,
  side: 'north' | 'south' | 'west' | 'east',
): readonly CoastIsland[] {
  let value = (seed ^ 0x15a1e7b3) >>> 0;
  const random = () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
  const horizontal = side === 'north' || side === 'south';
  const across = side === 'north' || side === 'west' ? 30 : 970;
  return Object.freeze(
    [300, 700].map((along, index) => {
      const center = along + (random() - 0.5) * 24;
      const acrossRadius = 15 + random() * 3;
      const alongRadius = 48 + random() * 12;
      const phase = random() * Math.PI * 0.1;
      const points = Array.from({ length: 20 }, (_, vertex) => {
        const angle = phase + (vertex * Math.PI * 2) / 20;
        const a = center + Math.cos(angle) * alongRadius;
        const c = across + Math.sin(angle) * acrossRadius;
        return Object.freeze(horizontal ? { x: a, y: c } : { x: c, y: a });
      });
      return Object.freeze({ id: `island-${index + 1}`, points: Object.freeze(points) });
    }),
  );
}

export function polygonOrientation(points: readonly CoastPoint[]) {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index],
      b = points[(index + 1) % points.length];
    area += a.x * b.y - a.y * b.x;
  }
  return area >= 0 ? 1 : -1;
}

/** Euclidean signed distance to the convex physical island polygon. */
export function islandInlandDistance(island: CoastIsland, point: CoastPoint) {
  const { orientation, edges } = islandModel(island);
  let inside = true,
    nearestSquared = Infinity;
  for (const { a, dx, dy, squared } of edges) {
    if (orientation * (dx * (point.y - a.y) - dy * (point.x - a.x)) < -1e-10) inside = false;
    const fraction = Math.max(
      0,
      Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / squared),
    );
    nearestSquared = Math.min(
      nearestSquared,
      (point.x - a.x - fraction * dx) ** 2 + (point.y - a.y - fraction * dy) ** 2,
    );
  }
  return Math.sqrt(nearestSquared) * (inside ? 1 : -1);
}

/** Exact interval inside the convex polygon inset by a nonnegative distance. */
export function islandSegmentInterval(
  island: CoastIsland,
  a: CoastPoint,
  b: CoastPoint,
  inset = 0.25,
): [number, number] | undefined {
  const { orientation, edges, minX, maxX, minY, maxY } = islandModel(island);
  if (
    Math.max(a.x, b.x) < minX + inset ||
    Math.min(a.x, b.x) > maxX - inset ||
    Math.max(a.y, b.y) < minY + inset ||
    Math.min(a.y, b.y) > maxY - inset
  )
    return undefined;
  let low = 0,
    high = 1;
  for (const { a: start, dx, dy, length } of edges) {
    const from = (orientation * (dx * (a.y - start.y) - dy * (a.x - start.x))) / length - inset;
    const delta = (orientation * (dx * (b.y - a.y) - dy * (b.x - a.x))) / length;
    if (Math.abs(delta) < 1e-12) {
      if (from < 0) return undefined;
    } else if (delta > 0) low = Math.max(low, -from / delta);
    else high = Math.min(high, -from / delta);
    if (low > high) return undefined;
  }
  return [low, high];
}
