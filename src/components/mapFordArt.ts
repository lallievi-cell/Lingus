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
    wash(side * 8.3, -0.1, 4.1, 3.3, winter ? '#c9c5b594' : '#c9ab7598');
    wash(side * 11.2, 0.4, 3.1, 2.4, winter ? '#c4cbba38' : '#b6aa8046');
  }
  // The crossing is a submerged strip with loosely grouped gravel.
  wash(0, -0.2, 8.9, 4.65, winter ? '#b0c9bf80' : '#a5b78a95');
  wash(-1.3, 0.5, 6.7, 2.9, winter ? '#d7decb63' : '#d2ca9462');
  for (let i = 0; i < 60; i++) {
    const x = -10.0 + random() * 20.0;
    const y = (random() + random() - 1) * (3.3 - Math.abs(x) * 0.12);
    const radius = 0.14 + random() ** 2 * 0.59;
    const sand = winter ? '#ced8c7d0' : '#d2bd8bce';
    const shale = winter ? '#8badaaba' : '#768c78c5';
    oval(x + 0.08, y + 0.12, radius * 1.25, radius * 0.58, '#213f4471');
    oval(x, y, radius, radius * 0.46, i % 3 === 0 ? shale : sand);
    oval(x - radius * 0.24, y - radius * 0.16, radius * 0.55, radius * 0.15, '#f1e3b99d');
  }
  // Pale hooks mark the current along the shallow strip.
  for (let i = 0; i < 17; i++) {
    const x = -5.6 + random() * 11.2;
    const y = (i % 2 ? -3.7 : 1.6) + random() * 0.85;
    const flow = 0.4 + random() * 1.15;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 0.2, y + flow * 0.46, x - 0.04, y + flow);
    ctx.strokeStyle = '#e5f3ddab';
    ctx.lineWidth = 0.1 + random() * 0.17;
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
