import type { GameState } from './types';
import { createRiverArtGeometry, sampleRiverArt } from './riverGeometry';
import { getWorldSize } from './worldDimensions';
import { islandDistanceUpperBound, islandInlandDistance } from './islandGeometry';
import {
  createCoastGeometry,
  coastInlandDistance,
  isCoastLandSegment,
  type CoastGeometry,
} from './coastGeometry';
import {
  terrainPointAtEffort,
  terrainSegmentEffort,
  terrainTravelCost,
  type BiomeWorld,
} from './biomes';

export type LandPoint = { x: number; y: number };
export interface RiverFord extends LandPoint {
  id: string;
  bankA: LandPoint;
  bankB: LandPoint;
  /** Traversable width along the stream, in simulation metres. */
  width: number;
  /** Unit direction across the stream, from bankA to bankB. */
  dx: number;
  dy: number;
}

const WATER_RADIUS = 6.25; // Painted half-width six plus a quarter-metre foot clearance.
const BUCKET_SIZE = 16;
const GRID_STEP = 4;
const EPSILON = 1e-8;
type Segment = { a: LandPoint; b: LandPoint };
type Grid = { land: Uint8Array; checked: Uint8Array; edges: Uint8Array };
type Model = {
  worldSize: number;
  maritime: boolean;
  coast?: CoastGeometry;
  gridSide: number;
  nodeCount: number;
  buckets: Map<string, Segment[]>;
  fords: readonly RiverFord[];
  routes: Map<string, readonly LandPoint[] | null>;
  /** Exact observations include attachment and effort-preserving smoothing. */
  plannedRoutes: Map<string, readonly LandPoint[] | null>;
  /** Only the new biome rules change route effort; older maps keep metre costs. */
  terrain?: BiomeWorld;
  terrainCosts?: Float64Array;
  grid?: Grid;
};
const models = new Map<string, Model>();
// Geography does not change within a running state; ticking copies the state.
// Imported maps get a new key from their actual sectors, not their evolving RNG.
const stateModels = new WeakMap<GameState, Model>();
const distance = (a: LandPoint, b: LandPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const finitePoint = (p: LandPoint) => Number.isFinite(p.x) && Number.isFinite(p.y);
const inside = (p: LandPoint, worldSize: number) =>
  finitePoint(p) && p.x >= 0 && p.x <= worldSize && p.y >= 0 && p.y <= worldSize;
const bucketId = (x: number, y: number) => `${x}:${y}`;
const nodePoint = (model: Model, node: number): LandPoint => ({
  x: (node % model.gridSide) * GRID_STEP,
  y: Math.floor(node / model.gridSide) * GRID_STEP,
});
const navigationEnabled = (state: GameState) => state.mapGeneration?.landNavigation === 1;

export function isInRiverFord(point: LandPoint, ford: RiverFord) {
  const x = point.x - ford.x,
    y = point.y - ford.y;
  return (
    Math.abs(x * ford.dx + y * ford.dy) <= 10 + EPSILON &&
    Math.abs(-x * ford.dy + y * ford.dx) <= ford.width / 2 + EPSILON
  );
}

function createModel(state: GameState): Model {
  const worldSize = getWorldSize(state);
  const gridSide = worldSize / GRID_STEP + 1;
  const geometry = createRiverArtGeometry(state);
  const coast = createCoastGeometry(state);
  const buckets = new Map<string, Segment[]>();
  for (let index = 1; index < geometry.points.length; index++) {
    const a = geometry.points[index - 1],
      b = geometry.points[index];
    const segment = { a, b };
    const x0 = Math.floor((Math.min(a.x, b.x) - WATER_RADIUS) / BUCKET_SIZE);
    const x1 = Math.floor((Math.max(a.x, b.x) + WATER_RADIUS) / BUCKET_SIZE);
    const y0 = Math.floor((Math.min(a.y, b.y) - WATER_RADIUS) / BUCKET_SIZE);
    const y1 = Math.floor((Math.max(a.y, b.y) + WATER_RADIUS) / BUCKET_SIZE);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const key = bucketId(x, y);
        const entries = buckets.get(key);
        if (entries) entries.push(segment);
        else buckets.set(key, [segment]);
      }
  }
  const fords: RiverFord[] = [];
  for (let target = 70; target <= geometry.length - 30; target += 110) {
    // Prefer a nearby straight reach, leaving rounded banks and map edges alone.
    for (const offset of [0, 12, -12, 24, -24, 36, -36]) {
      const along = target + offset;
      if (along < 30 || along > geometry.length - 30) continue;
      const center = sampleRiverArt(geometry, along);
      const before = sampleRiverArt(geometry, along - 16);
      const after = sampleRiverArt(geometry, along + 16);
      if (before.dx * after.dx + before.dy * after.dy < 0.995) continue;
      const dx = -center.dy,
        dy = center.dx;
      const bankA = { x: center.x - dx * 10, y: center.y - dy * 10 };
      const bankB = { x: center.x + dx * 10, y: center.y + dy * 10 };
      if (
        (coast &&
          (coastInlandDistance(coast, bankA) <= 0.25 ||
            coastInlandDistance(coast, bankB) <= 0.25)) ||
        !inside(bankA, worldSize) ||
        !inside(bankB, worldSize) ||
        center.x < 20 ||
        center.x > worldSize - 20 ||
        center.y < 20 ||
        center.y > worldSize - 20
      )
        continue;
      if (fords.some((ford) => distance(ford, center) < 50)) continue;
      fords.push(
        Object.freeze({
          id: `ford-${fords.length}`,
          x: center.x,
          y: center.y,
          bankA: Object.freeze(bankA),
          bankB: Object.freeze(bankB),
          width: 9,
          dx,
          dy,
        }),
      );
      break;
    }
  }
  return {
    worldSize,
    maritime: state.mapGeneration?.maritimeRules === 1,
    coast,
    gridSide,
    nodeCount: gridSide * gridSide,
    buckets,
    fords: Object.freeze(fords),
    routes: new Map(),
    plannedRoutes: new Map(),
    ...(state.mapGeneration?.biomeRules === 1
      ? {
          // Biome helpers read only geography. Keep that immutable snapshot,
          // rather than retaining an imported campaign's units and history in
          // the bounded route cache for as long as its geography stays hot.
          terrain: {
            mapGeneration: { ...state.mapGeneration },
            sectors: state.sectors,
          },
          terrainCosts: (() => {
            const side = worldSize / 100,
              costs = new Float64Array(side * side);
            costs.fill(1);
            for (const sector of state.sectors)
              costs[sector.y * side + sector.x] = terrainTravelCost(state, {
                x: sector.x * 100 + 50,
                y: sector.y * 100 + 50,
              });
            return costs;
          })(),
        }
      : {}),
  };
}

