import { getCalendar } from '../game/calendar';
import type { GameState } from '../game/types';

type Viewport = { minX: number; minY: number; maxX: number; maxY: number };
type GroundShadow = { id: string; x: number; y: number; width: number; height: number };

/** Ground light follows the simulation clock, including the slower opening year. */
export function getGroundLight(state: GameState) {
  const phase = getCalendar(state).canonicalPhase;
  // Day occupies the first two thirds of every season, in both calendars.
  // Reset the sun behind a fully faded shadow so dawn never flips visibly.
  const progress = Math.min(1, phase / 60);
  const smooth = (value: number) => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  };
  const daylight = smooth(phase / 6) * smooth((60 - phase) / 6);
  return {
    opacity: daylight * (state.disasters.storm || state.disasters.blizzard ? 0.1 : 0.22),
    stretch: 0.45 + 1.35 * (1 - Math.sin(progress * Math.PI)),
    // Sun east → south → west; casts west → north → east on the ground plane.
    angle: -Math.PI + progress * Math.PI,
  };
}

export function getGroundShadows(state: GameState, viewport?: Viewport): GroundShadow[] {
  // Leave room for a low sun's rotated cast even when its source is offscreen.
  const visible = (point: { x: number; y: number }) =>
    (!viewport ||
      (point.x >= viewport.minX - 20 &&
        point.x <= viewport.maxX + 20 &&
        point.y >= viewport.minY - 20 &&
        point.y <= viewport.maxY + 20)) &&
    (state.tier >= 4 ||
      state.sectors.some(
        (sector) =>
          sector.explored &&
          sector.x === Math.min(4, Math.floor(point.x / 100)) &&
          sector.y === Math.min(4, Math.floor(point.y / 100)),
      ));
  const shadows: GroundShadow[] = [];
  for (const source of state.entities) {
    if (!visible(source)) continue;
    if (source.kind === 'ore' && source.amount <= 0) continue;
    if (source.kind === 'ore' && (state.words.O_07?.retention ?? 0) <= 0) continue;
    const size =
      source.kind === 'tree'
        ? source.amount > 0
          ? [8.5, 3.4]
          : [2.2, 1.1]
        : source.kind === 'stone' || source.kind === 'ore'
          ? [4.4, 2]
          : source.kind === 'berries' && source.amount > 0
            ? [3.1, 1.4]
            : null;
    if (size)
      shadows.push({ id: source.id, x: source.x, y: source.y, width: size[0], height: size[1] });
  }
  if (!state.urbanized)
    for (const building of state.buildings) {
      if (building.hp <= 0 || building.completed === false || !visible(building)) continue;
      // Low installations already have contact shading; only raised structures cast here.
      const size = [
        'hut',
        'house',
        'workshop',
        'archive',
        'school',
        'temple',
        'palace',
        'court',
        'market',
      ].includes(building.kind)
        ? [8, 3.8]
        : ['menhir', 'stele', 'foundry'].includes(building.kind)
          ? [4.7, 2.4]
          : null;
      if (size)
        shadows.push({
          id: building.id,
          x: building.x,
          y: building.y,
          width: size[0],
          height: size[1],
        });
    }
  return shadows;
}

let shadowMask: HTMLCanvasElement | undefined;
function mask() {
  if (shadowMask) return shadowMask;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  gradient.addColorStop(0, '#213728');
  gradient.addColorStop(0.45, '#213728b8');
  gradient.addColorStop(1, '#21372800');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  shadowMask = canvas;
  return canvas;
}

/** One small cached mask, no blur/filter pass or additional full-world canvas. */
export function drawMapGroundShadows(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewport?: Viewport,
) {
  const light = getGroundLight(state);
  if (light.opacity <= 0) return;
  const image = mask();
  ctx.save();
  ctx.globalAlpha *= light.opacity;
  for (const shadow of getGroundShadows(state, viewport)) {
    const width = shadow.width * light.stretch;
    ctx.save();
    ctx.translate(shadow.x * 2.4, shadow.y * 1.6 + 0.5);
    ctx.rotate(light.angle);
    ctx.drawImage(image, -width * 0.14, -shadow.height, width * 2, shadow.height * 2);
    ctx.restore();
  }
  ctx.restore();
}
