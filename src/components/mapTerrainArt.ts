import type { GameState, Sector } from '../game/types';
import { riverSegments } from '../game/worldGeneration';

type World = Pick<GameState, 'mapGeneration' | 'sectors' | 'home'>;
type Point = { x: number; y: number };
type Color = readonly [number, number, number];
const WIDTH = 1200,
  HEIGHT = 800,
  SX = 2.4,
  SY = 1.6;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const blend = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

function randomStream(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function hash(x: number, y: number, seed: number) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    tx = smooth(x - ix),
    ty = smooth(y - iy);
  return blend(
    blend(hash(ix, iy, seed), hash(ix + 1, iy, seed), tx),
    blend(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), tx),
    ty,
  );
}

function defaultSectors(): Sector[] {
  return Array.from({ length: 25 }, (_, i) => {
    const x = i % 5,
      y = Math.floor(i / 5);
    return {
      id: `sector-${x}-${y}`,
      x,
      y,
      explored: x === 2 && y === 2,
      faunaCapacity: 20,
      biome: x === 4 ? 'mountain' : x === 3 ? 'river' : x < 2 ? 'forest' : 'plain',
    };
  });
}

function groundColors(sectors: Sector[], season: number): Color[] {
  const palette: Record<Sector['biome'], Color> =
    season === 3
      ? {
          forest: [156, 168, 151],
          plain: [207, 207, 186],
          mountain: [183, 185, 175],
          river: [169, 184, 165],
        }
      : season === 2
        ? {
            forest: [143, 145, 102],
            plain: [173, 170, 119],
            mountain: [162, 157, 128],
            river: [139, 158, 114],
          }
        : {
            forest: [112, 136, 95],
            plain: [160, 173, 120],
            mountain: [151, 157, 127],
            river: [127, 155, 111],
          };
  const cells: Color[] = Array.from({ length: 25 }, () => palette.plain);
  for (const sector of sectors) cells[sector.y * 5 + sector.x] = palette[sector.biome];
  return cells;
}

/** Painted soil is baked once. Texture frequencies span earth clumps, moss and fine grain. */
function paintGround(
  ctx: CanvasRenderingContext2D,
  seed: number,
  season: number,
  sectors: Sector[],
  home: Point,
) {
  const base = document.createElement('canvas');
  base.width = WIDTH;
  base.height = HEIGHT;
  const painter = base.getContext('2d')!;
  const image = painter.createImageData(WIDTH, HEIGHT),
    data = image.data;
  const cells = groundColors(sectors, season);
  const snow = season === 3;
  const earth: Color = snow ? [220, 215, 197] : [177, 157, 117];
  for (let y = 0; y < HEIGHT; y++) {
    const gy = y / (SY * 100) - 0.5,
      iy = Math.floor(gy),
      fy = smooth(gy - iy);
    const y0 = Math.max(0, Math.min(4, iy)),
      y1 = Math.max(0, Math.min(4, iy + 1));
    for (let x = 0; x < WIDTH; x++) {
      const gx = x / (SX * 100) - 0.5,
        ix = Math.floor(gx),
        fx = smooth(gx - ix);
      const x0 = Math.max(0, Math.min(4, ix)),
        x1 = Math.max(0, Math.min(4, ix + 1));
      const a = cells[y0 * 5 + x0],
        b = cells[y0 * 5 + x1],
        c = cells[y1 * 5 + x0],
        d = cells[y1 * 5 + x1];
      const broad = noise(x / 145, y / 110, seed),
        patches = noise(x / 24, y / 20, seed + 91);
      const clumps = noise(x / 5.8, y / 4.3, seed + 711),
        grain = hash(x, y, seed + 1709);
      const soil = clamp((patches - 0.53) * 1.7) * 0.48;
      const dx = x / SX - home.x,
        dy = y / SY - home.y;
      const trampled = clamp((18 - Math.hypot(dx, dy) + (patches - 0.5) * 7) / 10) * 0.75;
      const warmth = Math.max(soil, trampled);
      const shade = (broad - 0.5) * 19 + (clumps - 0.5) * 12 + (grain - 0.5) * 7;
      const index = (y * WIDTH + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const color = blend(
          blend(a[channel], b[channel], fx),
          blend(c[channel], d[channel], fx),
          fy,
        );
        data[index + channel] =
          blend(color, earth[channel], warmth) + shade + (channel === 0 ? 2 : 0);
      }
      data[index + 3] = 255;
    }
  }
  painter.putImageData(image, 0, 0);
  ctx.drawImage(base, 0, 0);
}