function modelFor(state: GameState) {
  const existing = stateModels.get(state);
  if (
    existing?.worldSize === getWorldSize(state) &&
    Boolean(existing.terrain) === (state.mapGeneration?.biomeRules === 1) &&
    Boolean(existing.coast) === (state.mapGeneration?.coastalRules === 1) &&
    existing.maritime === (state.mapGeneration?.maritimeRules === 1)
  )
    return existing;
  const generation = state.mapGeneration;
  const key = `${getWorldSize(state)}:${generation?.mode}:${generation?.seed}:${generation?.landNavigation}:${generation?.biomeRules}:${generation?.coastalRules}:${generation?.maritimeRules}:${state.sectors.map((sector) => `${sector.x},${sector.y}:${sector.biome}`).join('|')}`;
  let model = models.get(key);
  if (!model) {
    model = createModel(state);
    if (models.size >= 8) models.delete(models.keys().next().value!);
  } else models.delete(key);
  models.set(key, model);
  stateModels.set(state, model);
  return model;
}

export function getRiverFords(state: GameState): readonly RiverFord[] {
  return navigationEnabled(state) ? modelFor(state).fords : [];
}

function pointInRiver(model: Model, point: LandPoint) {
  const candidates = model.buckets.get(
    bucketId(Math.floor(point.x / BUCKET_SIZE), Math.floor(point.y / BUCKET_SIZE)),
  );
  if (!candidates) return false;
  return candidates.some(({ a, b }) => {
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = Math.max(
      0,
      Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared),
    );
    return (point.x - a.x - dx * t) ** 2 + (point.y - a.y - dy * t) ** 2 <= WATER_RADIUS ** 2;
  });
}

