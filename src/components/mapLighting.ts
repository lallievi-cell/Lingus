import { getCalendar } from '../game/calendar';
import type { GameState } from '../game/types';
import { isWorldPointRevealed } from '../game/worldDimensions';

type Viewport = { minX: number; minY: number; maxX: number; maxY: number };
type ShadowForm = 'canopy' | 'low' | 'stone' | 'roof' | 'person';
type GroundShadow = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  form: ShadowForm;
};

type Pigment = readonly [red: number, green: number, blue: number, alpha: number];
type Grade = {
  phase: number;
  shade: Pigment;
  ambient: Pigment;
  key: Pigment;
  darkness: number;
};

const DAWN: Grade = {
  phase: 0,
  shade: [47, 73, 82, 0.2],
  ambient: [244, 205, 133, 0.08],
  key: [255, 211, 135, 0.29],
  darkness: 0,
};
const DAY_GRADES: readonly Grade[] = [
  DAWN,
  {
    phase: 10,
    shade: [52, 81, 85, 0.16],
    ambient: [248, 225, 161, 0.06],
    key: [255, 226, 149, 0.21],
    darkness: 0,
  },
  {
    phase: 30,
    shade: [48, 77, 85, 0.13],
    ambient: [235, 226, 163, 0.012],
    key: [251, 237, 184, 0.115],
    darkness: 0,
  },
  {
    phase: 46,
    shade: [44, 64, 82, 0.2],
    ambient: [232, 172, 114, 0.04],
    key: [255, 206, 127, 0.19],
    darkness: 0,
  },
  {
    phase: 55,
    shade: [45, 54, 78, 0.27],
    ambient: [200, 118, 77, 0.1],
    key: [255, 164, 96, 0.34],
    darkness: 0.15,
  },
  {
    phase: 61,
    shade: [30, 43, 66, 0.43],
    ambient: [64, 55, 77, 0.31],
    key: [137, 99, 98, 0.3],
    darkness: 0.65,
  },
  {
    phase: 71,
    shade: [17, 31, 52, 0.67],
    ambient: [25, 43, 66, 0.55],
    key: [89, 116, 155, 0.46],
    darkness: 1,
  },
  {
    phase: 83,
    shade: [23, 37, 54, 0.56],
    ambient: [37, 54, 71, 0.45],
    key: [102, 124, 153, 0.38],
    darkness: 0.85,
  },
  { ...DAWN, phase: 90 },
];

