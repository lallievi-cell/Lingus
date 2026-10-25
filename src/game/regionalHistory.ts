import type { Caravan, GameState, RegionalRoadSegment } from './types';

export const REGIONAL_ROUTE_GRID = 12.5;
export const REGIONAL_ROUTE_LIMIT = 2048;
export const REGIONAL_ROUTE_WEAR_LIMIT = 1_000_000;
type Point = { x: number; y: number };
const EPSILON = 1e-8;
const validPoint = (p: Point) =>
  Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 500 && p.y >= 0 && p.y <= 500;

/**
 * Record only the segment which really moved, never the remaining itinerary.
 * Grid crossings give repeated trips the same fragments regardless of tick size.
 * This is visual history: it cannot change speed, resources or simulation RNG.
 */
export function recordCaravanTravel(state: GameState, caravan: Caravan, previous: Point) {
  if (
    !['trade', 'tax'].includes(caravan.kind) ||
    caravan.hp <= 0 ||
    caravan.arrived ||
    (caravan.customsRefused && !caravan.returning) ||
    !validPoint(previous) ||
    !validPoint(caravan)
  )
    return;
  const dx = caravan.x - previous.x,
    dy = caravan.y - previous.y,
    distance = Math.hypot(dx, dy);
  if (distance < EPSILON) return;
  const direction = dx < -EPSILON || (Math.abs(dx) <= EPSILON && dy < 0) ? -1 : 1;
  const ux = (dx / distance) * direction,
    uy = (dy / distance) * direction;
  // Quantization absorbs ordinary floating point noise, not nearby parallel roads.
  const lineKey = `${Math.round(Math.atan2(uy, ux) * 10000)}:${Math.round((-uy * previous.x + ux * previous.y) * 1000)}`;
  const cuts = [0, 1];
  for (const [start, delta] of [
    [previous.x, dx],
    [previous.y, dy],
  ]) {
    if (Math.abs(delta) < EPSILON) continue;
    const end = start + delta;
    for (
      let edge = (Math.floor(Math.min(start, end) / REGIONAL_ROUTE_GRID) + 1) * REGIONAL_ROUTE_GRID;
      edge < Math.max(start, end) - EPSILON;
      edge += REGIONAL_ROUTE_GRID
    ) {
      const fraction = (edge - start) / delta;
      if (fraction > EPSILON && fraction < 1 - EPSILON) cuts.push(fraction);
    }
  }
  cuts.sort((a, b) => a - b);
  const fragments = (state.regionalRoutes ??= []);
  const baseKey = (key: string) => key.split(':').slice(0, 4).join(':');
  const groups = new Map<string, RegionalRoadSegment[]>();
  for (const segment of fragments) {
    const base = baseKey(segment.key);
    groups.set(base, [...(groups.get(base) ?? []), segment]);
  }
  const project = (p: Point) => p.x * ux + p.y * uy;
  for (let i = 1; i < cuts.length; i++) {
    const low = cuts[i - 1],
      high = cuts[i];
    if (high - low < EPSILON) continue;
    const from = { x: previous.x + dx * low, y: previous.y + dy * low },
      to = { x: previous.x + dx * high, y: previous.y + dy * high },
      middleX = (from.x + to.x) / 2,
      middleY = (from.y + to.y) / 2;
    const base = `${lineKey}:${Math.min(39, Math.floor(middleX / REGIONAL_ROUTE_GRID))}:${Math.min(39, Math.floor(middleY / REGIONAL_ROUTE_GRID))}`;
    const walked = distance * (high - low);
    const group = groups.get(base) ?? [];
    const lowProjection = Math.min(project(from), project(to)),
      highProjection = Math.max(project(from), project(to));
    const overlapping = group.filter(
      (segment) =>
        Math.min(project(segment.from), project(segment.to)) <= highProjection + EPSILON &&
        Math.max(project(segment.from), project(segment.to)) >= lowProjection - EPSILON,
    );
    if (overlapping.length) {
      const existing = overlapping[0];
      const points = [from, to, ...overlapping.flatMap((segment) => [segment.from, segment.to])];
      points.sort((a, b) => (a.x - b.x) * ux + (a.y - b.y) * uy);
      existing.from = points[0];
      existing.to = points[points.length - 1];
      existing.travelled = Math.min(
        REGIONAL_ROUTE_WEAR_LIMIT,
        overlapping.reduce((sum, segment) => sum + segment.travelled, walked),
      );
      for (const extra of overlapping.slice(1)) fragments.splice(fragments.indexOf(extra), 1);
      groups.set(
        base,
        group.filter((segment) => segment === existing || !overlapping.includes(segment)),
      );
      continue;
    }
    let key = base,
      ordinal = 0;
    while (group.some((segment) => segment.key === key)) key = `${base}:${++ordinal}`;
    const segment: RegionalRoadSegment = { key, from, to, travelled: walked };
    if (fragments.length >= REGIONAL_ROUTE_LIMIT) {
      // Keep busy corridors when a very long campaign reaches the visual budget.
      let weakest = 0;
      for (let j = 1; j < fragments.length; j++)
        if (fragments[j].travelled < fragments[weakest].travelled) weakest = j;
      const evicted = fragments[weakest],
        oldBase = baseKey(evicted.key);
      groups.set(
        oldBase,
        (groups.get(oldBase) ?? []).filter((segment) => segment !== evicted),
      );
      fragments[weakest] = segment;
    } else fragments.push(segment);
    groups.set(base, [...(groups.get(base) ?? []), segment]);
  }
}
