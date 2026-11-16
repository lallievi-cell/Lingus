/** Geography is generated in world coordinates, then translated into a local
 * kilometre. Adjacent regions therefore share the very same physical edges. */
export const WORLD_REGIONS = 4;
export const WORLD_REGION_SIZE = 1000;
export type WorldPoint = { x: number; y: number };
export type WorldShoreEdge = { a: WorldPoint; b: WorldPoint; inward: 1 | -1 };
export interface WorldLandmass {
  id: string;
  points: readonly WorldPoint[];
  holes: readonly (readonly WorldPoint[])[];
}
export interface WorldRegionGeometry {
  seed: number;
  regionX: number;
  regionY: number;
  worldSize: 1000;
  /** Complete polygons in local coordinates; vertices may lie outside the region. */
  landmasses: readonly WorldLandmass[];
  /** Actual shores only, clipped to this region. Map borders are not shorelines. */
  shoreEdges: readonly WorldShoreEdge[];
}
type RegionAddress = { seed: number; regionX: number; regionY: number };
const regions = new Map<string, WorldRegionGeometry>();
const orientation = (points: readonly WorldPoint[]) => {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index],
      b = points[(index + 1) % points.length];
    area += a.x * b.y - a.y * b.x;
  }
  return area >= 0 ? 1 : -1;
};
function stream(seed: number) {
  let value = (seed ^ 0x63ca71e5) >>> 0;
  return () => (value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const frozenPoints = (points: WorldPoint[]) =>
  Object.freeze(points.map((point) => Object.freeze(point)));

/** Liang–Barsky clipping retains a single original straight edge. */
function clip(a: WorldPoint, b: WorldPoint): [WorldPoint, WorldPoint] | undefined {
  let low = 0,
    high = 1;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  for (const [p, q] of [
    [-dx, a.x],
    [dx, 1000 - a.x],
    [-dy, a.y],
    [dy, 1000 - a.y],
  ]) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return undefined;
    } else if (p < 0) low = Math.max(low, q / p);
    else high = Math.min(high, q / p);
    if (low > high) return undefined;
  }
  if (high - low < 1e-12) return undefined;
  return [
    { x: a.x + dx * low, y: a.y + dy * low },
    { x: a.x + dx * high, y: a.y + dy * high },
  ];
}