const lerp = (start: number, end: number, weight: number) => start + (end - start) * weight;
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
const rgba = ([r, g, b, a]: Pigment) =>
  `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;

function blend(a: Pigment, b: Pigment, t: number): Pigment {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
}

/** One smooth lighting palette in the same normalized day used by both calendars. */
export function getSceneLight(phase: number) {
  const right = DAY_GRADES.findIndex((point) => point.phase >= phase);
  const end = DAY_GRADES[right < 0 ? DAY_GRADES.length - 1 : right];
  const start = DAY_GRADES[Math.max(0, right < 0 ? DAY_GRADES.length - 2 : right - 1)];
  const weight =
    start.phase === end.phase ? 0 : smooth((phase - start.phase) / (end.phase - start.phase));
  const darkness = lerp(start.darkness, end.darkness, weight);
  const angle = phase <= 60 ? Math.PI * (phase / 60 - 1) : Math.PI * ((phase - 60) / 30);
  return {
    shade: blend(start.shade, end.shade, weight),
    ambient: blend(start.ambient, end.ambient, weight),
    key: blend(start.key, end.key, weight),
    fog: blend([189, 182, 154, 1], [93, 105, 118, 1], darkness),
    darkness,
    angle,
  };
}

/** Ground light follows the simulation clock, including the slower opening year. */
export function getGroundLight(state: GameState) {
  const phase = getCalendar(state).canonicalPhase;
  // Day occupies the first two thirds of every season, in both calendars.
  // Reset the sun behind a fully faded shadow so dawn never flips visibly.
  const progress = Math.min(1, phase / 60);
  const daylight = smooth(phase / 6) * smooth((60 - phase) / 6);
  return {
    opacity: daylight * (state.disasters.storm || state.disasters.blizzard ? 0.13 : 0.32),
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
    isWorldPointRevealed(state, point.x, point.y);
  const shadows: GroundShadow[] = [];
  for (const source of state.entities) {
    if (!visible(source)) continue;
    if (source.kind === 'ore' && source.amount <= 0) continue;
    if (source.kind === 'ore' && (state.words.O_07?.retention ?? 0) <= 0) continue;
    const size =
      source.kind === 'tree'
        ? source.amount > 0
          ? ([9, 4.2, 'canopy'] as const)
          : ([2.2, 1.1, 'low'] as const)
        : source.kind === 'stone' || source.kind === 'ore'
          ? ([4.4, 2.3, 'stone'] as const)
          : source.kind === 'berries' && source.amount > 0
            ? ([3.1, 1.5, 'low'] as const)
            : null;
    if (size)
      shadows.push({
        id: source.id,
        x: source.x,
        y: source.y,
        width: size[0],
        height: size[1],
        form: size[2],
      });
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
        ? ([9.2, 4, 'roof'] as const)
        : ['menhir', 'stele', 'foundry'].includes(building.kind)
          ? ([4.7, 2.4, 'stone'] as const)
          : null;
      if (size)
        shadows.push({
          id: building.id,
          x: building.x,
          y: building.y,
          width: size[0],
          height: size[1],
          form: size[2],
        });
    }
  return shadows;
}

// Small penumbras contain different forms. Their long axis points away from
// the source and their first petal touches the actual foot of the sprite.
const SHADOW_LOBES: Record<
  ShadowForm,
  readonly (readonly [number, number, number, number, number])[]
> = {
  canopy: [
    [16, 24, 23, 10, 0.55],
    [46, 25, 36, 9, 0.4],
    [68, 14, 27, 14, 0.62],
    [61, 30, 29, 16, 0.75],
    [77, 25, 18, 13, 0.73],
  ],
  roof: [
    [18, 24, 28, 18, 0.85],
    [44, 24, 31, 21, 0.84],
    [68, 24, 25, 13, 0.65],
  ],
  stone: [
    [19, 25, 25, 15, 0.65],
    [41, 22, 30, 17, 0.82],
    [66, 27, 25, 12, 0.57],
  ],
  low: [
    [17, 25, 23, 13, 0.65],
    [43, 18, 28, 14, 0.68],
    [57, 29, 35, 17, 0.65],
  ],
  person: [
    [13, 24, 18, 11, 0.55],
    [40, 24, 31, 9, 0.62],
    [63, 24, 25, 16, 0.8],
    [82, 24, 14, 9, 0.65],
  ],
};
const shadowMasks = new Map<ShadowForm, HTMLCanvasElement>();
function mask(form: ShadowForm) {
  const cached = shadowMasks.get(form);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 48;
  const ctx = canvas.getContext('2d')!;
  for (const [x, y, rx, ry, alpha] of SHADOW_LOBES[form]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    const brush = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    brush.addColorStop(0, `rgba(26,44,47,${alpha})`);
    brush.addColorStop(0.45, `rgba(26,44,47,${alpha * 0.78})`);
    brush.addColorStop(1, '#1a2c2f00');
    ctx.fillStyle = brush;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  shadowMasks.set(form, canvas);
  return canvas;
}

function stampShadow(
  ctx: CanvasRenderingContext2D,
  light: ReturnType<typeof getGroundLight>,
  x: number,
  y: number,
  width: number,
  height: number,
  form: ShadowForm,
) {
  const length = width * light.stretch;
  ctx.save();
  ctx.translate(x * 2.4, y * 1.6 + 0.5);
  ctx.rotate(light.angle);
  ctx.drawImage(mask(form), -length * 0.14, -height, length * 2, height * 2);
  ctx.restore();
}

/** Small cached masks, no blur/filter pass or additional full-world canvas. */
export function drawMapGroundShadows(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewport?: Viewport,
  light = getGroundLight(state),
) {
  if (light.opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha *= light.opacity;
  for (const shadow of getGroundShadows(state, viewport))
    stampShadow(ctx, light, shadow.x, shadow.y, shadow.width, shadow.height, shadow.form);
  ctx.restore();
}

export function drawMapPersonShadow(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  light: ReturnType<typeof getGroundLight>,
  size: number,
) {
  if (light.opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha *= light.opacity;
  stampShadow(ctx, light, point.x, point.y, 4.2 * size, 1.6 * size, 'person');
  ctx.restore();
}

export function drawMapSceneLight(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  phase: number,
  mapWidth: number,
  mapHeight: number,
  view?: Viewport,
) {
  const grade = getSceneLight(phase);
  const left = Math.max(0, (view?.minX ?? 0) * 2.4);
  const top = Math.max(0, (view?.minY ?? 0) * 1.6);
  const right = Math.min(mapWidth, view ? view.maxX * 2.4 : mapWidth);
  const bottom = Math.min(mapHeight, view ? view.maxY * 1.6 : mapHeight);
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return grade.fog;

  // A single painted grade sets the direction of light in the current framing.
  // It is drawn under the opaque exploration mask and the regional captions.
  const cx = left + width / 2;
  const cy = top + height / 2;
  const sx = Math.cos(grade.angle);
  const sy = Math.sin(grade.angle);
  const span = (Math.abs(sx) * width + Math.abs(sy) * height) / 2;
  const tint = ctx.createLinearGradient(
    cx + sx * span,
    cy + sy * span,
    cx - sx * span,
    cy - sy * span,
  );
  const overcast = state.disasters.storm || state.disasters.blizzard;
  tint.addColorStop(0, rgba(grade.shade));
  tint.addColorStop(0.48, rgba(grade.ambient));
  const key: Pigment = overcast ? blend(grade.key, grade.ambient, 0.65) : grade.key;
  tint.addColorStop(1, rgba(key));
  ctx.save();
  ctx.fillStyle = tint;
  ctx.fillRect(left, top, width, height);

  // The close bounce softens the night on the actual hearth and objects
  // immediately around it. The much wider gameplay heat circle is separate.
  if (!state.urbanized)
    for (const fire of state.buildings) {
      if (fire.kind !== 'campfire' || !fire.active || fire.hp <= 0 || fire.completed === false)
        continue;
      const x = fire.x * 2.4;
      const y = fire.y * 1.6;
      const radius = 32;
      if (
        x + radius < left ||
        x - radius > right ||
        y + radius < top ||
        y - radius > bottom ||
        !isWorldPointRevealed(state, fire.x, fire.y)
      )
        continue;
      const glow = 0.14 + grade.darkness * 0.8;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, 0.69);
      const bounce = ctx.createRadialGradient(0, -4, 0, 0, 1, radius);
      bounce.addColorStop(0, `rgba(255,219,145,${glow * 0.65})`);
      bounce.addColorStop(0.22, `rgba(247,176,80,${glow * 0.48})`);
      bounce.addColorStop(0.6, `rgba(204,120,61,${glow * 0.15})`);
      bounce.addColorStop(1, '#c2753c00');
      ctx.fillStyle = bounce;
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
      ctx.restore();
    }
  ctx.restore();
  return grade.fog;
}

export const fogPigment = (color: Pigment, alpha = 1) =>
  rgba([color[0], color[1], color[2], alpha]);
