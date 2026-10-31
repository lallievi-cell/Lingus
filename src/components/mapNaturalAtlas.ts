import type { MapEntity } from '../game/types';

type NaturalKind = MapEntity['kind'];
type Cutout = { canvas: HTMLCanvasElement; x: number; y: number; width: number; height: number };
type PixelBounds = { x: number; y: number; width: number; height: number };

// A real painted asset supplies the natural silhouettes. Runtime cutouts retain
// transparency and share the same ground anchors as the procedural fallback.
let atlas: HTMLImageElement | null = null;
let status: 'idle' | 'loading' | 'ready' | 'unavailable' = 'idle';
let completion: Promise<boolean> | null = null;
const cutouts = new Map<string, Cutout>();
const MAX_CUTOUTS = 48;
const invalidCutouts = new Set<string>();
const GRID = 4;

/** Ignore faint cast-shadow fringes when fitting the painted object to its cell. */
export function visiblePixelBounds(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): PixelBounds | null {
  let left = width,
    right = -1,
    top = height,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] < 28) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  return right < left
    ? null
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export function ensureNaturalAtlas(): Promise<boolean> {
  if (status === 'ready') return Promise.resolve(true);
  if (status === 'unavailable' || typeof Image === 'undefined') return Promise.resolve(false);
  if (completion) return completion;
  status = 'loading';
  completion = new Promise((resolve) => {
    atlas = new Image();
    atlas.decoding = 'async';
    atlas.onload = () => {
      status =
        atlas!.naturalWidth >= GRID && atlas!.naturalHeight >= GRID ? 'ready' : 'unavailable';
      resolve(status === 'ready');
    };
    atlas.onerror = () => {
      status = 'unavailable';
      resolve(false);
    };
    const base = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;
    atlas.src = `${base}art/valley-natural-atlas.png`;
  });
  return completion;
}

export const getNaturalAtlasStatus = () => status;

function atlasCell(kind: NaturalKind, variant: number, exhausted: boolean, season: number) {
  if (kind === 'tree') return exhausted ? 12 + (variant % 2) : season === 3 ? 14 : variant % 4;
  if (kind === 'berries') return exhausted || season === 3 ? 15 : 4 + (variant % 3);
  if (kind === 'seedling') return 7;
  if (kind === 'stone' && !exhausted) return 8 + (variant % 2);
  if (kind === 'ore' && !exhausted) return 10 + (variant % 2);
  return null;
}

