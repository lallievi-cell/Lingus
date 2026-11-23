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

type Painter = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Viewport = { minX: number; minY: number; maxX: number; maxY: number };
type CoastView = CoastWorld & Pick<GameState, 'disasters' | 'paused' | 'time' | 'tier'>;
const horizontal = (coast: CoastGeometry) => coast.side === 'north' || coast.side === 'south';
const seaward = (coast: CoastGeometry) =>
  coast.side === 'north' || coast.side === 'west' ? -1 : 1;

function traceShore(ctx: Painter, coast: CoastGeometry) {
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

function traceIsland(ctx: Painter, points: readonly CoastPoint[], begin = true) {
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

function traceAllShores(ctx: Painter, coast: CoastGeometry) {
  traceShore(ctx, coast);
  for (const island of coast.islands ?? []) traceIsland(ctx, island.points, false);
}

/** The edge is the navigation polyline; no smoothed curve can hide a dry bay. */
function traceSea(ctx: Painter, coast: CoastGeometry) {
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

/** Salt and current marks are stamped into the same terrain cache as the shore. */
function paintShoreGrain(ctx: Painter, coast: CoastGeometry, winter: boolean, sea: boolean) {
  const shadows: [number, number, number, number][] = [];
  const light: [number, number, number, number][] = [];
  for (const [index, { a, b, inward }] of coastEdges(coast).entries()) {
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) continue;
    const tx = dx / length,
      ty = dy / length;
    const nx = ty * inward,
      ny = -tx * inward;
    const count = Math.ceil(length / (sea ? 5 : 3.7));
    for (let mark = 0; mark < count; mark++) {
      // Each mark uses the real tangent and a different tide or sediment height.
      const phase = ((index * 67 + mark * 133) % 101) / 101;
      const foam = sea && phase < 0.27;
      const depth = sea ? (foam ? 0.7 + phase * 9 : 2 + phase * 34) : -(1.6 + phase * 12);
      const along = (mark + 0.27 + phase * 0.43) * (length / count);
      const x = a.x + tx * along + nx * depth;
      const y = a.y + ty * along + ny * depth;
      const span = foam ? 1.2 + phase * 5.5 : sea ? 0.5 + phase * 2.4 : 0.22 + phase * 0.76;
      const stroke: (typeof shadows)[number] = [x, y, tx * span, ty * span];
      if (!foam && mark % 3 === 0) shadows.push(stroke);
      else light.push(stroke);
    }
  }
  const draw = (marks: typeof light, width: number, pigment: string) => {
    ctx.beginPath();
    for (const [x, y, dx, dy] of marks) {
      ctx.moveTo(x - dx * 0.65, y - dy * 0.65);
      ctx.lineTo(x + dx, y + dy);
    }
    ctx.lineWidth = width;
    ctx.strokeStyle = pigment;
    ctx.stroke();
  };
  draw(shadows, sea ? 0.52 : 0.59, sea ? '#234f5886' : '#655e426e');
  draw(light, sea ? 0.38 : 0.32, sea ? (winter ? '#e3eeeb90' : '#e0efcf96') : '#f5e6bc9e');
}

/** Cached before the river, so sand cannot make a false dam at its mouth. */
export function paintCoastSand(ctx: Painter, world: CoastWorld, winter: boolean) {
  const coast = createCoastGeometry(world);
  if (!coast) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [width, color] of [
    [39, winter ? '#b6bbac32' : '#99916a39'],
    [32, winter ? '#c2cbc03d' : '#ab9e6552'],
    [25, winter ? '#cdd2c774' : '#c2aa797a'],
    [20, winter ? '#dae0d2a2' : '#d0b985ac'],
    [11, winter ? '#cbd5c3a0' : '#bca56d76'],
    [6, winter ? '#a3b2a9a7' : '#9180626d'],
  ] as const) {
    traceShore(ctx, coast);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  for (const island of coast.islands ?? []) {
    const center = islandCenter(island.points);
    traceIsland(ctx, island.points);
    ctx.fillStyle = winter ? '#c3cec1' : '#aaa575';
    ctx.fill();
    for (const [width, color] of [
      [12, winter ? '#dde0d1' : '#c8b583'],
      [4.4, winter ? '#a5b4ac' : '#a4986d'],
    ] as const) {
      traceIsland(ctx, island.points);
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    traceIsland(
      ctx,
      island.points.map((point) => ({
        x: center.x + (point.x - center.x) * 0.62,
        y: center.y + (point.y - center.y) * 0.62,
      })),
    );
    ctx.fillStyle = winter ? '#a9c2ac55' : '#7c946e66';
    ctx.fill();
  }
  paintShoreGrain(ctx, coast, winter, false);
  ctx.restore();
}

/** Small pigment strokes are anchored in global metres across regional seams. */
function paintOpenWater(ctx: Painter, coast: CoastGeometry, winter: boolean) {
  const size = coast.worldSize;
  const worldX = (coast.world?.regionX ?? 0) * size;
  const worldY = (coast.world?.regionY ?? 0) * size;
  const spacing = 10;
  for (const [kind, pigment] of [
    [0, winter ? '#203b5a46' : '#15394740'],
    [1, winter ? '#e3eef154' : '#c1e6d154'],
  ] as const) {
    ctx.beginPath();
    // Take a small margin so a ripple crossing a seam is visible on both sides.
    for (let gy = Math.floor((worldY - 8) / spacing); gy * spacing < worldY + size + 8; gy++) {
      for (let gx = Math.floor((worldX - 8) / spacing); gx * spacing < worldX + size + 8; gx++) {
        const salt = Math.imul(gx, 0x85ebca77) ^ Math.imul(gy, 0x9e3779b1);
        const grain = Math.imul(salt ^ (salt >>> 16), 0xc2b2ae3d) >>> 0;
        if ((grain & 7) >= 6 || ((grain >>> 6) & 1) !== kind) continue;
        const phase = ((grain >>> 8) & 255) / 255;
        const x = gx * spacing - worldX + ((grain >>> 16) & 7);
        const y = gy * spacing - worldY + ((grain >>> 26) & 7);
        const span = 0.56 + phase ** 2 * 4.2;
        const slope = ((((grain >>> 22) & 7) - 3) * span) / 11;
        ctx.moveTo(x - span, y + 0.3 + slope);
        ctx.lineTo(x - span * 0.28, y - phase * 0.43);
        ctx.lineTo(x + span, y - slope);
      }
    }
    ctx.lineWidth = 0.24;
    ctx.strokeStyle = pigment;
    ctx.stroke();
  }
}

/** Paint after the river: the same physical sea clips the river into an estuary.
 * This runs only when the existing bounded terrain cache is regenerated. */
export function paintCoastWater(ctx: Painter, world: CoastWorld, winter: boolean) {
  const coast = createCoastGeometry(world);
  if (!coast) return;
  ctx.save();
  traceSea(ctx, coast);
  if (coast.world || coast.islands?.length) ctx.clip('evenodd');
  else ctx.clip();
  const size = coast.worldSize;
  const outside = seaward(coast) < 0 ? 0 : size;
  const inside = outside + (seaward(coast) < 0 ? 160 : -160);
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
  gradient.addColorStop(0, winter ? '#254b65' : '#194557');
  gradient.addColorStop(0.52, winter ? '#40687a' : '#316e77');
  gradient.addColorStop(1, winter ? '#779398' : '#518f86');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Layered, low-opacity washes soften the depth transition while the exact
  // shoreline clip still defines the physical sea, including bays and islands.
  traceAllShores(ctx, coast);
  for (let step = 0; step < 33; step++) {
    const depth = (step / 32) ** 1.7;
    const red = (winter ? 113 : 63) + depth * (winter ? 99 : 146);
    const green = (winter ? 164 : 149) + depth * (winter ? 51 : 57);
    const blue = (winter ? 181 : 146) + depth * (winter ? 28 : 14);
    const alpha = 0.024 + depth * 0.095;
    ctx.lineWidth = 112 - step * 3.4;
    ctx.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    ctx.stroke();
  }
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = winter ? '#ebf0df92' : '#e7e5c479';
  ctx.stroke();
  paintOpenWater(ctx, coast, winter);
  paintShoreGrain(ctx, coast, winter, true);
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
