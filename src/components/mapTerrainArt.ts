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
          forest: [151, 168, 155],
          plain: [216, 221, 209],
          mountain: [191, 201, 193],
          river: [175, 195, 183],
        }
      : season === 2
        ? {
            forest: [111, 119, 77],
            plain: [165, 145, 98],
            mountain: [158, 148, 125],
            river: [128, 143, 105],
          }
        : season === 1
          ? {
              forest: [100, 121, 77],
              plain: [172, 165, 108],
              mountain: [163, 157, 126],
              river: [119, 145, 108],
            }
          : {
              forest: [87, 116, 86],
              plain: [143, 161, 113],
              mountain: [155, 154, 129],
              river: [109, 141, 119],
            };
  const cells: Color[] = Array.from({ length: 25 }, () => palette.plain);
  for (const sector of sectors) cells[sector.y * 5 + sector.x] = palette[sector.biome];
  return cells;
}

/** Large colour masses establish the landscape before any small brushwork is added. */
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
  const earth: Color = snow ? [194, 190, 170] : [181, 152, 104];
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
      const broad = noise(x / 104, y / 83, seed),
        patches = noise(x / 36, y / 25, seed + 91);
      const clumps = noise(x / 7.8, y / 5.3, seed + 711),
        grain = hash(x, y, seed + 1709);
      const soil = clamp((patches - 0.54) * 2.6) * (snow ? 0.1 : 0.47);
      const dx = x / SX - home.x,
        dy = y / SY - home.y;
      const homeDistance = Math.hypot(dx * 0.94, dy * 1.03);
      let trampled = 0;
      if (homeDistance < 27) {
        const angle = Math.atan2(dy, dx);
        const edge =
          18.5 +
          Math.sin(angle * 3 + (seed % 17)) * 2.3 +
          Math.cos(angle * 5 + 1.8) * 1.1 +
          (patches - 0.5) * 4;
        trampled = clamp((edge - homeDistance) / 6.8) * 0.92;
      }
      const warmth = Math.max(soil, trampled);
      const shade = (broad - 0.5) * 32 + (clumps - 0.5) * 6 + (grain - 0.5) * 2.5;
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
    pigment.data[i + 3] = 22;
  }
  brush.putImageData(pigment, 0, 0);
  ctx.save();
  ctx.scale(1 / 3, 1 / 3);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = ctx.createPattern(paper, 'repeat')!;
  ctx.fillRect(0, 0, WIDTH * 3, HEIGHT * 3);
  ctx.restore();
}

