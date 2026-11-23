import type { GameState, Sector } from '../game/types';
import { hasPhysicalCamp } from '../game/physicalCamp';
import { getWorldSectorCount, getWorldSize } from '../game/worldDimensions';
import { createRiverArtGeometry, sampleRiverArt, traceRiverArt } from './mapRiverGeometry';
import { paintCoastSand, paintCoastWater } from './mapCoastArt';

type Geography = Pick<GameState, 'mapGeneration' | 'sectors'>;
type World = Geography &
  Pick<GameState, 'home'> &
  Partial<Pick<GameState, 'world' | 'units' | 'buildings' | 'cities' | 'resources'>>;
type Point = { x: number; y: number };
type Surface = HTMLCanvasElement | OffscreenCanvas;
type Painter = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Brush = HTMLImageElement | ImageBitmap;
export type TerrainImage = HTMLCanvasElement | ImageBitmap;
export type TerrainChart = Geography & { camp: Point | null };
type Color = readonly [number, number, number];
const WIDTH = 1200,
  HEIGHT = 800;
type Projection = { sx: number; sy: number; sectors: number; detail: number; worldSize: number };
type Wear = (x: number, y: number, roughness: number) => number;
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

function groundColors(sectors: Sector[], season: number, side: number): Color[] {
  const palette: Record<Sector['biome'], Color> =
    season === 3
      ? {
          forest: [151, 168, 155],
          plain: [216, 221, 209],
          mountain: [191, 201, 193],
          river: [175, 195, 183],
          wetland: [160, 185, 171],
          dryland: [214, 207, 183],
          coast: [217, 215, 190],
          sea: [124, 163, 164],
        }
      : season === 2
        ? {
            forest: [111, 119, 77],
            plain: [165, 145, 98],
            mountain: [158, 148, 125],
            river: [128, 143, 105],
            wetland: [111, 139, 103],
            dryland: [183, 147, 99],
            coast: [191, 175, 129],
            sea: [96, 143, 147],
          }
        : season === 1
          ? {
              forest: [100, 121, 77],
              plain: [172, 165, 108],
              mountain: [163, 157, 126],
              river: [119, 145, 108],
              wetland: [103, 139, 109],
              dryland: [190, 161, 108],
              coast: [207, 192, 146],
              sea: [96, 143, 147],
            }
          : {
              forest: [76, 101, 74],
              plain: [133, 152, 101],
              mountain: [155, 154, 129],
              river: [96, 131, 109],
              wetland: [89, 124, 108],
              dryland: [178, 159, 113],
              coast: [199, 189, 144],
              sea: [96, 143, 147],
            };
  const cells: Color[] = Array.from({ length: side * side }, () => palette.plain);
  for (const sector of sectors) cells[sector.y * side + sector.x] = palette[sector.biome];
  return cells;
}

/** The gathering place breaks into two used approaches and several islands of
 * rough grass. All marks follow the camp, not an entity or a pathfinding hint. */
function campWear(home: Point, seed: number): Wear {
  const random = randomStream(seed ^ 0x574ea3d1);
  const heading = random() * Math.PI * 2;
  const approaches = [heading, heading + 2.72, heading + 4.05].map((angle, index) => ({
    ux: Math.cos(angle),
    uy: Math.sin(angle),
    bend: (random() - 0.5) * 0.38,
    length: index ? 19 + random() * 7 : 33 + random() * 7,
    width: index ? 1.8 : 2.8,
  }));
  const east = Math.cos(heading),
    north = Math.sin(heading);
  return (wx, wy, roughness) => {
    const x = wx - home.x,
      y = wy - home.y;
    if (Math.abs(x) > 41 || Math.abs(y) > 41) return 0;
    const along = x * east + y * north;
    const cross = y * east - x * north;
    const clearing = Math.hypot(along * 0.84, cross * 1.11);
    const opening = 1 - smooth(clamp((clearing - 6.5 + (roughness - 0.5) * 10) / 9.2));
    let wear = opening * (0.72 + roughness * 0.21);
    for (const { ux, uy, bend, length, width } of approaches) {
      const distance = x * ux + y * uy;
      if (distance < 4 || distance >= length) continue;
      const progress = distance / length;
      const across = Math.abs(y * ux - x * uy - bend * distance * (1 - progress));
      const track = clamp(1 - across / (width * (1.3 - progress) + roughness * 1.8));
      wear = Math.max(wear, track * (1 - progress) * (0.86 + roughness * 0.32));
    }
    return wear;
  };
}

