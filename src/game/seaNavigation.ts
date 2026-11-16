import { isSeaPoint, isSeaSegment } from './coastGeometry';
import { getWorldSize, isWorldPoint } from './worldDimensions';
import type { GameState } from './types';

export type SeaPoint = { x: number; y: number };
const STEP = 4;
const EPSILON = 1e-8;
const distance = (a: SeaPoint, b: SeaPoint) => Math.hypot(a.x - b.x, a.y - b.y);
type SeaModel = {
  world: GameState;
  side: number;
  checked: Uint8Array;
  water: Uint8Array;
  routes: Map<string, readonly SeaPoint[] | null>;
};
const models = new Map<string, SeaModel>();

/** Water has its own graph. A terrestrial ford never becomes a sailing lane. */
function modelFor(state: GameState) {
  const generation = state.mapGeneration;
  const key = `${getWorldSize(state)}:${generation?.seed}:${generation?.coastalRules}:${generation?.maritimeRules}`;
  let model = models.get(key);
  if (!model) {
    const side = getWorldSize(state) / STEP + 1;
    model = {
      // Only geometry is read by the sea predicates; retain no campaign data.
      world: { mapGeneration: { ...generation }, sectors: state.sectors } as GameState,
      side,
      checked: new Uint8Array(side * side),
      water: new Uint8Array(side * side),
      routes: new Map(),
    };
    models.set(key, model);
    if (models.size > 12) models.delete(models.keys().next().value!);
  }
  return model;
}
const nodePoint = (model: SeaModel, node: number): SeaPoint => ({
  x: (node % model.side) * STEP,
  y: Math.floor(node / model.side) * STEP,
});
function waterNode(model: SeaModel, node: number) {
  if (!model.checked[node]) {
    model.checked[node] = 1;
    model.water[node] = Number(isSeaPoint(model.world, nodePoint(model, node)));
  }
  return model.water[node] === 1;
}
function attachment(model: SeaModel, point: SeaPoint) {
  const x = Math.round(point.x / STEP),
    y = Math.round(point.y / STEP);
  const nearby: { node: number; distance: number }[] = [];
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= model.side || ny >= model.side) continue;
      const node = ny * model.side + nx;
      if (waterNode(model, node))
        nearby.push({ node, distance: distance(point, nodePoint(model, node)) });
    }
  nearby.sort((a, b) => a.distance - b.distance);
  return nearby.find((candidate) =>
    isSeaSegment(model.world, point, nodePoint(model, candidate.node)),
  )?.node;
}

class MinHeap {
  private values: { node: number; priority: number }[] = [];
  push(node: number, priority: number) {
    let index = this.values.length;
    this.values.push({ node, priority });
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.values[parent].priority <= priority) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = { node, priority };
  }
  pop() {
    const first = this.values[0];
    const last = this.values.pop();
    if (!first || !last || !this.values.length) return first;
    let index = 0;
    while (index * 2 + 1 < this.values.length) {
      let child = index * 2 + 1;
      if (
        child + 1 < this.values.length &&
        this.values[child + 1].priority < this.values[child].priority
      )
        child++;
      if (this.values[child].priority >= last.priority) break;
      this.values[index] = this.values[child];
      index = child;
    }
    this.values[index] = last;
    return first;
  }
}
function search(model: SeaModel, first: number, last: number): SeaPoint[] | null {
  const count = model.side * model.side;
  const costs = new Float64Array(count);
  costs.fill(Infinity);
  costs[first] = 0;
  const parents = new Int32Array(count);
  parents.fill(-1);
  const closed = new Uint8Array(count);
  const heap = new MinHeap();
  const goal = nodePoint(model, last);
  heap.push(first, distance(nodePoint(model, first), goal));
  for (let item = heap.pop(); item; item = heap.pop()) {
    const node = item.node;
    if (closed[node]) continue;
    if (node === last) {
      const route: SeaPoint[] = [];
      for (let current = last; current >= 0; current = parents[current]) {
        route.push(nodePoint(model, current));
        if (current === first) break;
      }
      return route.reverse();
    }
    closed[node] = 1;
    const x = node % model.side,
      y = Math.floor(node / model.side),
      from = nodePoint(model, node);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= model.side || ny >= model.side) continue;
        const next = ny * model.side + nx;
        if (closed[next] || !waterNode(model, next)) continue;
        const to = nodePoint(model, next);
        if (!isSeaSegment(model.world, from, to)) continue;
        const cost = costs[node] + STEP * (dx && dy ? Math.SQRT2 : 1);
        if (cost + EPSILON >= costs[next]) continue;
        costs[next] = cost;
        parents[next] = node;
        heap.push(next, cost + distance(to, goal));
      }
  }
  return null;
}
function simplify(world: GameState, start: SeaPoint, path: SeaPoint[]) {
  const route: SeaPoint[] = [];
  let anchor = start;
  for (let index = 0; index < path.length; ) {
    let furthest = path.length - 1;
    while (furthest > index && !isSeaSegment(world, anchor, path[furthest])) furthest--;
    route.push({ ...path[furthest] });
    anchor = path[furthest];
    index = furthest + 1;
  }
  return route;
}

/** Exact endpoints and isolated copies: callers cannot alter another vessel's route. */
export function planSeaRoute(state: GameState, start: SeaPoint, end: SeaPoint): SeaPoint[] | null {
  if (
    state.mapGeneration?.maritimeRules !== 1 ||
    !isWorldPoint(state, start) ||
    !isWorldPoint(state, end) ||
    !isSeaPoint(state, start) ||
    !isSeaPoint(state, end)
  )
    return null;
  if (distance(start, end) <= EPSILON) return [];
  const model = modelFor(state),
    key = `${start.x},${start.y}>${end.x},${end.y}`;
  if (model.routes.has(key)) return model.routes.get(key)?.map((point) => ({ ...point })) ?? null;
  let route: SeaPoint[] | null = null;
  if (isSeaSegment(state, start, end)) route = [{ ...end }];
  else {
    const first = attachment(model, start),
      last = attachment(model, end);
    if (first !== undefined && last !== undefined) {
      const grid = search(model, first, last);
      if (grid) route = simplify(state, start, [...grid, { ...end }]);
    }
  }
  model.routes.set(key, route);
  if (model.routes.size > 256) model.routes.delete(model.routes.keys().next().value!);
  return route?.map((point) => ({ ...point })) ?? null;
}

export function seaRouteLength(start: SeaPoint, route: readonly SeaPoint[]) {
  let length = 0,
    previous = start;
  for (const point of route) {
    length += distance(previous, point);
    previous = point;
  }
  return length;
}