function pointOnLand(model: Model, point: LandPoint) {
  if (
    !inside(point, model.worldSize) ||
    (model.coast && coastInlandDistance(model.coast, point) <= 0.25)
  )
    return false;
  return !pointInRiver(model, point) || model.fords.some((ford) => isInRiverFord(point, ford));
}

export function isLandPoint(state: GameState, point: LandPoint) {
  return navigationEnabled(state)
    ? pointOnLand(modelFor(state), point)
    : inside(point, getWorldSize(state));
}

/** A traversable ford is still water, so it cannot support a building or town. */
export function isDryLandPoint(state: GameState, point: LandPoint) {
  if (!inside(point, getWorldSize(state))) return false;
  if (!navigationEnabled(state)) return true;
  const model = modelFor(state);
  return (
    (!model.coast || coastInlandDistance(model.coast, point) > 0.25) && !pointInRiver(model, point)
  );
}

type Interval = [number, number];
function slab(value: number, delta: number, min: number, max: number): Interval | null {
  if (Math.abs(delta) <= EPSILON) return value >= min && value <= max ? [0, 1] : null;
  const a = (min - value) / delta,
    b = (max - value) / delta;
  const lo = Math.max(0, Math.min(a, b)),
    hi = Math.min(1, Math.max(a, b));
  return lo <= hi ? [lo, hi] : null;
}
function intersect(a: Interval | null, b: Interval | null): Interval | null {
  if (!a || !b) return null;
  const lo = Math.max(a[0], b[0]),
    hi = Math.min(a[1], b[1]);
  return lo <= hi ? [lo, hi] : null;
}
function circleInterval(a: LandPoint, dx: number, dy: number, center: LandPoint): Interval | null {
  const x = a.x - center.x,
    y = a.y - center.y;
  const lengthSquared = dx * dx + dy * dy;
  const projection = x * dx + y * dy;
  const discriminant =
    projection * projection - lengthSquared * (x * x + y * y - WATER_RADIUS ** 2);
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const lo = Math.max(0, (-projection - root) / lengthSquared);
  const hi = Math.min(1, (-projection + root) / lengthSquared);
  return lo <= hi ? [lo, hi] : null;
}
function capsuleInterval(a: LandPoint, dx: number, dy: number, segment: Segment): Interval | null {
  const sx = segment.b.x - segment.a.x,
    sy = segment.b.y - segment.a.y;
  const length = Math.hypot(sx, sy),
    ux = sx / length,
    uy = sy / length;
  const x = a.x - segment.a.x,
    y = a.y - segment.a.y;
  const strip = intersect(
    slab(x * ux + y * uy, dx * ux + dy * uy, 0, length),
    slab(-x * uy + y * ux, -dx * uy + dy * ux, -WATER_RADIUS, WATER_RADIUS),
  );
  const start = circleInterval(a, dx, dy, segment.a),
    end = circleInterval(a, dx, dy, segment.b);
  const pieces = [strip, start, end].filter((piece): piece is Interval => !!piece);
  if (!pieces.length) return null;
  // A capsule is convex, so all its intersection pieces form one interval.
  return [
    Math.min(...pieces.map((piece) => piece[0])),
    Math.max(...pieces.map((piece) => piece[1])),
  ];
}
function crossedSegments(model: Model, a: LandPoint, b: LandPoint) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  let x = Math.floor(a.x / BUCKET_SIZE),
    y = Math.floor(a.y / BUCKET_SIZE);
  const endX = Math.floor(b.x / BUCKET_SIZE),
    endY = Math.floor(b.y / BUCKET_SIZE);
  const stepX = Math.sign(dx),
    stepY = Math.sign(dy);
  const deltaX = stepX ? BUCKET_SIZE / Math.abs(dx) : Infinity;
  const deltaY = stepY ? BUCKET_SIZE / Math.abs(dy) : Infinity;
  let nextX = stepX ? ((x + (stepX > 0 ? 1 : 0)) * BUCKET_SIZE - a.x) / dx : Infinity;
  let nextY = stepY ? ((y + (stepY > 0 ? 1 : 0)) * BUCKET_SIZE - a.y) / dy : Infinity;
  const result = new Set<Segment>();
  const maximumVisits = Math.abs(endX - x) + Math.abs(endY - y) + 1;
  for (let visits = 0; visits < maximumVisits; visits++) {
    for (const segment of model.buckets.get(bucketId(x, y)) ?? []) result.add(segment);
    if (x === endX && y === endY) break;
    if (nextX < nextY) {
      x += stepX;
      nextX += deltaX;
    } else if (nextY < nextX) {
      y += stepY;
      nextY += deltaY;
    } else {
      x += stepX;
      y += stepY;
      nextX += deltaX;
      nextY += deltaY;
    }
  }
  return result;
}
function clearSegment(model: Model, a: LandPoint, b: LandPoint) {
  if (!pointOnLand(model, a) || !pointOnLand(model, b)) return false;
  if (model.coast && !isCoastLandSegment(model.coast, a, b)) return false;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  if (dx * dx + dy * dy <= EPSILON ** 2) return true;
  const crossed = crossedSegments(model, a, b);
  if (!crossed.size) return true;
  const fordIntervals = model.fords
    .map((ford) => {
      const x = a.x - ford.x,
        y = a.y - ford.y;
      return intersect(
        slab(x * ford.dx + y * ford.dy, dx * ford.dx + dy * ford.dy, -10, 10),
        slab(
          -x * ford.dy + y * ford.dx,
          -dx * ford.dy + dy * ford.dx,
          -ford.width / 2,
          ford.width / 2,
        ),
      );
    })
    .filter((interval): interval is Interval => !!interval)
    .sort((a, b) => a[0] - b[0]);
  for (const segment of crossed) {
    const wet = capsuleInterval(a, dx, dy, segment);
    if (!wet) continue;
    let covered = wet[0],
      started = false;
    for (const interval of fordIntervals) {
      if (interval[0] > covered + EPSILON) break;
      if (interval[1] < wet[0] - EPSILON) continue;
      started = true;
      covered = Math.max(covered, interval[1]);
      if (covered >= wet[1] - EPSILON) break;
    }
    if (!started || covered < wet[1] - EPSILON) return false;
  }
  return true;
}