/** A field of overlapping slopes and runnels, sampled at fixed map positions.
 * Its relief is only pigment, so the movement and picking plane stays flat. */
function paintGround(
  ctx: Painter,
  seed: number,
  season: number,
  sectors: Sector[],
  wearAt: Wear,
  projection: Projection,
  brush: Brush | null,
) {
  const { sx, sy, sectors: side, detail } = projection;
  const base = makeSurface(WIDTH, HEIGHT);
  const painter = surfacePainter(base);
  const image = painter.createImageData(WIDTH, HEIGHT);
  const { data } = image;
  const wearMask = brush ? new Uint8ClampedArray(WIDTH * HEIGHT) : null;
  const cells = groundColors(sectors, season, side);
  const winter = season === 3;
  const earth: Color = winter ? [157, 151, 127] : [154, 119, 76];
  const cool: Color = winter ? [-14, -9, 3] : [-35, -20, -6];
  const warm: Color = winter ? [12, 11, 7] : [37, 31, 9];

  // Warp the larger wash independently of the local slope, so a bank or an
  // exposed patch can change colour without having a fixed geometric outline.
  const step = 6;
  const columns = Math.ceil(WIDTH / step) + 2;
  const rows = Math.ceil(HEIGHT / step) + 2;
  const loam = new Float32Array(columns * rows);
  const height = new Float32Array(loam.length);
  const exposure = new Float32Array(loam.length);
  const relief = new Float32Array(loam.length);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const x = (i * step) / detail,
        y = (j * step) / detail;
      const warp = (noise(x / 83, y / 71, seed ^ 0x34f1ba) - 0.5) * 60;
      const wide = noise((x + warp) / 103, (y - warp * 0.5) / 73, seed);
      const folds = noise((x + y * 0.42 + warp) / 64, (y - x * 0.36) / 21, seed + 739);
      const fine = noise((x + warp) / 19, y / 13, seed + 126);
      const index = j * columns + i;
      loam[index] = wide * 0.61 + fine * 0.39;
      height[index] = folds * 0.71 + fine * 0.29;
      exposure[index] = smooth(clamp((wide * 0.66 + folds * 0.34 - 0.25) * 2.15));
    }
  }
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < columns - 1; i++) {
      const index = j * columns + i;
      relief[index] =
        (height[index] - height[index + 1]) * 62 * detail +
        (height[index] - height[index + columns]) * 92 * detail;
    }
  }
  const sample = (field: Float32Array, index: number, x: number, y: number) =>
    blend(
      blend(field[index], field[index + 1], x),
      blend(field[index + columns], field[index + columns + 1], x),
      y,
    );
  for (let y = 0; y < HEIGHT; y++) {
    const gy = y / (sy * 100) - 0.5;
    const iy = Math.floor(gy),
      fy = smooth(gy - iy);
    const y0 = Math.max(0, Math.min(side - 1, iy));
    const y1 = Math.max(0, Math.min(side - 1, iy + 1));
    const fieldRow = Math.floor(y / step) * columns;
    const v = (y % step) / step;
    for (let x = 0; x < WIDTH; x++) {
      const gx = x / (sx * 100) - 0.5;
      const ix = Math.floor(gx),
        fx = smooth(gx - ix);
      const x0 = Math.max(0, Math.min(side - 1, ix));
      const x1 = Math.max(0, Math.min(side - 1, ix + 1));
      const a = cells[y0 * side + x0],
        b = cells[y0 * side + x1];
      const c = cells[y1 * side + x0],
        d = cells[y1 * side + x1];
      const index = fieldRow + Math.floor(x / step);
      const u = (x % step) / step;
      const patches = sample(loam, index, u, v);
      const light = sample(exposure, index, u, v);
      const clumps = noise(x / (7.8 * detail), y / (5.3 * detail), seed + 711);
      const grain = hash(x, y, seed + 1709);
      const scuff = wearAt(x / sx, y / sy, clumps * 0.7 + patches * 0.3);
      const shade = sample(relief, index, u, v) * (1 - scuff * 0.63);
      const exposedSoil =
        clamp((patches * 0.8 + clumps * 0.2 - 0.54) * 2.2) * (winter ? 0.28 : 0.31);
      const wear = Math.max(scuff, exposedSoil);
      const texture = (clumps - 0.5) * (9 + wear * 12) + (grain - 0.5) * 4.8;
      const pixel = (y * WIDTH + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const pigment = blend(
          blend(a[channel], b[channel], fx),
          blend(c[channel], d[channel], fx),
          fy,
        );
        const wash = blend(cool[channel], warm[channel], light);
        data[pixel + channel] =
          blend(pigment + wash, earth[channel] + wash * 0.48, wear) + shade + texture;
      }
      if (wearMask) wearMask[pixel / 4] = scuff * 271;
      data[pixel + 3] = 255;
    }
  }
  painter.putImageData(image, 0, 0);
  ctx.drawImage(base, 0, 0);
  if (brush && wearMask) {
    glazeMeadow(ctx, brush, detail, season);
    // Reuse the small underpainting to let the relief disappear where feet
    // have exposed the loam. The shader never requires a second terrain cache.
    for (let i = 0; i < wearMask.length; i++) data[i * 4 + 3] = wearMask[i];
    painter.putImageData(image, 0, 0);
    ctx.drawImage(base, 0, 0);
  }
}

