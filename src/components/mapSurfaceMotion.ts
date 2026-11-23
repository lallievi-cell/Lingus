import type { GameState } from '../game/types';
import { isWorldPointRevealed } from '../game/worldDimensions';
import { createRiverArtGeometry, sampleRiverArt, type RiverArtGeometry } from './mapRiverGeometry';
import { coastInlandDistance, createCoastGeometry } from '../game/coastGeometry';
import { getCoastHighlights } from './mapCoastArt';
import type { TerrainImage } from './mapTerrainArt';

type Viewport = { minX: number; minY: number; maxX: number; maxY: number };
const geometries = new WeakMap<TerrainImage, RiverArtGeometry>();

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
  const coast = createCoastGeometry(state);
  const count = Math.min(48, Math.ceil(geometry.length / 12));
  const visible = (point: { x: number; y: number }) =>
    (!viewport ||
      (point.x >= viewport.minX - 2 &&
        point.x <= viewport.maxX + 2 &&
        point.y >= viewport.minY - 2 &&
        point.y <= viewport.maxY + 2)) &&
    isWorldPointRevealed(state, point.x, point.y) &&
    (!coast || coastInlandDistance(coast, point) > 0.25);
  const highlights = [];
  for (let i = 0; i < count; i++) {
    const speed = 1.15 + (i % 4) * 0.13;
    const distance = ((i / count) * geometry.length + clock * speed) % geometry.length;
    const a = sampleRiverArt(geometry, distance);
    const b = sampleRiverArt(geometry, distance + 1.3 + (i % 5) * 0.49);
    if (a.dx * b.dx + a.dy * b.dy < 0.88) continue;
    const offset = ((i % 5) - 2) * 1.08;
    const from = { x: a.x - a.dy * offset, y: a.y + a.dx * offset };
    const to = { x: b.x - b.dy * offset, y: b.y + b.dx * offset };
    if (!visible(from) || !visible(to)) continue;
    highlights.push({
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      opacity:
        (state.seasonIndex % 4 === 3 ? 0.25 : 0.36) *
        (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(clock * 0.8 + i * 2.4))),
    });
  }
  return highlights;
}

export function drawMapSurfaceMotion(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  terrain: TerrainImage,
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
  const waves = getCoastHighlights(state, time, viewport, reducedMotion);
  if (!highlights.length && !waves.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.48;
  ctx.strokeStyle = '#def4e8';
  const alpha = ctx.globalAlpha;
  for (const mark of highlights) {
    ctx.globalAlpha = alpha * mark.opacity;
    ctx.beginPath();
    ctx.moveTo(mark.x1 * 2.4, mark.y1 * 1.6);
    ctx.lineTo(mark.x2 * 2.4, mark.y2 * 1.6);
    ctx.stroke();
  }
  ctx.lineWidth = 0.65;
  ctx.strokeStyle = '#f3f5d6';
  for (const mark of waves) {
    ctx.globalAlpha = alpha * mark.opacity;
    ctx.beginPath();
    ctx.moveTo(mark.a.x * 2.4, mark.a.y * 1.6);
    ctx.quadraticCurveTo(
      (mark.a.x + mark.b.x) * 1.2,
      (mark.a.y + mark.b.y) * 0.8 - 0.72,
      mark.b.x * 2.4,
      mark.b.y * 1.6,
    );
    ctx.stroke();
  }
  ctx.restore();
}
