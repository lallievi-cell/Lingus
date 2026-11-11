import type { GameState } from '../game/types';
import { getRiverFords } from '../game/landNavigation';

type Viewport = { minX: number; minY: number; maxX: number; maxY: number };
type Ford = ReturnType<typeof getRiverFords>[number];
const sprites = new Map<string, HTMLCanvasElement>();
const PIXELS = 12;

function bounds(ford: Ford) {
  const along = (7 * ford.width) / 9;
  const rx = Math.abs(ford.dx) * 15 + Math.abs(ford.dy) * along;
  const ry = Math.abs(ford.dy) * 15 + Math.abs(ford.dx) * along;
  return { minX: ford.x - rx, maxX: ford.x + rx, minY: ford.y - ry, maxY: ford.y + ry };
}

export function getVisibleRiverFords(state: GameState, viewport?: Viewport) {
  return getRiverFords(state).filter((ford) => {
    const area = bounds(ford);
    if (
      viewport &&
      (area.maxX < viewport.minX ||
        area.minX > viewport.maxX ||
        area.maxY < viewport.minY ||
        area.minY > viewport.maxY)
    )
      return false;
    return (
      state.tier >= 4 ||
      state.sectors.some(
        (sector) =>
          sector.explored &&
          area.maxX >= sector.x * 100 &&
          area.minX <= (sector.x + 1) * 100 &&
          area.maxY >= sector.y * 100 &&
          area.minY <= (sector.y + 1) * 100,
      )
    );
  });
}

function fordSprite(winter: boolean, variant: number) {
  const key = `${winter}:${variant}`;
  const existing = sprites.get(key);
  if (existing) return existing;
  const canvas = document.createElement('canvas');
  canvas.width = 30 * PIXELS;
  canvas.height = 14 * PIXELS;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(PIXELS, PIXELS);
  ctx.translate(15, 7);
  let seed = 761 + variant * 329;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const oval = (x: number, y: number, rx: number, ry: number, color: string) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };
  const wash = (x: number, y: number, rx: number, ry: number, color: string) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    const paint = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    paint.addColorStop(0, color);
    paint.addColorStop(0.55, color);
    paint.addColorStop(1, `${color.slice(0, 7)}00`);
    ctx.beginPath();
    ctx.ellipse(0, 0, 1, 1, 0, 0, Math.PI * 2);
    ctx.fillStyle = paint;
    ctx.fill();
    ctx.restore();
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Diffuse exposed gravel continues onto the bank, without constructed edges.
  for (const side of [-1, 1]) {
    wash(side * 8.3, -0.1, 4.1, 3.3, winter ? '#c9c5b538' : '#bba77540');
    wash(side * 11.2, 0.4, 3.1, 2.4, winter ? '#c4cbba20' : '#b6aa8028');
  }
  // The sand-and-gravel bed fades into flowing water along both sides.
  wash(0, 0, 8.6, 4.8, winter ? '#c2d1bf67' : '#c4bd8b70');
  wash(-1.3, 0.5, 6.2, 3.2, winter ? '#d2d9bf28' : '#b9b98b25');
  for (let i = 0; i < 36; i++) {
    const x = -5.9 + random() * 11.8;
    const y = -3.9 + random() * 7.8;
    const radius = 0.19 + random() * 0.27;
    oval(x + 0.08, y + 0.08, radius * 1.12, radius * 0.55, '#365c4a27');
    oval(x, y, radius, radius * 0.43, winter ? '#c4c8b69c' : '#b2b08caa');
    oval(x - radius * 0.2, y - radius * 0.1, radius * 0.6, radius * 0.15, '#e6e1ba77');
  }
  // The pale ripple runs with the river, perpendicular to the walkers' route.
  for (let i = 0; i < 8; i++) {
    const x = -5.5 + i * 1.55;
    const y = (i % 2 ? -3.9 : 2.5) + random() * 0.45;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 0.15, y + 0.6, x - 0.08, y + 1.25);
    ctx.strokeStyle = '#e3edda80';
    ctx.lineWidth = 0.11;
    ctx.stroke();
  }
  // Two variants for each season state are the complete, bounded working set.
  if (sprites.size >= 4) sprites.delete(sprites.keys().next().value!);
  sprites.set(key, canvas);
  return canvas;
}

/** Shared real ford positions, clipped to explored ground before projection. */
export function drawRiverFords(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewport?: Viewport,
) {
  const fords = getVisibleRiverFords(state, viewport);
  if (!fords.length) return;
  ctx.save();
  if (state.tier < 4) {
    ctx.beginPath();
    for (const sector of state.sectors)
      if (sector.explored) {
        ctx.rect(sector.x * 240, sector.y * 160, 240, 160);
      }
    ctx.clip();
  }
  for (const ford of fords) {
    let variant = 0;
    for (const character of ford.id) variant = (variant + character.charCodeAt(0)) % 2;
    ctx.save();
    // World-space orientation preserves alignment for both vertical and horizontal rivers.
    const alongScale = ford.width / 9;
    ctx.transform(
      2.4 * ford.dx,
      1.6 * ford.dy,
      -2.4 * ford.dy * alongScale,
      1.6 * ford.dx * alongScale,
      ford.x * 2.4,
      ford.y * 1.6,
    );
    ctx.drawImage(fordSprite(state.seasonIndex % 4 === 3, variant), -15, -7, 30, 14);
    ctx.restore();
  }
  ctx.restore();
}