function glazeMeadow(ctx: Painter, brush: Brush | null, detail: number, season: number) {
  if (!brush) return;
  const pattern = ctx.createPattern(brush, 'repeat');
  if (!pattern) return;
  // The authored value tile is smaller in map metres than any habitat. Its
  // flattened projection follows the very same axes as the canvas ground.
  const width = 118 * detail;
  const depth = 79 * detail;
  const pixelWidth = 'naturalWidth' in brush ? brush.naturalWidth : brush.width;
  const pixelHeight = 'naturalHeight' in brush ? brush.naturalHeight : brush.height;
  pattern.setTransform({ a: width / pixelWidth, d: depth / pixelHeight });
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = season === 3 ? 0.25 : 0.63;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.restore();
}

function dab(ctx: Painter, x: number, y: number, rx: number, ry: number, color: string, angle = 0) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
  ctx.fill();
}

function brushIsland(
  ctx: Painter,
  x: number,
  y: number,
  width: number,
  depth: number,
  color: string,
  phase: number,
  detail: number,
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
      thickness = 0.3 * detail + depth * (0.04 + random() * 0.12);
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

type GrowthPigment = { roots: string; blade: string; light: string; seeds: string };

const grassPigments: GrowthPigment[][] = [
  [
    { roots: '#40534486', blade: '#536945b6', light: '#8d9b65c7', seeds: '#bfc18ea8' },
    { roots: '#5a65458d', blade: '#788348b5', light: '#a9ae72d8', seeds: '#d5ca8db5' },
    { roots: '#5158379c', blade: '#788150c4', light: '#b3b67fc6', seeds: '#e0d8a2c7' },
  ],
  [
    { roots: '#67554179', blade: '#7d774abf', light: '#bcaa6cbc', seeds: '#d7c38ada' },
    { roots: '#68614589', blade: '#8c8051cd', light: '#bfb16abf', seeds: '#e3cc8dda' },
    { roots: '#79613c89', blade: '#9e8b53bc', light: '#ceb779cc', seeds: '#e7ce93d9' },
  ],
  [
    { roots: '#5b523d86', blade: '#766548b9', light: '#b39968c6', seeds: '#cdb98bc9' },
    { roots: '#6f56398e', blade: '#836646c4', light: '#ba9464ca', seeds: '#dec293c5' },
    { roots: '#73604191', blade: '#998156b7', light: '#ceb582ca', seeds: '#e4c799d4' },
  ],
  [
    { roots: '#636d5c70', blade: '#6e7a66a4', light: '#9ba28eb9', seeds: '#b9b8a0c9' },
    { roots: '#7b806e76', blade: '#8b8e75b3', light: '#a9ab94c0', seeds: '#cccab1c3' },
    { roots: '#8183727e', blade: '#8d917cae', light: '#bfc1acc9', seeds: '#efebd5cf' },
  ],
];

function tuft(
  ctx: Painter,
  x: number,
  y: number,
  size: number,
  lean: number,
  pigment: GrowthPigment,
  random: () => number,
  seedHeads: boolean,
) {
  dab(ctx, x + size * 0.2, y + size * 0.12, size * 0.91, size * 0.24, pigment.roots, -0.18);
  const blades = 4 + Math.floor(random() * 4);
  for (let index = 0; index < blades; index++) {
    const spread = index / (blades - 1) - 0.5;
    const bx = x + spread * size * 0.66;
    const h = size * (0.5 + random() * 0.75);
    const tx = bx + (lean + spread * 2.36) * size * (0.46 + random() * 0.32);
    const ty = y - h;
    const w = size * (0.055 + random() * 0.075);
    ctx.fillStyle = index % 3 ? pigment.blade : pigment.light;
    ctx.beginPath();
    ctx.moveTo(bx - w, y);
    ctx.quadraticCurveTo(bx - w, y - h * 0.72, tx, ty);
    ctx.quadraticCurveTo(bx + w * 1.1, y - h * 0.63, bx + w, y);
    ctx.fill();
    if (seedHeads && index % 3 === 1) {
      dab(ctx, tx - w * 0.4, ty, w * 1.5, h * 0.115, pigment.seeds, 0.65);
    }
  }
}

function broadleaf(ctx: Painter, pigment: GrowthPigment, random: () => number) {
  dab(ctx, 0.25, 0.26, 1.3, 0.39, pigment.roots, -0.18);
  const leaves = 4 + Math.floor(random() * 3);
  for (let index = 0; index < leaves; index++) {
    const spread = index / (leaves - 1) - 0.5;
    const x = spread * 3.1;
    const y = -(1 - Math.abs(spread) * 0.9) * (0.78 + random() * 0.82);
    const midX = x * 0.59;
    const midY = y * 0.68;
    const curl = spread * 0.18;
    ctx.fillStyle = pigment.blade;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(midX + curl, midY + 0.25, x, y);
    ctx.quadraticCurveTo(midX - curl, midY - 0.47, 0, 0);
    ctx.fill();
    ctx.fillStyle = pigment.light;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(midX, midY - 0.13, x, y);
    ctx.quadraticCurveTo(midX - curl, midY - 0.45, 0, 0);
    ctx.fill();
  }
}

const growthTile = 36;
const growthVariants = 7;

function meadowStamps(season: number) {
  const image = makeSurface(growthVariants * growthTile, grassPigments[season].length * growthTile);
  const painter = surfacePainter(image);
  grassPigments[season].forEach((pigment, row) => {
    for (let variant = 0; variant < growthVariants; variant++) {
      const random = randomStream(311 + season * 7 + variant * 31);
      painter.save();
      painter.translate((variant + 0.5) * growthTile, (row + 0.7) * growthTile);
      painter.scale(9, 9);
      if (variant >= 5) broadleaf(painter, pigment, random);
      else tuft(painter, 0, 0, 1, variant / 5 - 0.3, pigment, random, variant % 2 === 0);
      painter.restore();
    }
  });
  return image;
}

/** Turn the broad pigment into clusters with their own silhouette. Tufts
 * in a patch stand along the same slope, with bald margins and foot traffic. */
function paintMeadow(
  ctx: Painter,
  seed: number,
  season: number,
  wearAt: Wear,
  projection: Projection,
  sectors: Sector[],
) {
  const { sx, sy, detail, sectors: side } = projection;
  const biomes = new Map(sectors.map((sector) => [sector.y * side + sector.x, sector.biome]));
  const biomeAt = (x: number, y: number) =>
    biomes.get(Math.floor(y / (sy * 100)) * side + Math.floor(x / (sx * 100)));
  const random = randomStream(seed ^ 0x38e2f6a1);
  const winter = season === 3;
  const stamps = meadowStamps(season);
  for (let i = 0; i < 2350 / (detail * detail); i++) {
    const x = random() * WIDTH;
    const y = random() * HEIGHT;
    const biome = biomeAt(x, y);
    if (biome === 'sea' || biome === 'coast') continue;
    const drift = noise(
      x / (32 * detail) + y / (86 * detail),
      (y - x * 0.29) / (11 * detail),
      seed + 126,
    );
    const threshold =
      biome === 'plain' ? 0.28 : biome === 'dryland' || biome === 'mountain' ? 0.65 : 0.39;
    if (drift < threshold || (winter && random() > 0.22)) continue;
    const wear = wearAt(x / sx, y / sy, drift);
    if (wear > 0.29 && random() < wear * 1.58) continue;

    const size = (1.75 + Math.pow(random(), 1.7) * 1.77) * detail;
    const spread = (4 + random() * 10) * detail;
    const row = Math.min(2, Math.floor(drift * 3)) * growthTile;
    const shoots = 3 + Math.floor(3 * drift);
    for (let index = 0; index < shoots; index++) {
      const wx = x + (random() - 0.5) * spread;
      const wy = y + (random() - 0.5) * spread * 0.63;
      const scale = size * (0.54 + random() * 0.78) * 4;
      const variant = Math.floor(random() * (winter || drift < 0.51 ? 5 : growthVariants));
      ctx.drawImage(
        stamps,
        variant * growthTile,
        row,
        growthTile,
        growthTile,
        wx - scale * 0.5,
        wy - scale * 0.7,
        scale,
        scale,
      );
    }
  }
}

/** Low grit and drag marks make the floor feel walked over at play zoom. */
function paintSoil(
  ctx: Painter,
  seed: number,
  season: number,
  home: Point,
  wearAt: Wear,
  { sx, sy, detail }: Projection,
) {
  const random = randomStream(seed ^ 0x4b13da75);
  const winter = season === 3;
  for (let i = 0; i < 1050 / (detail * detail); i++) {
    const x = random() * WIDTH;
    const y = random() * HEIGHT;
    const size = (0.25 + random() * 0.46) * detail;
    dab(ctx, x + size * 0.31, y + size * 0.28, size * 1.4, size * 0.54, '#534d3746');
    dab(ctx, x, y, size, size * 0.55, winter ? '#cbcbbb95' : '#b4a48995', -0.2);
  }
  for (let index = 0; index < 430; index++) {
    const wx = home.x + (random() - 0.5) * 49;
    const wy = home.y + (random() - 0.5) * 49;
    const wear = wearAt(wx, wy, random());
    if (wear < 0.19 || random() > wear * 1.4) continue;
    const x = wx * sx;
    const y = wy * sy;
    const radius = (0.3 + random() * 1.65) * detail;
    const lean = (random() - 0.5) * 1.9 - 0.32;
    dab(ctx, x + detail * 0.16, y + detail * 0.28, radius, radius * 0.26, '#664f3954', lean);
    dab(ctx, x, y, radius * 0.78, radius * 0.22, winter ? '#cfcaad84' : '#d1b18093', lean);
  }
}

/** Habitat accents stay on the cached ground: damp soil is walkable, unlike the
 * actual painted river. The accents have no effect on the world state. */
function paintBiomeAccents(
  ctx: Painter,
  seed: number,
  season: number,
  sectors: Sector[],
  home: Point,
  projection: Projection,
) {
  const { sx: SX, sy: SY, detail } = projection;
  const winter = season === 3,
    autumn = season === 2;
  const random = randomStream(seed ^ 0x36ba92e7);
  ctx.save();
  ctx.lineCap = 'round';
  for (const sector of sectors) {
    const wet = sector.biome === 'wetland';
    if (!wet && sector.biome !== 'dryland') continue;
    for (let index = 0; index < (wet ? 48 : 28); index++) {
      // A faded perimeter mingles with the existing colour wash, avoiding a
      // square edge where one sector's vegetation meets another habitat.
      const u = random(),
        v = random();
      const edge = Math.min(u, v, 1 - u, 1 - v);
      if (random() > 0.35 + Math.min(1, edge * 8) * 0.65) continue;
      const wx = (sector.x + u) * 100,
        wy = (sector.y + v) * 100;
      if (Math.hypot(wx - home.x, wy - home.y) < 24) continue;
      const x = wx * SX,
        y = wy * SY,
        width = (3 + random() * 5) * SX,
        depth = (0.7 + random() * 1.4) * SY;
      brushIsland(
        ctx,
        x,
        y,
        width,
        depth,
        wet ? (winter ? '#627f7524' : '#355e4827') : winter ? '#ab986d20' : '#9d75452b',
        random() * 7,
        detail,
      );
      if (wet) {
        // Rushes grow in uneven low clumps. Muted stems remain distinct from
        // the tall resource trees and never suggest collectible goods.
        const height = (winter ? 1.4 : 2.2) * detail;
        for (let stem = 0; stem < 5; stem++) {
          const bx = x + (random() - 0.5) * 4 * detail,
            bend = (random() - 0.5) * 1.6 * detail,
            top = y - height * (0.6 + random() * 0.9);
          ctx.strokeStyle =
            stem % 2 === 0
              ? winter
                ? '#8d977780'
                : autumn
                  ? '#aa9d627d'
                  : '#a8b27d85'
              : winter
                ? '#617e6b75'
                : '#4b715585';
          ctx.lineWidth = 0.27 * detail;
          ctx.beginPath();
          ctx.moveTo(bx, y);
          ctx.quadraticCurveTo(bx + bend * 0.3, top + height * 0.4, bx + bend, top);
          ctx.stroke();
        }
        dab(ctx, x, y + 0.25 * detail, 3 * detail, 0.45 * detail, '#b2c5a621', -0.08);
      } else {
        // Flat mineral flecks and hairline clay seams read as sparse earth,
        // rather than boulders or a new impassable wall.
        ctx.strokeStyle = winter ? '#9e937b32' : '#86693e37';
        ctx.lineWidth = 0.2 * detail;
        ctx.beginPath();
        ctx.moveTo(x - width * 0.45, y + depth * 0.2);
        ctx.lineTo(x - width * 0.05, y - depth * 0.15);
        ctx.lineTo(x + width * 0.35, y + depth * 0.1);
        ctx.stroke();
        for (let speck = 0; speck < 4; speck++)
          dab(
            ctx,
            x + (random() - 0.5) * width,
            y + (random() - 0.5) * depth,
            (0.35 + random() * 0.45) * detail,
            0.19 * detail,
            winter ? '#c4bea576' : '#c6ad7675',
            -0.2,
          );
      }
    }
  }
  ctx.restore();
}

function paintRiver(
  ctx: Painter,
  seed: number,
  season: number,
  projection: Projection,
  world?: Geography,
) {
  const { sx: SX, sy: SY, worldSize } = projection;
  const random = randomStream(seed ^ 0x724e38a5),
    winter = season === 3;
  const geometry = createRiverArtGeometry(world);
  const trace = () => traceRiverArt(ctx, geometry);
  ctx.save();
  ctx.scale(SX, SY);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const water = ctx.createLinearGradient(0, 0, worldSize, worldSize);
  water.addColorStop(0, winter ? '#849f9b' : '#557e77');
  water.addColorStop(0.5, winter ? '#a7bab1' : '#7d9e8b');
  water.addColorStop(1, winter ? '#94b4b2' : '#597f79');
  for (const [color, width] of [
    ['#65755520', 25],
    [winter ? '#d9decb70' : '#b2a47e80', 19],
    ['#35534c44', 14.2],
    [winter ? '#edf1dc55' : '#d6c59270', 13.1],
    [water, 12],
    [winter ? '#d2ded02a' : '#a3b49a18', 5],
  ] as const) {
    trace();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  // Layered strokes keep the banks joined even when the inside bend is
  // tighter than the stream width; an offset outline would fold over itself.
  // Samples follow the very same curve used by the paint, including Seed Zero.
  for (let i = 0; i < Math.ceil(geometry.length * 1.4); i++) {
    const sample = sampleRiverArt(geometry, random() * geometry.length);
    const offset = (random() - 0.5) * 7;
    const x = sample.x - sample.dy * offset,
      y = sample.y + sample.dx * offset;
    const span = 0.8 + random() * 1.5;
    ctx.strokeStyle = i % 4 ? '#d4dfc73a' : '#3f6c6640';
    ctx.lineWidth = 0.12 + random() * 0.15;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + sample.dx * 0.8 - sample.dy * 0.2,
      y + sample.dy * 0.8 + sample.dx * 0.2,
      x + sample.dx * span,
      y + sample.dy * span,
    );
    ctx.stroke();
  }
  for (let i = 0; i < Math.ceil(geometry.length / 2); i++) {
    const distance = random() * geometry.length;
    const sample = sampleRiverArt(geometry, distance);
    const before = sampleRiverArt(geometry, distance - 12);
    const after = sampleRiverArt(geometry, distance + 12);
    // Do not put bank vegetation across the water at a tight inner bend.
    if (before.dx * after.dx + before.dy * after.dy < 0.94) continue;
    const bank = (random() > 0.5 ? 1 : -1) * (8.5 + random() * 2);
    const x = sample.x - sample.dy * bank,
      y = sample.y + sample.dx * bank;
    dab(ctx, x, y + 0.2, 0.4 + random() * 0.5, 0.12, winter ? '#d8ddc84d' : '#d2c39a55');
    ctx.strokeStyle = winter ? '#7b8c765c' : '#60745070';
    ctx.lineWidth = 0.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - 0.15, y - 0.5, x + (random() - 0.5) * 0.5, y - 0.8 - random() * 0.4);
    ctx.stroke();
  }
  ctx.restore();
}

