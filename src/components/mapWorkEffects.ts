import { ADULT_AGE, ELDER_AGE } from '../game/content';
import type { MapEntity, Unit } from '../game/types';
import type { UnitAnimationPose } from './unitAnimation';

export interface MapWorkEffectContext {
  /** Observed displacement, never inferred from the command or destination. */
  moving: boolean;
  ready: boolean;
  source?: Pick<MapEntity, 'id' | 'kind' | 'amount'>;
  sourceVisible?: boolean;
  resourceKnown?: boolean;
  reducedMotion?: boolean;
}

export interface MapWorkEffect {
  kind: 'chip' | 'foot';
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  angle: number;
  opacity: number;
  color: string;
}

const fraction = (value: number) => ((value % 1) + 1) % 1;

/**
 * Short, body-local accents sampled from the existing animation clock. They do
 * not represent produced resources and leave no persistent marks or particles.
 */
export function getMapWorkEffects(
  unit: Unit,
  pose: UnitAnimationPose,
  context: MapWorkEffectContext,
): MapWorkEffect[] {
  if (context.reducedMotion || unit.hp <= 0 || unit.age < 1) return [];
  const effects: MapWorkEffect[] = [];
  if (context.moving && pose.moving && ['walk', 'run', 'carry'].includes(pose.kind)) {
    const cycle = fraction(pose.phase / (Math.PI * 2));
    for (let foot = 0; foot < 2; foot++) {
      const age = fraction(cycle - foot * 0.5) / 0.19;
      if (age >= 1) continue;
      effects.push({
        kind: 'foot',
        x: (foot === 0 ? -2 : 3.1) * pose.facing - pose.facing * age * 2,
        y: foot === 0 ? 0.5 : 1.2,
        radiusX: 2.1 + age * (pose.kind === 'run' ? 2.6 : 1.7),
        radiusY: 0.65 + age * 0.5,
        angle: -0.08 * pose.facing,
        opacity: (1 - age) * (pose.kind === 'run' ? 0.24 : 0.16),
        color: '#dbcda4',
      });
    }
    return effects;
  }

  const source = context.source;
  if (
    context.moving ||
    pose.moving ||
    !context.ready ||
    !context.sourceVisible ||
    unit.age < ADULT_AGE ||
    unit.action !== 'gathering' ||
    !source ||
    source.id !== unit.targetId ||
    source.amount <= 0 ||
    pose.impact <= 0 ||
    !(
      (pose.kind === 'chop' && source.kind === 'tree') ||
      (pose.kind === 'mine' && ['stone', 'ore'].includes(source.kind))
    )
  )
    return effects;

  const age = 1 - Math.min(1, pose.impact);
  const colors = !context.resourceKnown
    ? ['#969b89', '#bdc0ad']
    : source.kind === 'tree'
      ? ['#b78a53', '#e0c391']
      : source.kind === 'ore'
        ? ['#947c61', '#c0b295']
        : ['#858e85', '#c2c9b7'];
  for (let chip = 0; chip < 3; chip++) {
    effects.push({
      kind: 'chip',
      x: pose.facing * (12 + age * (5.5 + chip * 2.8)),
      y: (pose.kind === 'chop' ? -7 : -2) - Math.sin(age * Math.PI) * (3 + chip * 1.8) + age * 3,
      radiusX: chip === 1 ? 1.5 : 1,
      radiusY: source.kind === 'tree' && context.resourceKnown ? 0.45 : 0.7,
      angle: pose.facing * (chip * 0.9 + age * 2.5),
      opacity: Math.min(0.85, (1 - age) * 1.3),
      color: colors[chip % colors.length],
    });
  }
  return effects;
}

/** Call in the unit's sprite transform, before drawing its body. */
export function drawMapWorkEffects(
  ctx: CanvasRenderingContext2D,
  origin: { x: number; y: number },
  unit: Unit,
  pose: UnitAnimationPose,
  context: MapWorkEffectContext,
) {
  const effects = getMapWorkEffects(unit, pose, context);
  if (!effects.length) return;
  ctx.save();
  ctx.translate(origin.x, origin.y);
  const bodyScale = unit.age < ADULT_AGE ? 0.7 : unit.age >= ELDER_AGE ? 0.94 : 1;
  ctx.scale(bodyScale, bodyScale);
  const alpha = ctx.globalAlpha;
  for (const effect of effects) {
    ctx.globalAlpha = alpha * effect.opacity;
    ctx.fillStyle = effect.color;
    ctx.beginPath();
    ctx.ellipse(effect.x, effect.y, effect.radiusX, effect.radiusY, effect.angle, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
