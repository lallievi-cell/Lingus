import type { GameState } from '../game/types';
import { createRiverArtGeometry, sampleRiverArt, type RiverArtGeometry } from './mapRiverGeometry';

type Viewport = { minX: number; minY: number; maxX: number; maxY: number };
const geometries = new WeakMap<HTMLCanvasElement, RiverArtGeometry>();

/** Current highlights share the exact painted river, never an approximate second path. */
export function getRiverHighlights(
  geometry: RiverArtGeometry,
  state: GameState,
  time: number,
  viewport?: Viewport,
  reducedMotion = false,
) {
  if (reducedMotion || state.disasters.blizzard || geometry.length <= 0) return [];
  const clock = state.paused ? state.time : time;
  const count = Math.min(48, Math.ceil(geometry.length / 12));
  const visible = (point: { x: number; y: number }) =>
    (!viewport ||
      (point.x >= viewport.minX - 2 &&
        point.x <= viewport.maxX + 2 &&
        point.y >= viewport.minY - 2 &&
        point.y <= viewport.maxY + 2)) &&
    (state.tier >= 4 ||
      state.sectors.some(
        (sector) =>
          sector.explored &&
          sector.x === Math.min(4, Math.floor(point.x / 100)) &&
          sector.y === Math.min(4, Math.floor(point.y / 100)),
      ));
  const highlights = [];
  for (let i = 0; i < count; i++) {
    const distance = ((i / count) * geometry.length + clock * 1.1) % geometry.length;
    const a = sampleRiverArt(geometry, distance);
    const b = sampleRiverArt(geometry, Math.min(geometry.length, distance + 1.5 + (i % 3) * 0.4));
    if (!visible(a) || !visible(b)) continue;
    const offset = ((i % 3) - 1) * 0.55;
    highlights.push({
      x1: a.x - a.dy * offset,
      y1: a.y + a.dx * offset,
      x2: b.x - b.dy * offset,
      y2: b.y + b.dx * offset,
      opacity:
        (state.seasonIndex % 4 === 3 ? 0.12 : 0.22) *
        (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(clock * 0.8 + i * 2.4))),
    });
  }
  return highlights;
}

export function drawMapSurfaceMotion(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  terrain: HTMLCanvasElement,
  time: number,
  viewport?: Viewport,
  reducedMotion = false,
) {
  if (reducedMotion) return;
  let geometry = geometries.get(terrain);
  if (!geometry) {
    geometry = createRiverArtGeometry(state);
    geometries.set(terrain, geometry);
  }
  const highlights = getRiverHighlights(geometry, state, time, viewport);
  if (!highlights.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.35;
  ctx.strokeStyle = '#e2eee0';
  const alpha = ctx.globalAlpha;
  for (const mark of highlights) {
    ctx.globalAlpha = alpha * mark.opacity;
    ctx.beginPath();
    ctx.moveTo(mark.x1 * 2.4, mark.y1 * 1.6);
    ctx.lineTo(mark.x2 * 2.4, mark.y2 * 1.6);
    ctx.stroke();
  }
  ctx.restore();
}
