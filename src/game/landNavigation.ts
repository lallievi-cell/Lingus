import type { GameState } from './types';
import { createRiverArtGeometry, sampleRiverArt } from './riverGeometry';

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

const WORLD_SIZE = 500;
const WATER_RADIUS = 6.25; // Painted half-width six plus a quarter-metre foot clearance.
const BUCKET_SIZE = 16;
const GRID_STEP = 4;
const GRID_SIDE = WORLD_SIZE / GRID_STEP + 1;
const NODE_COUNT = GRID_SIDE * GRID_SIDE;
const EPSILON = 1e-8;
type Segment = { a: LandPoint; b: LandPoint };
type Grid = { land: Uint8Array; checked: Uint8Array; edges: Uint8Array };
type Model = {
  buckets: Map<number, Segment[]>;
  fords: readonly RiverFord[];
  routes: Map<string, readonly LandPoint[] | null>;
  grid?: Grid;
};
const models = new Map<string, Model>();
// Geography does not change within a running state; ticking copies the state.
// Imported maps get a new key from their actual sectors, not their evolving RNG.
const stateModels = new WeakMap<GameState, Model>();
const distance = (a: LandPoint, b: LandPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const finitePoint = (p: LandPoint) => Number.isFinite(p.x) && Number.isFinite(p.y);
const inside = (p: LandPoint) =>
  finitePoint(p) && p.x >= 0 && p.x <= WORLD_SIZE && p.y >= 0 && p.y <= WORLD_SIZE;
const bucketId = (x: number, y: number) => y * 64 + x;
const nodePoint = (node: number): LandPoint => ({
  x: (node % GRID_SIDE) * GRID_STEP,
  y: Math.floor(node / GRID_SIDE) * GRID_STEP,
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
  const geometry = createRiverArtGeometry(state);
  const buckets = new Map<number, Segment[]>();
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
        !inside(bankA) ||
        !inside(bankB) ||
        center.x < 20 ||
        center.x > 480 ||
        center.y < 20 ||
        center.y > 480
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
  return { buckets, fords: Object.freeze(fords), routes: new Map() };
}

function modelFor(state: GameState) {
  const existing = stateModels.get(state);
  if (existing) return existing;
  const generation = state.mapGeneration;
  const key = `${generation?.mode}:${generation?.seed}:${generation?.landNavigation}:${state.sectors.map((sector) => `${sector.x},${sector.y}:${sector.biome}`).join('|')}`;
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
  if (!inside(point)) return false;
  return !pointInRiver(model, point) || model.fords.some((ford) => isInRiverFord(point, ford));
}

export function isLandPoint(state: GameState, point: LandPoint) {
  return navigationEnabled(state) ? pointOnLand(modelFor(state), point) : inside(point);
}

/** A traversable ford is still water, so it cannot support a building or town. */
export function isDryLandPoint(state: GameState, point: LandPoint) {
  if (!inside(point)) return false;
  return !navigationEnabled(state) || !pointInRiver(modelFor(state), point);
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
  for (let visits = 0; visits < 130; visits++) {
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

function gridFor(model: Model) {
  if (!model.grid) {
    const land = new Uint8Array(NODE_COUNT);
    for (let node = 0; node < NODE_COUNT; node++)
      land[node] = Number(pointOnLand(model, nodePoint(node)));
    model.grid = { land, checked: new Uint8Array(NODE_COUNT), edges: new Uint8Array(NODE_COUNT) };
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
      if (nx < 0 || nx >= GRID_SIDE || ny < 0 || ny >= GRID_SIDE) continue;
      const node = ny * GRID_SIDE + nx;
      if (grid.land[node]) candidates.push({ node, distance: distance(point, nodePoint(node)) });
    }
  candidates.sort((a, b) => a.distance - b.distance || a.node - b.node);
  return candidates.find((entry) => clearSegment(model, point, nodePoint(entry.node)))?.node;
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

function shortestGridPath(model: Model, start: number, goal: number) {
  const key = `${start}:${goal}`;
  if (model.routes.has(key)) return model.routes.get(key)!;
  const grid = gridFor(model),
    target = nodePoint(goal);
  const costs = new Float64Array(NODE_COUNT);
  costs.fill(Infinity);
  costs[start] = 0;
  const previous = new Int32Array(NODE_COUNT);
  previous.fill(-1);
  const closed = new Uint8Array(NODE_COUNT),
    heap = new MinHeap();
  heap.push(start, distance(nodePoint(start), target));
  let found = false;
  while (heap.size) {
    const current = heap.pop()!.node;
    if (closed[current]) continue;
    if (current === goal) {
      found = true;
      break;
    }
    closed[current] = 1;
    const x = current % GRID_SIDE,
      y = Math.floor(current / GRID_SIDE),
      origin = nodePoint(current);
    for (let index = 0; index < directions.length; index++) {
      const [dx, dy] = directions[index],
        nx = x + dx,
        ny = y + dy;
      if (nx < 0 || nx >= GRID_SIDE || ny < 0 || ny >= GRID_SIDE) continue;
      const node = ny * GRID_SIDE + nx;
      if (closed[node] || !grid.land[node]) continue;
      const bit = 1 << index;
      if (!(grid.checked[current] & bit)) {
        grid.checked[current] |= bit;
        if (clearSegment(model, origin, nodePoint(node))) grid.edges[current] |= bit;
      }
      if (!(grid.edges[current] & bit)) continue;
      const cost = costs[current] + GRID_STEP * (dx && dy ? Math.SQRT2 : 1);
      if (cost >= costs[node]) continue;
      costs[node] = cost;
      previous[node] = current;
      heap.push(node, cost + distance(nodePoint(node), target));
    }
  }
  let result: readonly LandPoint[] | null = null;
  if (found) {
    const path: LandPoint[] = [];
    for (let node = goal; node !== -1; node = previous[node]) path.push(nodePoint(node));
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
  let current = start,
    index = 0;
  while (index < points.length) {
    let next = points.length - 1;
    while (next > index && !clearSegment(model, current, points[next])) next--;
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
  if (!pointOnLand(model, start) || !pointOnLand(model, end)) return null;
  if (distance(start, end) <= EPSILON) return [];
  if (clearSegment(model, start, end)) return [{ ...end }];
  const first = connectedNode(model, start),
    last = connectedNode(model, end);
  if (first === undefined || last === undefined) return null;
  const path = shortestGridPath(model, first, last);
  return path ? smoothPath(model, start, [...path, end]) : null;
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
  for (const waypoint of route) {
    if (remaining <= 0) return false;
    const length = distance(point, waypoint),
      step = Math.min(length, remaining),
      from = onSegment ? { x: point.x, y: point.y } : undefined;
    if (length <= remaining) {
      point.x = waypoint.x;
      point.y = waypoint.y;
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