export function getWorldRegionGeometry(address: RegionAddress): WorldRegionGeometry {
  const { seed, regionX, regionY } = address;
  const key = `${seed}:${regionX}:${regionY}`;
  const cached = regions.get(key);
  if (cached) return cached;
  const random = stream(seed);
  const polygon = (coordinates: number[][], jitter = 24) =>
    frozenPoints(
      coordinates.map(([x, y]) => ({
        x: x + (random() - 0.5) * jitter - regionX * 1000,
        y: y + (random() - 0.5) * jitter - regionY * 1000,
      })),
    );
  const ellipse = (x: number, y: number, rx: number, ry: number, count = 20) => {
    const phase = (random() - 0.5) * 0.2;
    return polygon(
      Array.from({ length: count }, (_, index) => {
        const angle = phase + (index * Math.PI * 2) / count;
        return [x + Math.cos(angle) * rx, y + Math.sin(angle) * ry];
      }),
      12,
    );
  };
  // The first continent deliberately retains a generous dry opening around
  // (550,550), while its eastern and southern reaches cross regional borders.
  const landmasses: WorldLandmass[] = [
    {
      id: 'continent-west',
      points: polygon([
        [78, 78],
        [1320, 65],
        [1510, 300],
        [1440, 870],
        [1710, 1240],
        [1500, 1650],
        [1160, 1800],
        [900, 1570],
        [420, 1830],
        [65, 1470],
      ]),
      holes: [],
    },
    {
      id: 'continent-east',
      points: polygon([
        [2220, 1460],
        [2780, 1350],
        [3290, 1680],
        [3700, 2210],
        [3640, 3000],
        [3200, 3550],
        [2460, 3650],
        [2050, 3290],
        [1840, 2740],
        [1920, 2140],
      ]),
      holes: [ellipse(2730, 2480, 300, 350, 24)],
    },
    { id: 'island-northwest', points: ellipse(2280, 560, 220, 190), holes: [] },
    { id: 'island-northeast', points: ellipse(3000, 830, 260, 230), holes: [] },
    { id: 'island-far-north', points: ellipse(3560, 450, 170, 210), holes: [] },
    { id: 'island-southwest', points: ellipse(470, 2740, 270, 330), holes: [] },
    { id: 'island-south', points: ellipse(1110, 3370, 240, 210), holes: [] },
  ].map((landmass) => Object.freeze({ ...landmass, holes: Object.freeze(landmass.holes) }));
  const shoreEdges: WorldShoreEdge[] = [];
  for (const landmass of landmasses)
    for (const [ring, hole] of [
      [landmass.points, false],
      ...landmass.holes.map((points) => [points, true] as const),
    ] as const) {
      const inward = (orientation(ring) * (hole ? -1 : 1)) as 1 | -1;
      for (let index = 0; index < ring.length; index++) {
        const endpoints = clip(ring[index], ring[(index + 1) % ring.length]);
        if (endpoints)
          shoreEdges.push(
            Object.freeze({
              a: Object.freeze(endpoints[0]),
              b: Object.freeze(endpoints[1]),
              inward,
            }),
          );
      }
    }
  const geometry = Object.freeze({
    seed,
    regionX,
    regionY,
    worldSize: 1000 as const,
    landmasses: Object.freeze(landmasses),
    shoreEdges: Object.freeze(shoreEdges),
  });
  regions.set(key, geometry);
  if (regions.size > 24) regions.delete(regions.keys().next().value!);
  return geometry;
}

type RingModel = {
  points: readonly WorldPoint[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};
const rings = new WeakMap<readonly WorldPoint[], RingModel>();
function model(points: readonly WorldPoint[]) {
  let value = rings.get(points);
  if (!value) {
    value = {
      points,
      minX: Math.min(...points.map((p) => p.x)),
      maxX: Math.max(...points.map((p) => p.x)),
      minY: Math.min(...points.map((p) => p.y)),
      maxY: Math.max(...points.map((p) => p.y)),
    };
    rings.set(points, value);
  }
  return value;
}
function outsideBound(ring: RingModel, point: WorldPoint) {
  return -Math.hypot(
    Math.max(ring.minX - point.x, 0, point.x - ring.maxX),
    Math.max(ring.minY - point.y, 0, point.y - ring.maxY),
  );
}
/** Even–odd membership permits the concave continental bays; unlike the old
 * offshore ellipse helper this does not assume a convex polygon. */
function ringDistance(points: readonly WorldPoint[], point: WorldPoint) {
  let inside = false,
    nearest = Infinity;
  for (let index = 0; index < points.length; index++) {
    const a = points[index],
      b = points[(index + 1) % points.length];
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)),
    );
    nearest = Math.min(nearest, (point.x - a.x - dx * t) ** 2 + (point.y - a.y - dy * t) ** 2);
    if (a.y > point.y !== b.y > point.y && point.x < a.x + ((point.y - a.y) * dx) / dy)
      inside = !inside;
  }
  return Math.sqrt(nearest) * (inside ? 1 : -1);
}
function landDistance(landmass: WorldLandmass, point: WorldPoint) {
  let value = ringDistance(landmass.points, point);
  for (const hole of landmass.holes) value = Math.min(value, -ringDistance(hole, point));
  return value;
}
export function worldLandDistance(geometry: WorldRegionGeometry, point: WorldPoint) {
  let nearest = -Infinity;
  for (const landmass of geometry.landmasses) {
    const bound = outsideBound(model(landmass.points), point);
    if (bound < 0 && bound <= nearest) continue;
    nearest = Math.max(nearest, landDistance(landmass, point));
  }
  return nearest;
}
export function worldLandmassAt(
  geometry: WorldRegionGeometry,
  point: WorldPoint,
): string | undefined {
  return geometry.landmasses.find(
    (landmass) =>
      outsideBound(model(landmass.points), point) === 0 && landDistance(landmass, point) > 0.25,
  )?.id;
}