/** Useful for route risk estimates and visual history: this checks the real corridor. */
export function isLandSegment(state: GameState, a: LandPoint, b: LandPoint) {
  return navigationEnabled(state)
    ? clearSegment(modelFor(state), a, b)
    : finitePoint(a) && finitePoint(b);
}

/** A shore workstation's approach cannot cross river water, including a ford. */
export function isDryLandSegment(state: GameState, a: LandPoint, b: LandPoint) {
  if (!isDryLandPoint(state, a) || !isDryLandPoint(state, b)) return false;
  if (!navigationEnabled(state)) return true;
  const model = modelFor(state);
  if (model.coast && !isCoastLandSegment(model.coast, a, b)) return false;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  return [...crossedSegments(model, a, b)].every((segment) => !capsuleInterval(a, dx, dy, segment));
}

function gridFor(model: Model) {
  if (!model.grid) {
    const land = new Uint8Array(model.nodeCount);
    for (let node = 0; node < model.nodeCount; node++)
      land[node] = Number(pointOnLand(model, nodePoint(model, node)));
    model.grid = {
      land,
      checked: new Uint8Array(model.nodeCount),
      edges: new Uint8Array(model.nodeCount),
    };
  }
  return model.grid;
}

function connectedNode(model: Model, point: LandPoint) {
  const grid = gridFor(model);
  const x = Math.round(point.x / GRID_STEP),
    y = Math.round(point.y / GRID_STEP);
  const candidates: { node: number; distance: number }[] = [];
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || nx >= model.gridSide || ny < 0 || ny >= model.gridSide) continue;
      const node = ny * model.gridSide + nx;
      if (grid.land[node])
        candidates.push({ node, distance: distance(point, nodePoint(model, node)) });
    }
  candidates.sort((a, b) => a.distance - b.distance || a.node - b.node);
  return candidates.find((entry) => clearSegment(model, point, nodePoint(model, entry.node)))?.node;
}

