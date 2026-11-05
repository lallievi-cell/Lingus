import type { GameState } from '../game/types';
import { riverSegments } from '../game/worldGeneration';

type Point = { x: number; y: number };
type World = Pick<GameState, 'mapGeneration' | 'sectors'>;
export interface RiverArtGeometry {
  points: readonly (Point & { distance: number })[];
  length: number;
}

/** One modest polyline is shared by painted banks and moving surface highlights. */
export function createRiverArtGeometry(world?: World): RiverArtGeometry {
  const points: (Point & { distance: number })[] = [];
  const add = (point: Point) => {
    const previous = points.at(-1);
    const step = previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : 0;
    if (previous && step < 0.0001) return;
    points.push({ ...point, distance: (previous?.distance ?? 0) + step });
  };
  const line = (to: Point) => {
    const from = points.at(-1)!;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 2));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      add({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    }
  };
  const segments = world?.mapGeneration?.mode === 'random' ? riverSegments(world.sectors) : [];
  if (segments.length) {
    const corners = [segments[0][0], ...segments.map((segment) => segment[1])];
    add(corners[0]);
    for (let i = 1; i < corners.length - 1; i++) {
      const previous = corners[i - 1],
        corner = corners[i],
        next = corners[i + 1];
      const d1 = Math.hypot(corner.x - previous.x, corner.y - previous.y);
      const d2 = Math.hypot(next.x - corner.x, next.y - corner.y);
      if (!d1 || !d2) continue;
      const radius = Math.min(5, d1 / 4, d2 / 4);
      const enter = {
        x: corner.x + ((previous.x - corner.x) / d1) * radius,
        y: corner.y + ((previous.y - corner.y) / d1) * radius,
      };
      const leave = {
        x: corner.x + ((next.x - corner.x) / d2) * radius,
        y: corner.y + ((next.y - corner.y) / d2) * radius,
      };
      line(enter);
      for (let step = 1; step <= 8; step++) {
        const t = step / 8,
          u = 1 - t;
        add({
          x: u * u * enter.x + 2 * u * t * corner.x + t * t * leave.x,
          y: u * u * enter.y + 2 * u * t * corner.y + t * t * leave.y,
        });
      }
    }
    line(corners.at(-1)!);
  } else {
    // Seed Zero's original painted river, in simulation coordinates.
    const legacy = (x: number, y: number): Point => ({ x: x / 2.4, y: y / 1.6 });
    add(legacy(1000, -80));
    const curves = [
      [legacy(870, 100), legacy(1060, 140), legacy(980, 255)],
      [legacy(920, 340), legacy(820, 297), legacy(850, 412)],
      [legacy(875, 502), legacy(750, 510), legacy(780, 598)],
      [legacy(810, 698), legacy(660, 726), legacy(610, 880)],
    ];
    for (const [a, b, end] of curves) {
      const start = points.at(-1)!;
      for (let step = 1; step <= 96; step++) {
        const t = step / 96,
          u = 1 - t;
        add({
          x: u ** 3 * start.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t ** 3 * end.x,
          y: u ** 3 * start.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t ** 3 * end.y,
        });
      }
    }
  }
  return { points, length: points.at(-1)!.distance };
}

export function sampleRiverArt(geometry: RiverArtGeometry, distance: number) {
  const points = geometry.points;
  const position = Math.max(0, Math.min(geometry.length, distance));
  let low = 1,
    high = points.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (points[middle].distance < position) low = middle + 1;
    else high = middle;
  }
  const a = points[low - 1],
    b = points[low];
  const span = b.distance - a.distance;
  const t = (position - a.distance) / span;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    dx: (b.x - a.x) / span,
    dy: (b.y - a.y) / span,
  };
}

export function traceRiverArt(ctx: CanvasRenderingContext2D, geometry: RiverArtGeometry) {
  ctx.beginPath();
  geometry.points.forEach((point, index) => {
    if (!index) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
}
