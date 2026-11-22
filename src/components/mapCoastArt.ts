import {
  createCoastGeometry,
  coastEdges,
  coastInlandDistance,
  type CoastGeometry,
  type CoastPoint,
  type CoastWorld,
} from '../game/coastGeometry';
import type { GameState } from '../game/types';
import { WORLD_REGIONS } from '../game/worldGeography';
import { isWorldPointRevealed } from '../game/worldDimensions';

type Viewport = { minX: number; minY: number; maxX: number; maxY: number };
type CoastView = CoastWorld & Pick<GameState, 'disasters' | 'paused' | 'time' | 'tier'>;
const horizontal = (coast: CoastGeometry) => coast.side === 'north' || coast.side === 'south';
const seaward = (coast: CoastGeometry) =>
  coast.side === 'north' || coast.side === 'west' ? -1 : 1;

function traceShore(ctx: CanvasRenderingContext2D, coast: CoastGeometry) {
  ctx.beginPath();
  if (coast.world) {
    for (const edge of coastEdges(coast)) {
      ctx.moveTo(edge.a.x, edge.a.y);
      ctx.lineTo(edge.b.x, edge.b.y);
    }
    return;
  }
  coast.points.forEach((point, index) =>
    index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y),
  );
}

function traceIsland(ctx: CanvasRenderingContext2D, points: readonly CoastPoint[], begin = true) {
  if (begin) ctx.beginPath();
  points.forEach((point, index) =>
    index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y),
  );
  ctx.closePath();
}

const islandCenter = (points: readonly CoastPoint[]) => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
});

function traceAllShores(ctx: CanvasRenderingContext2D, coast: CoastGeometry) {
  traceShore(ctx, coast);
  for (const island of coast.islands ?? []) traceIsland(ctx, island.points, false);
}

/** The edge is the navigation polyline; no smoothed curve can hide a dry bay. */
function traceSea(ctx: CanvasRenderingContext2D, coast: CoastGeometry) {
  if (coast.world) {
    // Sea is the complement of the actual land polygons. Inner rings are
    // physical inland seas, and a region border never becomes a beach.
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(coast.worldSize, 0);
    ctx.lineTo(coast.worldSize, coast.worldSize);
    ctx.lineTo(0, coast.worldSize);
    ctx.closePath();
    for (const landmass of coast.world.landmasses) {
      traceIsland(ctx, landmass.points, false);
      for (const hole of landmass.holes) traceIsland(ctx, hole, false);
    }
    return;
  }
  traceShore(ctx, coast);
  const edge = seaward(coast) < 0 ? 0 : coast.worldSize;
  if (horizontal(coast)) {
    ctx.lineTo(coast.worldSize, edge);
    ctx.lineTo(0, edge);
  } else {
    ctx.lineTo(edge, coast.worldSize);
    ctx.lineTo(edge, 0);
  }
  ctx.closePath();
  for (const island of coast.islands ?? []) traceIsland(ctx, island.points, false);
}

