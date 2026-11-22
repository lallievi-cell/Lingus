import type { Boat, GameState } from '../game/types';
import { isWorldPoint, isWorldPointRevealed, WORLD_SECTOR_SIZE } from '../game/worldDimensions';

type Point = { x: number; y: number };
type Chart = Pick<GameState, 'mapGeneration' | 'sectors' | 'tier'>;

function sectorCrossings(from: number, to: number) {
  const low = Math.min(from, to),
    high = Math.max(from, to);
  const crossings: number[] = [];
  for (
    let edge = Math.floor(low / WORLD_SECTOR_SIZE + 1) * WORLD_SECTOR_SIZE;
    edge < high;
    edge += WORLD_SECTOR_SIZE
  )
    crossings.push((edge - from) / (to - from));
  return crossings;
}

/** Follow the stored route up to the first unexplored sector. Revealed sectors
 * beyond that gap do not expose the direction or destination of the plan. */
export function observedVoyage(state: Chart, boat: Boat) {
  if (
    boat.ownerId !== 'player' ||
    boat.hp <= 0 ||
    boat.status !== 'sailing' ||
    !boat.route?.length ||
    !isWorldPointRevealed(state, boat.x, boat.y)
  )
    return null;

  let from = { x: boat.x, y: boat.y };
  const points: Point[] = [from];
  for (let i = boat.routeIndex ?? 0; i < boat.route.length; i++) {
    const to = boat.route[i];
    if (!isWorldPoint(state, to)) return { points, destination: undefined };
    if (from.x === to.x && from.y === to.y) continue;
    const at = (t: number) => ({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    });
    const stops = [0, ...sectorCrossings(from.x, to.x), ...sectorCrossings(from.y, to.y), 1].sort(
      (a, b) => a - b,
    );
    for (let j = 1; j < stops.length; j++) {
      const before = stops[j - 1],
        after = stops[j];
      if (after - before < 1e-9) continue;
      const middle = at((before + after) / 2);
      if (!isWorldPointRevealed(state, middle.x, middle.y)) {
        if (before > 0) points.push(at(before));
        return { points, destination: undefined };
      }
    }
    points.push(to);
    from = to;
  }
  return {
    points,
    destination:
      boat.destination && isWorldPointRevealed(state, boat.destination.x, boat.destination.y)
        ? boat.destination
        : undefined,
  };
}

/** A stationary chart mark for the selected vessel, independent of animation time. */
export function drawObservedVoyage(
  ctx: CanvasRenderingContext2D,
  state: Chart,
  boat: Boat,
  pixelRatio = 1,
) {
  const voyage = observedVoyage(state, boat);
  if (!voyage || voyage.points.length < 2) return;
  const transform = ctx.getTransform();
  const screen = 1 / Math.max(0.1, Math.hypot(transform.a, transform.b) / pixelRatio);
  ctx.save();
  ctx.beginPath();
  const [start, ...waypoints] = voyage.points;
  ctx.moveTo(start.x * 2.4, start.y * 1.6);
  for (const point of waypoints) ctx.lineTo(point.x * 2.4, point.y * 1.6);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.setLineDash([5 * screen, 6 * screen]);
  ctx.strokeStyle = '#234047da';
  ctx.lineWidth = 3.5 * screen;
  ctx.stroke();
  ctx.strokeStyle = '#f7e8ba';
  ctx.lineWidth = 1.5 * screen;
  ctx.stroke();
  if (voyage.destination) {
    const x = voyage.destination.x * 2.4,
      y = voyage.destination.y * 1.6,
      radius = 4 * screen;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x + radius, y);
    ctx.lineTo(x, y + radius);
    ctx.lineTo(x - radius, y);
    ctx.closePath();
    ctx.fillStyle = '#234047';
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