function dab(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
  angle = 0,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
  ctx.fill();
}

/** Fine pigment stays distinct at close zoom, above the deliberately soft soil washes. */
function paintPigment(ctx: CanvasRenderingContext2D, seed: number) {
  const paper = document.createElement('canvas');
  paper.width = paper.height = 256;
  const brush = paper.getContext('2d')!;
  const pigment = brush.createImageData(256, 256);
  const random = randomStream(seed ^ 0x34f1b7a9);
  for (let i = 0; i < pigment.data.length; i += 4) {
    const value = 95 + random() * 100;
    pigment.data[i] = value + 3;
    pigment.data[i + 1] = value + 1;
    pigment.data[i + 2] = value - 3;
    pigment.data[i + 3] = 100;
  }
  brush.putImageData(pigment, 0, 0);
  ctx.save();
  ctx.scale(1 / 3, 1 / 3);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = ctx.createPattern(paper, 'repeat')!;
  ctx.fillRect(0, 0, WIDTH * 3, HEIGHT * 3);
  ctx.restore();
}

function paintSmallGrowth(
  ctx: CanvasRenderingContext2D,
  seed: number,
  season: number,
  home: Point,
) {
  const random = randomStream(seed ^ 0x38e2f6a1),
    winter = season === 3,
    autumn = season === 2;
  // Small paint flecks remain far smaller than any selectable stone, tree or berry bush.
  for (let i = 0; i < 19000; i++) {
    const x = random() * WIDTH,
      y = random() * HEIGHT;
    const nearHome = Math.hypot(x / SX - home.x, y / SY - home.y) < 11;
    const color = winter
      ? ['#f1eddb30', '#727e7033', '#b1b6a52c'][i % 3]
      : autumn
        ? ['#d1ba8050', '#8c785542', '#556e4936'][i % 3]
        : ['#ddd29c45', '#526e4535', '#81935b45'][i % 3];
    if (nearHome && i % 3) continue;
    dab(ctx, x, y, 0.2 + random() * 0.7, 0.08 + random() * 0.27, color, random() * 1.6);
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 11000; i++) {
    const x = random() * WIDTH,
      y = random() * HEIGHT;
    if (Math.hypot(x / SX - home.x, y / SY - home.y) < 10 + random() * 3) continue;
    const patch = noise(x / 31, y / 24, seed + 126);
    if (patch < 0.28 || (winter && random() > 0.3)) continue;
    const height = 0.3 + random() * 1.15,
      lean = (random() - 0.7) * 0.7;
    // A soft basal paint mark and individually tapered blades, never repeated V symbols.
    dab(ctx, x + 0.3, y + 0.12, 0.65 + random() * 0.5, 0.17, '#586b3f19');
    for (let blade = 0; blade < 2 + (i % 2); blade++) {
      const bx = x + (blade - 1) * 0.35;
      ctx.strokeStyle = winter ? '#78887955' : blade === 1 ? '#d1c88578' : '#5f75465d';
      ctx.lineWidth = blade === 1 ? 0.21 : 0.28;
      ctx.beginPath();
      ctx.moveTo(bx, y);
      ctx.quadraticCurveTo(bx + lean * 0.3, y - height * 0.6, bx + lean, y - height);
      ctx.stroke();
    }
    if (autumn && i % 11 === 0) dab(ctx, x + 1, y - 0.5, 0.65, 0.22, '#9b7d4d66', -0.5);
    if (!winter && i % 97 === 0) dab(ctx, x, y - height, 0.28, 0.19, '#e5d5a58c');
  }
  // Soil inclusions are sub-pixel specks, not fake harvestable rock silhouettes.
  for (let i = 0; i < 1900; i++) {
    const x = random() * WIDTH,
      y = random() * HEIGHT,
      size = 0.22 + random() * 0.48;
    dab(ctx, x + 0.18, y + 0.18, size * 1.25, size * 0.5, '#534d3722');
    dab(ctx, x, y, size, size * 0.55, winter ? '#c0c5b8' : '#a6a58c', -0.15);
    dab(ctx, x - size * 0.2, y - size * 0.15, size * 0.45, size * 0.18, '#ded6b275');
  }
}