/** Cached before the river, so sand cannot make a false dam at its mouth. */
export function paintCoastSand(ctx: CanvasRenderingContext2D, world: CoastWorld, winter: boolean) {
  const coast = createCoastGeometry(world);
  if (!coast) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [width, color] of [
    [30, winter ? '#d0d4bf55' : '#b9b38355'],
    [19, winter ? '#e4e3cf' : '#d7c694'],
    [8, winter ? '#e8e6d2' : '#e4d5aa'],
  ] as const) {
    traceShore(ctx, coast);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  for (const island of coast.islands ?? []) {
    const center = islandCenter(island.points);
    traceIsland(ctx, island.points);
    ctx.fillStyle = winter ? '#d2d7bd' : '#b7b782';
    ctx.fill();
    for (const [width, color] of [
      [10, winter ? '#e1dfc4' : '#d7c694'],
      [3.2, '#e5d6ae'],
    ] as const) {
      traceIsland(ctx, island.points);
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    traceIsland(
      ctx,
      island.points.map((point) => ({
        x: center.x + (point.x - center.x) * 0.58,
        y: center.y + (point.y - center.y) * 0.58,
      })),
    );
    ctx.fillStyle = winter ? '#bbc9ad55' : '#8da06e66';
    ctx.fill();
  }
  ctx.restore();
}

/** Paint after the river: the same physical sea clips the river into an estuary.
 * This runs only when the existing bounded terrain cache is regenerated. */
export function paintCoastWater(ctx: CanvasRenderingContext2D, world: CoastWorld, winter: boolean) {
  const coast = createCoastGeometry(world);
  if (!coast) return;
  ctx.save();
  traceSea(ctx, coast);
  if (coast.world || coast.islands?.length) ctx.clip('evenodd');
  else ctx.clip();
  const size = coast.worldSize;
  const outside = seaward(coast) < 0 ? 0 : size;
  const inside = outside + (seaward(coast) < 0 ? 155 : -155);
  const gradient = coast.world
    ? ctx.createLinearGradient(
        0 - coast.world.regionX * size,
        0 - coast.world.regionY * size,
        (WORLD_REGIONS - coast.world.regionX) * size,
        (WORLD_REGIONS - coast.world.regionY) * size,
      )
    : horizontal(coast)
      ? ctx.createLinearGradient(0, outside, 0, inside)
      : ctx.createLinearGradient(outside, 0, inside, 0);
  gradient.addColorStop(0, winter ? '#547e86' : '#376879');
  gradient.addColorStop(0.65, winter ? '#719c9a' : '#52888c');
  gradient.addColorStop(1, winter ? '#a0b9a9' : '#8aaa9a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [width, color] of [
    [39, '#94b9a635'],
    [22, winter ? '#b8ccbc66' : '#bad1af60'],
    [5, '#e5e8ce70'],
    [1.2, '#edf0d7a8'],
  ] as const) {
    traceAllShores(ctx, coast);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  if (coast.world) {
    // A bounded number of pigment strokes follows the same polygon normals.
    // The terrain cache owns these strokes; animation allocates no surface.
    for (const [index, edge] of coastEdges(coast).entries()) {
      const dx = edge.b.x - edge.a.x,
        dy = edge.b.y - edge.a.y;
      const length = Math.hypot(dx, dy);
      if (!length) continue;
      const count = Math.ceil(length / 18);
      for (let mark = 0; mark < count; mark++) {
        const fraction = (mark + 0.35) / count;
        const across = 15 + ((index * 17 + mark * 13) % 52);
        const x = edge.a.x + dx * fraction + (dy * edge.inward * across) / length,
          y = edge.a.y + dy * fraction - (dx * edge.inward * across) / length;
        ctx.beginPath();
        ctx.moveTo(x - 2.7, y);
        ctx.lineTo(x + 2.7, y - 0.3);
        ctx.lineWidth = 0.23;
        ctx.strokeStyle = mark % 2 ? '#c5d7bf28' : '#2f697026';
        ctx.stroke();
      }
    }
  }
  // Broken translucent strokes give water depth without a second large texture.
  for (let index = 1; index < coast.points.length; index++) {
    const a = coast.points[index - 1],
      b = coast.points[index];
    for (let mark = 0; mark < 4; mark++) {
      const fraction = (mark + 0.35) / 4;
      const across = (15 + ((index * 17 + mark * 13) % 52)) * seaward(coast);
      const x = a.x + (b.x - a.x) * fraction + (horizontal(coast) ? 0 : across),
        y = a.y + (b.y - a.y) * fraction + (horizontal(coast) ? across : 0);
      ctx.beginPath();
      ctx.moveTo(x - 2.7, y);
      ctx.lineTo(x + 2.7, y - 0.3);
      ctx.lineWidth = 0.23;
      ctx.strokeStyle = mark % 2 ? '#c5d7bf28' : '#2f697026';
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** A few small wavelets use simulation time, explored water and the live camera. */
export function getCoastHighlights(
  world: CoastView,
  time: number,
  viewport?: Viewport,
  reducedMotion = false,
) {
  const coast = createCoastGeometry(world);
  if (!coast || reducedMotion || world.disasters.blizzard) return [];
  const clock = world.paused ? world.time : time;
  const marks: { a: CoastPoint; b: CoastPoint; opacity: number }[] = [];
  const visible = (point: CoastPoint) =>
    (!coast.world ||
      (point.x >= 0 && point.y >= 0 && point.x <= coast.worldSize && point.y <= coast.worldSize)) &&
    (!viewport ||
      (point.x >= viewport.minX &&
        point.x <= viewport.maxX &&
        point.y >= viewport.minY &&
        point.y <= viewport.maxY)) &&
    isWorldPointRevealed(world, point.x, point.y) &&
    coastInlandDistance(coast, point) <= 0.25;
  if (coast.world) {
    for (const [index, edge] of coastEdges(coast).entries()) {
      const dx = edge.b.x - edge.a.x,
        dy = edge.b.y - edge.a.y;
      const length = Math.hypot(dx, dy);
      if (!length) continue;
      const count = Math.ceil(length / 65);
      for (let mark = 0; mark < count; mark++) {
        const wave = (clock * 0.085 + index * 0.317 + mark * 0.173) % 1;
        const offset = 2 + (1 - wave) * 9;
        const fraction = (mark + 0.5) / count;
        const point = {
          x: edge.a.x + dx * fraction + (dy * edge.inward * offset) / length,
          y: edge.a.y + dy * fraction - (dx * edge.inward * offset) / length,
        };
        const a = { x: point.x - (dx / length) * 3.1, y: point.y - (dy / length) * 3.1 };
        const b = { x: point.x + (dx / length) * 3.1, y: point.y + (dy / length) * 3.1 };
        if (visible(a) && visible(b))
          marks.push({ a, b, opacity: Math.sin(wave * Math.PI) * 0.34 });
      }
    }
    return marks;
  }
  for (let index = 1; index < coast.points.length; index++) {
    if (coast.islands?.length && index % 5 === 0) continue;
    const start = coast.points[index - 1],
      end = coast.points[index];
    const wave = (clock * 0.085 + index * 0.317) % 1;
    const offset = (2 + (1 - wave) * 9) * seaward(coast);
    const fraction = 0.3 + Math.sin(index * 2.41) * 0.18;
    const point = {
      x: start.x + (end.x - start.x) * fraction + (horizontal(coast) ? 0 : offset),
      y: start.y + (end.y - start.y) * fraction + (horizontal(coast) ? offset : 0),
    };
    const dx = horizontal(coast) ? 3.1 : ((end.x - start.x) / 50) * 3.1,
      dy = horizontal(coast) ? ((end.y - start.y) / 50) * 3.1 : 3.1;
    const a = { x: point.x - dx, y: point.y - dy },
      b = { x: point.x + dx, y: point.y + dy };
    if (visible(a) && visible(b)) marks.push({ a, b, opacity: Math.sin(wave * Math.PI) * 0.34 });
  }
  for (const [islandIndex, island] of (coast.islands ?? []).entries()) {
    const center = islandCenter(island.points);
    for (let mark = 0; mark < 2; mark++) {
      const index =
        (mark * Math.floor(island.points.length / 2) + islandIndex * 3) % island.points.length;
      const start = island.points[index],
        end = island.points[(index + 1) % island.points.length];
      const dx = end.x - start.x,
        dy = end.y - start.y;
      const length = Math.hypot(dx, dy);
      if (!length) continue;
      const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      let nx = -dy / length,
        ny = dx / length;
      if ((middle.x - center.x) * nx + (middle.y - center.y) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      const wave = (clock * 0.085 + islandIndex * 0.27 + mark * 0.41) % 1;
      const offset = 2 + (1 - wave) * 4;
      const point = { x: middle.x + nx * offset, y: middle.y + ny * offset };
      const a = { x: point.x - (dx / length) * 2.8, y: point.y - (dy / length) * 2.8 };
      const b = { x: point.x + (dx / length) * 2.8, y: point.y + (dy / length) * 2.8 };
      if (visible(a) && visible(b)) marks.push({ a, b, opacity: Math.sin(wave * Math.PI) * 0.34 });
    }
  }
  return marks;
}

/** Shared silhouettes keep raw silver fish and browned cooked fish distinct. */
export function drawFishSprite(ctx: CanvasRenderingContext2D, cooked: boolean) {
  ctx.fillStyle = cooked ? '#9b6a43' : '#648c8d';
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.lineTo(-21, -7);
  ctx.lineTo(-20, 7);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 6.4, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = cooked ? '#dbb16d' : '#c8d6bf';
  ctx.beginPath();
  ctx.ellipse(1.5, -1.2, 10.4, 3.1, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = cooked ? '#755036' : '#3c747b';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(7, -4.2);
  ctx.quadraticCurveTo(3.5, 0, 7, 4.2);
  ctx.stroke();
  if (cooked) {
    ctx.beginPath();
    for (let index = 0; index < 3; index++) {
      ctx.moveTo(-8 + index * 4.4, -3.5);
      ctx.lineTo(-5 + index * 4.4, 3.5);
    }
    ctx.stroke();
  }
  ctx.fillStyle = cooked ? '#463e30' : '#263e3d';
  ctx.beginPath();
  ctx.ellipse(10, -1.6, 1.1, 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** A ground-anchored shore marker, not a swimming animal or edible pile. */
export function drawFisheryMarker(ctx: CanvasRenderingContext2D, recognized: boolean) {
  ctx.fillStyle = '#796f4c38';
  ctx.beginPath();
  ctx.ellipse(1, 3, 29, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d5c697';
  ctx.strokeStyle = '#9b956f';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, 24, 10, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (recognized) {
    ctx.save();
    ctx.translate(2, -1);
    ctx.scale(0.8, 0.8);
    drawFishSprite(ctx, false);
    ctx.restore();
  } else {
    ctx.strokeStyle = '#76948a';
    for (let index = 0; index < 3; index++) {
      ctx.beginPath();
      ctx.ellipse(0, index * 3 - 3, 12 - index * 2, 2, 0, 0, Math.PI);
      ctx.stroke();
    }
  }
}