function paintRemainingWinterFruit(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const pigment = context.getImageData(0, 0, canvas.width, canvas.height);
  // Attach the remaining fruit to painted branches, rather than transparent gaps.
  for (const [fx, fy] of [
    [0.26, 0.48],
    [0.47, 0.35],
    [0.68, 0.46],
    [0.58, 0.64],
  ]) {
    let found: { x: number; y: number } | null = null;
    const centerX = Math.floor(fx * canvas.width),
      centerY = Math.floor(fy * canvas.height);
    for (let radius = 0; radius <= 12 && !found; radius++)
      for (let step = 0; step < 12; step++) {
        const angle = (step * Math.PI) / 6;
        const x = centerX + Math.round(Math.cos(angle) * radius),
          y = centerY + Math.round(Math.sin(angle) * radius);
        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
        if (pigment.data[(y * canvas.width + x) * 4 + 3] > 170) {
          found = { x, y };
          break;
        }
      }
    if (!found) continue;
    context.fillStyle = '#a14936';
    context.beginPath();
    context.ellipse(found.x, found.y, 3.8, 4, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e1a47a';
    context.beginPath();
    context.ellipse(found.x - 1.1, found.y - 1.5, 1.1, 1.1, 0, 0, Math.PI * 2);
    context.fill();
  }
}

function buildCutout(
  cell: number,
  kind: NaturalKind,
  exhausted: boolean,
  season: number,
  unknown: boolean,
): Cutout | null {
  if (!atlas) return null;
  // The painted rows have different heights. These gutters lie in the actual
  // transparent spaces, preserving roots and preventing adjacent-row fragments.
  const rows = [0, 350 / 1254, 650 / 1254, 920 / 1254, 1];
  const column = cell % GRID,
    row = Math.floor(cell / GRID);
  const sourceX = Math.round((column * atlas.naturalWidth) / GRID),
    sourceY = Math.round(rows[row] * atlas.naturalHeight);
  const width = Math.round(((column + 1) * atlas.naturalWidth) / GRID) - sourceX,
    height = Math.round(rows[row + 1] * atlas.naturalHeight) - sourceY;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(atlas, sourceX, sourceY, width, height, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const bounds = visiblePixelBounds(pixels.data, width, height);
  if (!bounds) return null;

  // An opaque rectangular plate is not a usable sprite. Keep the existing art
  // if an asset cannot supply a transparent silhouette, rather than drawing tiles.
  const corners = [0, width - 1, (height - 1) * width, width * height - 1];
  if (corners.every((pixel) => pixels.data[pixel * 4 + 3] > 240)) return null;

  const vegetation = kind === 'tree' || kind === 'berries' || kind === 'seedling';
  {
    // Paint, not a CSS filter: retain the warm bark and berry accents while
    // moving green leaf pigments toward late-summer sage or autumn ochre.
    for (let i = 0; i < pixels.data.length; i += 4) {
      const sourceRed = pixels.data[i],
        sourceGreen = pixels.data[i + 1],
        sourceBlue = pixels.data[i + 2];
      if (pixels.data[i + 3] < 10) continue;
      // A matte pigment range ties detailed source paintings to the broader
      // brushwork of people and buildings; avoid fluorescent yellow crowns.
      const luminance = sourceRed * 0.29 + sourceGreen * 0.59 + sourceBlue * 0.12,
        saturation = vegetation ? 0.72 : 0.84;
      const red = (luminance + (sourceRed - luminance) * saturation - 128) * 0.94 + 125,
        green = (luminance + (sourceGreen - luminance) * saturation - 128) * 0.94 + 126,
        blue = (luminance + (sourceBlue - luminance) * saturation - 128) * 0.94 + 125;
      pixels.data[i] = red;
      pixels.data[i + 1] = green;
      pixels.data[i + 2] = blue;
      if (unknown) {
        const luminance = red * 0.29 + green * 0.59 + blue * 0.12;
        pixels.data[i] = luminance * 0.9 + red * 0.1;
        pixels.data[i + 1] = luminance * 0.94 + green * 0.1;
        pixels.data[i + 2] = luminance * 0.88 + blue * 0.1;
        continue;
      }
      if (!vegetation || green < red * 0.9 || green < blue * 1.05 || season === 0) continue;
      if (season === 3) {
        const light = red * 0.29 + green * 0.59 + blue * 0.12;
        pixels.data[i] = light * 0.65 + 80;
        pixels.data[i + 1] = light * 0.69 + 83;
        pixels.data[i + 2] = light * 0.68 + 77;
      } else if (season === 2) {
        pixels.data[i] = Math.min(255, red * 1.22 + 22);
        pixels.data[i + 1] = green * 0.88 + 7;
        pixels.data[i + 2] = blue * 0.76;
      } else {
        pixels.data[i] = Math.min(255, red * 1.07 + 8);
        pixels.data[i + 1] = green * 0.97;
        pixels.data[i + 2] = blue * 0.9;
      }
    }
    context.putImageData(pixels, 0, 0);
  }

  const tallTree = kind === 'tree' && !exhausted;
  const targetWidth = tallTree
    ? 73
    : kind === 'berries'
      ? 58
      : kind === 'seedling'
        ? 20
        : kind === 'tree'
          ? 25
          : 70;
  const targetHeight = tallTree
    ? 76
    : kind === 'berries'
      ? 36
      : kind === 'seedling'
        ? 24
        : kind === 'tree'
          ? 21
          : 39;
  const scale = Math.min(targetWidth / bounds.width, targetHeight / bounds.height);
  const drawWidth = bounds.width * scale,
    drawHeight = bounds.height * scale;
  const cropped = document.createElement('canvas');
  // Keep each resident variant bounded on mobile, independent of source PNG size.
  cropped.width = Math.ceil(drawWidth * 4);
  cropped.height = Math.ceil(drawHeight * 4);
  cropped
    .getContext('2d')!
    .drawImage(
      canvas,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0,
      0,
      cropped.width,
      cropped.height,
    );
  if (kind === 'berries' && season === 3 && !exhausted) paintRemainingWinterFruit(cropped);
  return {
    canvas: cropped,
    x: -drawWidth / 2,
    y: -drawHeight + 3,
    width: drawWidth,
    height: drawHeight,
  };
}

/** False means the procedural art remains authoritative for this frame/state. */
export function drawNaturalAtlas(
  ctx: CanvasRenderingContext2D,
  entity: MapEntity,
  variant: number,
  season: number,
  unknown: boolean,
  time = 0,
) {
  const exhausted = entity.amount <= 0;
  const cell = atlasCell(entity.kind, variant, exhausted, season);
  if (cell === null) return false;
  void ensureNaturalAtlas();
  if (status !== 'ready') return false;
  const key = `${cell}:${season}:${exhausted}:${unknown}`;
  if (invalidCutouts.has(key)) return false;
  let sprite = cutouts.get(key);
  if (!sprite) {
    sprite = buildCutout(cell, entity.kind, exhausted, season, unknown) ?? undefined;
    if (!sprite) {
      invalidCutouts.add(key);
      return false;
    }
    if (cutouts.size >= MAX_CUTOUTS) cutouts.delete(cutouts.keys().next().value!);
    cutouts.set(key, sprite);
  } else {
    cutouts.delete(key);
    cutouts.set(key, sprite);
  }
  ctx.save();
  if (!exhausted && (entity.kind === 'tree' || entity.kind === 'berries')) {
    const strength = entity.kind === 'tree' ? 0.006 : 0.008;
    ctx.transform(1, 0, Math.sin(time * 1.1 + variant * 1.7) * strength, 1, 0, 0);
  }
  if (season === 3 && entity.kind === 'tree' && !exhausted && variant % 2) ctx.scale(-1, 1);
  ctx.drawImage(sprite.canvas, sprite.x, sprite.y, sprite.width, sprite.height);
  ctx.restore();
  return true;
}