function makeSurface(width: number, height: number) {
  if (typeof document === 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function surfacePainter(canvas: Surface) {
  // The common getContext overload widens the return value on these two surfaces.
  const painter = canvas.getContext('2d') as Painter | null;
  if (!painter) throw new Error('Cannot create the terrain canvas context');
  return painter;
}

/** Synchronous art entry point for direct drawing and browsers without a canvas worker. */
export function createPainterlyTerrain(
  seed: number,
  seasonIndex: number,
  world?: World,
  brush: HTMLImageElement | null = null,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * 3;
  canvas.height = HEIGHT * 3;
  const chart = world && {
    mapGeneration: world.mapGeneration,
    sectors: world.sectors,
    camp: hasPhysicalCamp(world) ? world.home : null,
  };
  paintTerrain(canvas, seed, seasonIndex, chart, brush);
  return canvas;
}

export function createTerrainBitmap(
  seed: number,
  season: number,
  chart: TerrainChart,
  brush: ImageBitmap | null,
) {
  const canvas = new OffscreenCanvas(WIDTH * 3, HEIGHT * 3);
  paintTerrain(canvas, seed, season, chart, brush);
  return canvas.transferToImageBitmap();
}

/** Deterministic, multi-scale surface art; simulation coordinates and resources remain authoritative. */
function paintTerrain(
  canvas: Surface,
  seed: number,
  seasonIndex: number,
  world: TerrainChart | undefined,
  brush: Brush | null,
) {
  const ctx = surfacePainter(canvas);
  ctx.scale(3, 3);
  const season = seasonIndex % 4;
  const originalSeed = world?.mapGeneration?.seed ?? seed;
  const sectors = world?.sectors ?? defaultSectors();
  // An uninhabited region has a bookkeeping home, not a clearing or worn paths.
  const home = world ? (world.camp ?? { x: -1000, y: -1000 }) : { x: 250, y: 250 };
  const worldSize = getWorldSize(world ?? {});
  const projection: Projection = {
    sx: WIDTH / worldSize,
    sy: HEIGHT / worldSize,
    sectors: getWorldSectorCount(world ?? {}),
    detail: 500 / worldSize,
    worldSize,
  };
  // Coastal sectors can contain both water and a small island. The physical
  // sea is painted afterwards, so the cached underpainting must remain earth
  // wherever the shared polygon leaves dry land inside an otherwise sea cell.
  const groundSectors =
    world?.mapGeneration?.worldRules === 1
      ? sectors.map<Sector>((sector) =>
          sector.biome === 'sea' ? { ...sector, biome: 'coast' } : sector,
        )
      : sectors;
  const wearAt = campWear(home, originalSeed);
  paintGround(ctx, originalSeed, season, groundSectors, wearAt, projection, brush);
  paintMeadow(ctx, originalSeed, season, wearAt, projection, groundSectors);
  paintSoil(ctx, originalSeed, season, home, wearAt, projection);
  paintBiomeAccents(ctx, originalSeed, season, sectors, home, projection);
  if (world) {
    ctx.save();
    ctx.scale(projection.sx, projection.sy);
    paintCoastSand(ctx, world, season === 3);
    ctx.restore();
  }
  paintRiver(ctx, originalSeed, season, projection, world);
  if (world) {
    ctx.save();
    ctx.scale(projection.sx, projection.sy);
    paintCoastWater(ctx, world, season === 3);
    ctx.restore();
  }
}