function legacyRiver(ctx: CanvasRenderingContext2D) {
  ctx.moveTo(1000 / SX, -80 / SY);
  ctx.bezierCurveTo(870 / SX, 100 / SY, 1060 / SX, 140 / SY, 980 / SX, 255 / SY);
  ctx.bezierCurveTo(920 / SX, 340 / SY, 820 / SX, 297 / SY, 850 / SX, 412 / SY);
  ctx.bezierCurveTo(875 / SX, 502 / SY, 750 / SX, 510 / SY, 780 / SX, 598 / SY);
  ctx.bezierCurveTo(810 / SX, 698 / SY, 660 / SX, 726 / SY, 610 / SX, 880 / SY);
}

function paintRiver(ctx: CanvasRenderingContext2D, seed: number, season: number, world?: World) {
  const random = randomStream(seed ^ 0x724e38a5),
    winter = season === 3;
  const segments = world?.mapGeneration?.mode === 'random' ? riverSegments(world.sectors) : [];
  const points = segments.length ? [segments[0][0], ...segments.map((segment) => segment[1])] : [];
  const trace = () => {
    ctx.beginPath();
    if (!points.length) {
      legacyRiver(ctx);
      return;
    }
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const previous = points[i - 1],
        corner = points[i],
        next = points[i + 1];
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
      ctx.lineTo(enter.x, enter.y);
      ctx.quadraticCurveTo(corner.x, corner.y, leave.x, leave.y);
    }
    ctx.lineTo(points.at(-1)!.x, points.at(-1)!.y);
  };
  ctx.save();
  ctx.scale(SX, SY);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const water = ctx.createLinearGradient(0, 0, 500, 500);
  water.addColorStop(0, winter ? '#849f9b' : '#557e77');
  water.addColorStop(0.5, winter ? '#a7bab1' : '#7d9e8b');
  water.addColorStop(1, winter ? '#94b4b2' : '#597f79');
  for (const [color, width] of [
    ['#556e5540', 26],
    ['#7f836352', 23],
    ['#a59d77', 20],
    ['#c0b18b', 16],
    ['#6d806e', 13],
    [water, 11],
    [winter ? '#d2ded064' : '#a3b49a43', 7],
  ] as const) {
    trace();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  ctx.restore();
  if (!segments.length) return;
  ctx.save();
  ctx.scale(SX, SY);
  // Water marks align with the real stream. Rounded corners deviate <1.5m,
  // inside the placement margin, so resources stay visibly above the banks.
  for (const [a, b] of segments) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (!length) continue;
    const dx = (b.x - a.x) / length,
      dy = (b.y - a.y) / length;
    for (let i = 0; i < Math.ceil(length * 1.4); i++) {
      const t = 0.06 + random() * 0.88,
        offset = (random() - 0.5) * 7;
      const x = blend(a.x, b.x, t) - dy * offset,
        y = blend(a.y, b.y, t) + dx * offset;
      ctx.strokeStyle = i % 4 ? '#d4dfc73a' : '#3f6c6640';
      ctx.lineWidth = 0.12 + random() * 0.15;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + dx * 0.8 - dy * 0.2,
        y + dy * 0.8 + dx * 0.2,
        x + dx * (0.8 + random() * 1.5),
        y + dy * (0.8 + random() * 1.5),
      );
      ctx.stroke();
    }
    for (let i = 0; i < Math.ceil(length / 3); i++) {
      const t = 0.07 + random() * 0.86,
        bank = (random() > 0.5 ? 1 : -1) * (8.5 + random() * 2);
      const x = blend(a.x, b.x, t) - dy * bank,
        y = blend(a.y, b.y, t) + dx * bank;
      ctx.strokeStyle = winter ? '#7b8c765c' : '#60745070';
      ctx.lineWidth = 0.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x - 0.15, y - 0.5, x + (random() - 0.5) * 0.5, y - 0.8 - random() * 0.4);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Deterministic, multi-scale surface art; simulation coordinates and resources remain authoritative. */
export function createPainterlyTerrain(
  seed: number,
  seasonIndex: number,
  world?: World,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * 3;
  canvas.height = HEIGHT * 3;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(3, 3);
  const season = seasonIndex % 4;
  const originalSeed = world?.mapGeneration?.seed ?? seed;
  const sectors = world?.sectors ?? defaultSectors();
  const home = world?.home ?? { x: 250, y: 250 };
  paintGround(ctx, originalSeed, season, sectors, home);
  paintPigment(ctx, originalSeed);
  paintSmallGrowth(ctx, originalSeed, season, home);
  paintRiver(ctx, originalSeed, season, world);
  return canvas;
}