class MinHeap {
  private entries: { node: number; score: number }[] = [];
  push(node: number, score: number) {
    const item = { node, score };
    let index = this.entries.length;
    this.entries.push(item);
    while (index > 0) {
      const parent = (index - 1) >>> 1;
      if (this.entries[parent].score <= score) break;
      this.entries[index] = this.entries[parent];
      index = parent;
    }
    this.entries[index] = item;
  }
  pop() {
    const first = this.entries[0],
      last = this.entries.pop();
    if (!this.entries.length || !last) return first;
    let index = 0;
    while (index * 2 + 1 < this.entries.length) {
      let child = index * 2 + 1;
      if (
        child + 1 < this.entries.length &&
        this.entries[child + 1].score < this.entries[child].score
      )
        child++;
      if (this.entries[child].score >= last.score) break;
      this.entries[index] = this.entries[child];
      index = child;
    }
    this.entries[index] = last;
    return first;
  }
  get size() {
    return this.entries.length;
  }
}

const directions = [
  [-1, 0],
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;

function segmentEffort(model: Model, from: LandPoint, to: LandPoint) {
  return model.terrain ? terrainSegmentEffort(model.terrain, from, to) : distance(from, to);
}

function gridEdgeEffort(model: Model, x: number, y: number, dx: number, dy: number) {
  const length = GRID_STEP * (dx && dy ? Math.SQRT2 : 1);
  if (!model.terrain) return length;
  if (model.coast) {
    const from = { x: x * GRID_STEP, y: y * GRID_STEP },
      to = { x: (x + dx) * GRID_STEP, y: (y + dy) * GRID_STEP },
      middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    // Only the narrow physical shore contour can cross a grid edge in its
    // interior; retain its exact integral without taxing inland A* searches.
    return coastInlandDistance(model.coast, middle) < 42
      ? terrainSegmentEffort(model.terrain, from, to)
      : length * terrainTravelCost(model.terrain, middle);
  }
  // 4 m divides the 100 m sector width: a grid edge never crosses a biome
  // boundary in its interior. Its midpoint gives the exact interval cost.
  const side = model.worldSize / 100,
    sx = Math.min(side - 1, Math.floor(((x + dx / 2) * GRID_STEP) / 100)),
    sy = Math.min(side - 1, Math.floor(((y + dy / 2) * GRID_STEP) / 100));
  return length * model.terrainCosts![sy * side + sx];
}

/** A cheaper detour must stay within the direct trip's effort ellipse. If no
 * lower-cost cell can meet it, the unobstructed segment is already optimal.
 * This avoids a grid search for ordinary short trips within one habitat. */
function directTerrainRouteIsOptimal(model: Model, start: LandPoint, end: LandPoint) {
  if (!model.terrain) return true;
  const length = distance(start, end),
    effort = segmentEffort(model, start, end),
    averageCost = effort / length;
  if (averageCost <= 1 + EPSILON) return true;
  const distanceToCell = (point: LandPoint, x: number, y: number) =>
    Math.hypot(
      Math.max(x - point.x, 0, point.x - x - 100),
      Math.max(y - point.y, 0, point.y - y - 100),
    );
  const side = model.worldSize / 100,
    // Any route cheaper than the direct effort lies inside this ellipse's
    // axis bounds. Local wildlife trips normally touch just one cell.
    x0 = Math.max(0, Math.floor((start.x + end.x - effort) / 200)),
    x1 = Math.min(side - 1, Math.floor((start.x + end.x + effort) / 200)),
    y0 = Math.max(0, Math.floor((start.y + end.y - effort) / 200)),
    y1 = Math.min(side - 1, Math.floor((start.y + end.y + effort) / 200));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (
        model.terrainCosts![y * side + x] < averageCost - EPSILON &&
        distanceToCell(start, x * 100, y * 100) + distanceToCell(end, x * 100, y * 100) < effort
      )
        return false;
  return true;
}

function shortestGridPath(model: Model, start: number, goal: number) {
  const key = `${start}:${goal}`;
  if (model.routes.has(key)) return model.routes.get(key)!;
  const grid = gridFor(model),
    target = nodePoint(model, goal);
  const costs = new Float64Array(model.nodeCount);
  costs.fill(Infinity);
  costs[start] = 0;
  const previous = new Int32Array(model.nodeCount);
  previous.fill(-1);
  const closed = new Uint8Array(model.nodeCount),
    heap = new MinHeap();
  heap.push(start, distance(nodePoint(model, start), target));
  let found = false;
  while (heap.size) {
    const current = heap.pop()!.node;
    if (closed[current]) continue;
    if (current === goal) {
      found = true;
      break;
    }
    closed[current] = 1;
    const x = current % model.gridSide,
      y = Math.floor(current / model.gridSide),
      origin = nodePoint(model, current);
    for (let index = 0; index < directions.length; index++) {
      const [dx, dy] = directions[index],
        nx = x + dx,
        ny = y + dy;
      if (nx < 0 || nx >= model.gridSide || ny < 0 || ny >= model.gridSide) continue;
      const node = ny * model.gridSide + nx;
      if (closed[node] || !grid.land[node]) continue;
      const bit = 1 << index;
      if (!(grid.checked[current] & bit)) {
        grid.checked[current] |= bit;
        if (clearSegment(model, origin, nodePoint(model, node))) grid.edges[current] |= bit;
      }
      if (!(grid.edges[current] & bit)) continue;
      const cost = costs[current] + gridEdgeEffort(model, x, y, dx, dy);
      if (cost >= costs[node]) continue;
      costs[node] = cost;
      previous[node] = current;
      heap.push(node, cost + distance(nodePoint(model, node), target));
    }
  }
  let result: readonly LandPoint[] | null = null;
  if (found) {
    const path: LandPoint[] = [];
    for (let node = goal; node !== -1; node = previous[node]) path.push(nodePoint(model, node));
    path.reverse();
    result = smoothPath(model, path[0], path.slice(1));
    result = [path[0], ...result];
  }
  if (model.routes.size >= 512) model.routes.delete(model.routes.keys().next().value!);
  model.routes.set(key, result);
  return result;
}

function smoothPath(model: Model, start: LandPoint, points: readonly LandPoint[]): LandPoint[] {
  const route: LandPoint[] = [];
  // Smoothing may remove bends, never the effort saving that justified them.
  const cumulative = model.terrain ? new Float64Array(points.length) : undefined;
  if (cumulative)
    for (let index = 0; index < points.length; index++)
      cumulative[index] =
        (index ? cumulative[index - 1] : 0) +
        segmentEffort(model, index ? points[index - 1] : start, points[index]);
  let current = start,
    index = 0;
  while (index < points.length) {
    let next = points.length - 1;
    while (
      next > index &&
      (!clearSegment(model, current, points[next]) ||
        (cumulative &&
          segmentEffort(model, current, points[next]) >
            cumulative[next] - (index ? cumulative[index - 1] : 0) + EPSILON))
    )
      next--;
    const destination = points[next];
    if (distance(current, destination) > EPSILON) route.push({ ...destination });
    current = destination;
    index = next + 1;
  }
  return route;
}

/** Pure route observation. An empty route means the destination is already reached. */
export function planLandRoute(
  state: GameState,
  start: LandPoint,
  end: LandPoint,
): LandPoint[] | null {
  if (!finitePoint(start) || !finitePoint(end)) return null;
  if (!navigationEnabled(state)) return distance(start, end) <= EPSILON ? [] : [{ ...end }];
  const model = modelFor(state);
  const key = `${start.x},${start.y}:${end.x},${end.y}`;
  const copyRoute = (route: readonly LandPoint[] | null) =>
    route?.map((point) => ({ x: point.x, y: point.y })) ?? null;
  if (model.plannedRoutes.has(key)) {
    const route = model.plannedRoutes.get(key)!;
    // Keep recurring city/source trips hot among short-lived moving targets.
    model.plannedRoutes.delete(key);
    model.plannedRoutes.set(key, route);
    return copyRoute(route);
  }
  const route = computeLandRoute(state, model, start, end);
  if (model.plannedRoutes.size >= 2048)
    model.plannedRoutes.delete(model.plannedRoutes.keys().next().value!);
  // These observations depend only on this model's immutable geography.
  // Empty paths and failures are geographic too; callers receive fresh points.
  model.plannedRoutes.set(key, copyRoute(route));
  return copyRoute(route);
}

function computeLandRoute(state: GameState, model: Model, start: LandPoint, end: LandPoint) {
  if (!pointOnLand(model, start) || !pointOnLand(model, end)) return null;
  // Offshore polygons are separate physical landmasses. Reject their absent
  // terrestrial connection before searching the entire mainland graph.
  if (model.coast?.islands?.length) {
    const landmass = (point: LandPoint) =>
      model.coast!.islands!.findIndex(
        (island) =>
          islandDistanceUpperBound(island, point) > 0.25 &&
          islandInlandDistance(island, point) > 0.25,
      );
    if (landmass(start) !== landmass(end)) return null;
  }
  if (distance(start, end) <= EPSILON) return [];
  const direct = clearSegment(model, start, end);
  if (direct && directTerrainRouteIsOptimal(model, start, end)) return [{ ...end }];
  const first = connectedNode(model, start),
    last = connectedNode(model, end);
  if (first === undefined || last === undefined) return direct ? [{ ...end }] : null;
  const path = shortestGridPath(model, first, last);
  if (!path) return direct ? [{ ...end }] : null;
  const route = smoothPath(model, start, [...path, end]);
  // Grid attachment can add a few metres. An available direct segment remains
  // a valid candidate and should win when it costs less than the grid route.
  return direct && landRouteEffort(state, start, route) >= segmentEffort(model, start, end)
    ? [{ ...end }]
    : route;
}

/** Walking-equivalent metres for travel time, including every actual ford leg. */
export function landRouteEffort(state: GameState, start: LandPoint, route: readonly LandPoint[]) {
  let total = 0,
    previous = start;
  for (const point of route) {
    total +=
      state.mapGeneration?.biomeRules === 1
        ? terrainSegmentEffort(state, previous, point)
        : distance(previous, point);
    previous = point;
  }
  return total;
}

/** Advance along actual land legs, conserving the complete physical movement budget. */
export function moveOnLand(
  state: GameState,
  point: LandPoint,
  target: LandPoint,
  maximumStep: number,
  onSegment?: (from: LandPoint, to: LandPoint) => void,
): boolean {
  if (!finitePoint(point) || !finitePoint(target) || !Number.isFinite(maximumStep)) return false;
  if (!navigationEnabled(state)) {
    const length = distance(point, target);
    if (length <= maximumStep) {
      const from = onSegment ? { x: point.x, y: point.y } : undefined;
      point.x = target.x;
      point.y = target.y;
      if (length > 0 && from) onSegment?.(from, { x: point.x, y: point.y });
      return true;
    }
    if (maximumStep <= 0) return false;
    const from = onSegment ? { x: point.x, y: point.y } : undefined;
    point.x += ((target.x - point.x) / length) * maximumStep;
    point.y += ((target.y - point.y) / length) * maximumStep;
    if (from) onSegment?.(from, { x: point.x, y: point.y });
    return false;
  }
  const route = planLandRoute(state, point, target);
  if (!route) return false;
  if (!route.length) return true;
  let remaining = Math.max(0, maximumStep);
  const terrain = state.mapGeneration?.biomeRules === 1;
  for (const waypoint of route) {
    if (remaining <= 0) return false;
    const length = terrain
        ? terrainSegmentEffort(state, point, waypoint)
        : distance(point, waypoint),
      step = Math.min(length, remaining),
      from = onSegment ? { x: point.x, y: point.y } : undefined;
    if (length <= remaining) {
      point.x = waypoint.x;
      point.y = waypoint.y;
    } else if (terrain) {
      const partial = terrainPointAtEffort(state, point, waypoint, step);
      point.x = partial.x;
      point.y = partial.y;
    } else {
      point.x += ((waypoint.x - point.x) / length) * step;
      point.y += ((waypoint.y - point.y) / length) * step;
    }
    remaining -= step;
    if (step > 0 && from) onSegment?.(from, { x: point.x, y: point.y });
    if (step < length) return false;
  }
  return true;
}