function brushIsland(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  depth: number,
  color: string,
  phase: number,
) {
  const random = randomStream(Math.round(phase * 989381) ^ 0x71fe2a);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((random() - 0.5) * 0.6);
  ctx.fillStyle = color;
  // Broken, overlapping strokes stain the ground. A closed oval with an offset
  // light rim reads as a raised object, so the patch has no overall outline.
  for (let stroke = 0; stroke < 9; stroke++) {
    const px = (random() - 0.5) * width * 1.2,
      py = (random() - 0.5) * depth * 1.5,
      span = width * (0.12 + random() * 0.45),
      thickness = 0.3 + depth * (0.04 + random() * 0.12);
    ctx.beginPath();
    ctx.moveTo(px - span, py);
    ctx.lineTo(px - span * 0.55, py - thickness * 0.65);
    ctx.lineTo(px - span * 0.2, py - thickness * 0.35);
    ctx.lineTo(px + span * 0.7, py - thickness * 0.5);
    ctx.quadraticCurveTo(px + span, py, px + span * 0.6, py + thickness * 0.3);
    ctx.lineTo(px - span * 0.4, py + thickness * 0.65);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Overlapping brush masses read as meadows, leaf litter and exposed strata at play zoom. */
function paintLandscapeMasses(
  ctx: CanvasRenderingContext2D,
  seed: number,
  season: number,
  sectors: Sector[],
  home: Point,
) {
  const random = randomStream(seed ^ 0x4b13da75);
  const winter = season === 3,
    autumn = season === 2,
    summer = season === 1;
  for (const sector of sectors) {
    const forest = sector.biome === 'forest',
      mountain = sector.biome === 'mountain';
    const count = mountain ? 25 : forest ? 48 : 38;
    for (let i = 0; i < count; i++) {
      const wx = sector.x * 100 + random() * 100,
        wy = sector.y * 100 + random() * 100;
      const radius = 3 + random() * (forest ? 6 : 8);
      if (Math.hypot(wx - home.x, wy - home.y) < 18 + radius * 0.4) continue;
      const x = wx * SX,
        y = wy * SY,
        phase = random() * 7;
      const width = radius * SX,
        depth = radius * SY * (0.43 + random() * 0.32);
      const shade = winter
        ? '#6d8d830d'
        : mountain
          ? '#776f5d14'
          : forest
            ? '#253f3319'
            : autumn
              ? '#795d3514'
              : summer
                ? '#6d743914'
                : '#375b3c16';
      const light = winter
        ? '#f8f8e72a'
        : mountain
          ? '#c7c0a826'
          : autumn
            ? '#d9b57122'
            : summer
              ? '#e7d18a28'
              : '#b6c68125';
      brushIsland(ctx, x, y, width, depth, i % 3 === 0 ? shade : light, phase);
      // Broken edges keep the meadow as a group of brush strokes, never a neat oval stamp.
      for (let edge = 0; edge < 5; edge++) {
        const angle = random() * Math.PI * 2;
        const ex = x + Math.cos(angle) * width * (0.6 + random() * 0.35),
          ey = y + Math.sin(angle) * depth * 0.85;
        dab(ctx, ex, ey, 0.8 + random() * 2.4, 0.3 + random() * 0.6, light, -0.2);
      }
      if (mountain) {
        // Flat seams belong to the ground; collectible rock has a raised, shaded silhouette.
        ctx.strokeStyle = winter ? '#8b9b9255' : '#776e5842';
        ctx.lineWidth = 0.23;
        ctx.beginPath();
        ctx.moveTo(x - width * 0.55, y + depth * 0.12);
        ctx.lineTo(x - width * 0.1, y - depth * 0.2);
        ctx.lineTo(x + width * 0.55, y - depth * 0.16);
        ctx.stroke();
      } else if (forest || autumn) {
        for (let leaf = 0; leaf < 8; leaf++) {
          const lx = x + (random() - 0.5) * width * 1.4,
            ly = y + (random() - 0.5) * depth * 1.2;
          dab(
            ctx,
            lx,
            ly,
            0.55 + random() * 0.6,
            0.16 + random() * 0.15,
            winter ? '#c3cbb347' : autumn ? '#c39a5b65' : '#9f9f6350',
            random() * 2 - 1,
          );
        }
      }
    }
  }
}

/** Wear marks compose the camp without inventing buildings, goods or a gameplay road. */
function paintCampWear(ctx: CanvasRenderingContext2D, seed: number, season: number, home: Point) {
  const random = randomStream(seed ^ 0x574ea3d1),
    winter = season === 3;
  ctx.save();
  ctx.scale(SX, SY);
  ctx.lineCap = 'round';
  for (let trail = 0; trail < 3; trail++) {
    const angle = trail * 2.09 + 0.45 + (seed % 13) * 0.14;
    const start = 4.5 + random() * 2,
      end = 17 + random() * 4;
    const bend = (random() - 0.5) * 3.5;
    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(home.x + Math.cos(angle) * start, home.y + Math.sin(angle) * start);
      ctx.quadraticCurveTo(
        home.x + Math.cos(angle) * (end * 0.56) - Math.sin(angle) * bend,
        home.y + Math.sin(angle) * (end * 0.56) + Math.cos(angle) * bend,
        home.x + Math.cos(angle) * end,
        home.y + Math.sin(angle) * end,
      );
    };
    for (const [width, color] of [
      [2.4, winter ? '#777e6e0a' : '#816c4810'],
      [1.5, winter ? '#b2b19c12' : '#b3986922'],
      [0.7, winter ? '#9c9f8d18' : '#d4b77d25'],
    ] as const) {
      trace();
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  }
  // Small paired strokes suggest repeatedly trodden earth rather than a drawn grid.
  for (let i = 0; i < 55; i++) {
    const angle = random() * Math.PI * 2,
      radius = 2 + random() * 13;
    const x = home.x + Math.cos(angle) * radius,
      y = home.y + Math.sin(angle) * radius;
    ctx.strokeStyle = winter ? '#787e6d28' : i % 3 ? '#806b4a20' : '#f1d5a32a';
    ctx.lineWidth = 0.14;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * 0.35, y + Math.sin(angle) * 0.35);
    ctx.stroke();
  }
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
  // Pigment is subordinate to the landscape shapes, not an all-over noisy carpet.
  for (let i = 0; i < 6200; i++) {
    const x = random() * WIDTH,
      y = random() * HEIGHT;
    const nearHome = Math.hypot(x / SX - home.x, y / SY - home.y) < 11;
    const color = winter
      ? ['#fffdeb36', '#81968b1e', '#b1c2b629'][i % 3]
      : autumn
        ? ['#d1ba8050', '#8c785542', '#556e4936'][i % 3]
        : ['#ddd29c45', '#526e4535', '#81935b45'][i % 3];
    if (nearHome && i % 3) continue;
    dab(ctx, x, y, 0.25 + random() * 0.85, 0.08 + random() * 0.22, color, random() * 1.6);
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 4500; i++) {
    const x = random() * WIDTH,
      y = random() * HEIGHT;
    if (Math.hypot(x / SX - home.x, y / SY - home.y) < 16 + random() * 5) continue;
    const patch = noise(x / 31, y / 24, seed + 126);
    if (patch < 0.36 || (winter && random() > 0.22)) continue;
    const height = 0.45 + random() * 1.7,
      lean = (random() - 0.5) * 2.5;
    // A soft basal paint mark and individually tapered blades, never repeated V symbols.
    dab(ctx, x + 0.3, y + 0.18, 1.1 + random() * 0.9, 0.34, '#324b3022');
    for (let blade = 0; blade < 2 + (i % 4); blade++) {
      const bx = x + (blade - 1.5) * (0.25 + random() * 0.45),
        bladeHeight = height * (0.55 + random() * 0.65),
        tip = lean + (random() - 0.5) * 1.1;
      ctx.strokeStyle = winter
        ? '#6c887a65'
        : season === 1
          ? blade === 1
            ? '#e1cf8b94'
            : '#8b8d4f80'
          : autumn
            ? blade === 1
              ? '#dbb9778c'
              : '#8d784a80'
            : blade === 1
              ? '#cfce939c'
              : '#4c713e80';
      ctx.lineWidth = blade === 1 ? 0.22 : 0.35;
      ctx.beginPath();
      ctx.moveTo(bx, y);
      ctx.quadraticCurveTo(bx + tip * 0.3, y - bladeHeight * 0.6, bx + tip, y - bladeHeight);
      ctx.stroke();
    }
    if (autumn && i % 11 === 0) dab(ctx, x + 1, y - 0.5, 0.65, 0.22, '#9b7d4d66', -0.5);
    if (!winter && i % 31 === 0) {
      dab(ctx, x - 0.25, y - height, 0.42, 0.28, '#f0dfaaad');
      dab(ctx, x + 0.4, y - height + 0.15, 0.27, 0.2, '#e7c6879c');
    }
  }
  // Soil inclusions are sub-pixel specks, not fake harvestable rock silhouettes.
  for (let i = 0; i < 950; i++) {
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
    ['#65755520', 25],
    [winter ? '#d9decb70' : '#b2a47e80', 19],
    [water, 12],
    [winter ? '#d2ded02a' : '#a3b49a18', 5],
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
  paintLandscapeMasses(ctx, originalSeed, season, sectors, home);
  paintCampWear(ctx, originalSeed, season, home);
  paintPigment(ctx, originalSeed);
  paintSmallGrowth(ctx, originalSeed, season, home);
  paintRiver(ctx, originalSeed, season, world);
  return canvas;
}