/** All contour crossings are among edge-parallel offsets and vertex circles.
 * Extra cuts are harmless; no submerged interval can be skipped between them. */
export function worldSegmentCuts(
  geometry: WorldRegionGeometry,
  a: WorldPoint,
  b: WorldPoint,
  offset = 0.25,
) {
  const cuts = [0, 1],
    dx = b.x - a.x,
    dy = b.y - a.y,
    squared = dx * dx + dy * dy;
  if (!squared) return cuts;
  const radius = Math.abs(offset),
    add = (t: number) => {
      if (t > 0 && t < 1) cuts.push(t);
    };
  const minX = Math.min(a.x, b.x) - radius,
    maxX = Math.max(a.x, b.x) + radius;
  const minY = Math.min(a.y, b.y) - radius,
    maxY = Math.max(a.y, b.y) + radius;
  for (const landmass of geometry.landmasses)
    for (const points of [landmass.points, ...landmass.holes])
      for (let index = 0; index < points.length; index++) {
        const p = points[index],
          q = points[(index + 1) % points.length];
        if (
          Math.max(p.x, q.x) < minX ||
          Math.min(p.x, q.x) > maxX ||
          Math.max(p.y, q.y) < minY ||
          Math.min(p.y, q.y) > maxY
        )
          continue;
        const ex = q.x - p.x,
          ey = q.y - p.y,
          length = Math.hypot(ex, ey);
        const cross = ex * (a.y - p.y) - ey * (a.x - p.x),
          delta = ex * dy - ey * dx;
        if (Math.abs(delta) > 1e-12)
          for (const side of radius ? [-radius, radius] : [0]) {
            const t = (side * length - cross) / delta;
            const projection =
              ((a.x + dx * t - p.x) * ex + (a.y + dy * t - p.y) * ey) / (length * length);
            if (projection >= -1e-10 && projection <= 1 + 1e-10) add(t);
          }
        if (radius)
          for (const vertex of [p, q]) {
            const vx = a.x - vertex.x,
              vy = a.y - vertex.y;
            const linear = vx * dx + vy * dy;
            const discriminant = linear * linear - squared * (vx * vx + vy * vy - radius * radius);
            if (discriminant >= 0) {
              const root = Math.sqrt(discriminant);
              add((-linear - root) / squared);
              add((-linear + root) / squared);
            }
          }
      }
  return cuts.sort((left, right) => left - right);
}

/** The complete streams are fixed before clipping, including their regional
 * seam positions. Neither local sectors nor simulation RNG can move them. */
export function getWorldRiverSegments(address: RegionAddress): [WorldPoint, WorldPoint][] {
  const random = stream(address.seed ^ 0x721ae53b);
  const west = [180, 600, 1000, 1400, 1930].map((y) => ({ x: 855 + (random() - 0.5) * 36, y }));
  const east = [
    [3310, 1650],
    [3380, 2100],
    [3290, 2600],
    [3200, 3100],
    [3050, 3820],
  ].map(([x, y]) => ({ x: x + (random() - 0.5) * 32, y }));
  const result: [WorldPoint, WorldPoint][] = [];
  for (const river of [west, east])
    for (let index = 1; index < river.length; index++) {
      const translate = (p: WorldPoint) => ({
        x: p.x - address.regionX * 1000,
        y: p.y - address.regionY * 1000,
      });
      const part = clip(translate(river[index - 1]), translate(river[index]));
      if (part) result.push(part);
    }
  return result;
}
