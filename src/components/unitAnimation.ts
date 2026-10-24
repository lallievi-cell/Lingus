import type { BuildingKind, EntityKind, Unit } from '../game/types';
import type { VisibleUnitEquipment } from '../game/unitEquipment';

export type UnitAnimationKind =
  | 'idle'
  | 'walk'
  | 'run'
  | 'carry'
  | 'chop'
  | 'mine'
  | 'gather'
  | 'craft'
  | 'cook'
  | 'build'
  | 'thrust'
  | 'strike'
  | 'eat'
  | 'sleep'
  | 'sow'
  | 'forge'
  | 'write'
  | 'teach'
  | 'guard'
  | 'pray'
  | 'tame'
  | 'deposit';
type Point = { x: number; y: number };
export interface UnitAnimationContext {
  /** Actual motion observed between simulation samples, supplied by the scene. */
  moving?: boolean;
  facing?: -1 | 1;
  targetKind?: EntityKind | BuildingKind;
  target?: Point;
  ready?: boolean;
  equipment?: VisibleUnitEquipment;
  recentEvent?: 'deposit' | 'meal';
}
export interface UnitAnimationPose {
  kind: UnitAnimationKind;
  moving: boolean;
  facing: -1 | 1;
  phase: number;
  step: number;
  bob: number;
  bodyDrop: number;
  bodyLean: number;
  torsoAngle: number;
  leftArm: { elbow: Point; hand: Point };
  rightArm: { elbow: Point; hand: Point };
  /** Body-local grip after torso transformation and facing. Equipment shares it. */
  rightHand: Point;
  leftHand: Point;
  toolAngle: number;
  impact: number;
}

function phaseOf(id: string) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return ((hash >>> 0) % 997) / 997;
}

function workKind(unit: Unit, context: UnitAnimationContext): UnitAnimationKind {
  const action = unit.action,
    target = context.targetKind;
  if (action === 'sleeping') return 'sleep';
  if (action === 'eating') return 'eat';
  if (action === 'crafting') return 'craft';
  if (action === 'cooking') return 'cook';
  if (action === 'building') return 'build';
  if (['hunting', 'combat', 'frontline'].includes(action))
    return context.equipment?.held === 'spear' ? 'thrust' : 'strike';
  if (action === 'gathering') {
    if (target === 'tree' || (!target && unit.command?.includes('O_03'))) return 'chop';
    if (target === 'stone' || target === 'ore' || (!target && unit.command?.includes('O_02')))
      return 'mine';
    return 'gather';
  }
  if (action === 'planting' || action === 'farming' || (action === 'working' && target === 'farm'))
    return 'sow';
  if (action === 'domesticating' || (action === 'working' && target === 'pen')) return 'tame';
  if (action === 'guarding' || (action === 'working' && target === 'campfire')) return 'guard';
  if (action === 'smelting' || (action === 'working' && target === 'foundry')) return 'forge';
  if (['copying', 'researching'].includes(action) || (action === 'working' && target === 'archive'))
    return 'write';
  if (action === 'working' && target === 'school') return 'teach';
  if (action === 'working' && ['temple', 'menhir'].includes(target ?? '')) return 'pray';
  if (action === 'working') return 'build';
  return 'idle';
}

/** Pure presentation: phase, grip and pose never change the unit or simulation RNG. */
export function getUnitAnimation(
  unit: Unit,
  time: number,
  context: UnitAnimationContext = {},
): UnitAnimationPose {
  const target =
    context.target ??
    (unit.tx !== undefined && unit.ty !== undefined ? { x: unit.tx, y: unit.ty } : undefined);
  const distance = target ? Math.hypot(target.x - unit.x, target.y - unit.y) : 0;
  // The fallback is only for isolated renderer fixtures. The scene supplies real
  // observed motion, including idle wandering and arrival inside a work radius.
  const moving =
    unit.action !== 'sleeping' &&
    unit.age >= 1 &&
    (context.moving ?? (distance > 2 && unit.action !== 'idle'));
  const facing =
    context.facing ??
    (target && Math.abs(target.x - unit.x) > 0.15
      ? target.x > unit.x
        ? 1
        : -1
      : phaseOf(unit.id) < 0.5
        ? 1
        : -1);
  let kind = moving
    ? unit.action === 'fleeing'
      ? 'run'
      : unit.carry && unit.carry.amount > 0
        ? 'carry'
        : 'walk'
    : workKind(unit, context);
  if (!moving && context.ready === false && kind !== 'sleep') kind = 'idle';
  // The scene supplies this only after a real delivery/meal, for a short time.
  // A new active task or a moving unit always has priority over the gesture.
  if (
    !moving &&
    kind === 'idle' &&
    context.recentEvent &&
    ['idle', 'returning', 'gathering', 'moving', 'eating', 'resting'].includes(unit.action)
  )
    kind = context.recentEvent === 'deposit' ? 'deposit' : 'eat';
  if (unit.age < 1 && kind !== 'sleep') kind = 'idle';
  const offset = phaseOf(unit.id);
  const cadence =
    kind === 'run' ? 10.5 : moving ? 8.3 : ['craft', 'write', 'cook'].includes(kind) ? 6 : 4.6;
  const phase = time * cadence + offset * Math.PI * 2;
  const wave = Math.sin(phase),
    lift = (1 - Math.cos(phase)) / 2;
  const step = moving ? wave : 0;
  const elder = unit.age >= 14;
  const pose: UnitAnimationPose = {
    kind,
    moving,
    facing,
    phase,
    step,
    bob: moving ? Math.abs(step) * 0.35 : 0,
    bodyDrop: 0,
    bodyLean: 0,
    torsoAngle: 0,
    leftArm: {
      elbow: { x: -6.4, y: -14.3 - step },
      hand: { x: -6.4 - step * 0.45, y: -10.5 + step * 1.3 },
    },
    rightArm: { elbow: { x: 6.3, y: -15 }, hand: { x: 7, y: -10.7 - step * 1.3 } },
    rightHand: { x: 7, y: -10.7 },
    leftHand: { x: -6.4, y: -10.5 },
    toolAngle: -0.18,
    impact: 0,
  };
  if (kind === 'run') pose.torsoAngle = 0.12;
  if (kind === 'carry' || (!moving && unit.carry && unit.carry.amount > 0)) {
    pose.leftArm = { elbow: { x: -5.5, y: -14 }, hand: { x: -1.5, y: -13.5 } };
    pose.rightArm = { elbow: { x: 6.8, y: -14.6 }, hand: { x: 4.5, y: -13.5 } };
    pose.bodyLean = -0.35;
  }
  if (kind === 'chop' || kind === 'mine' || kind === 'build' || kind === 'forge') {
    // Slow lift, fast delivery and a short follow-through are legible as a strike.
    const cycle = (time * (kind === 'forge' ? 1.35 : 0.95) + offset) % 1;
    const strike = cycle < 0.58 ? cycle / 0.58 : cycle < 0.76 ? 1 - (cycle - 0.58) / 0.18 : 0;
    const low = kind === 'mine' || kind === 'build';
    pose.bodyDrop = low ? 2.5 : 0.5;
    pose.torsoAngle = (low ? 0.15 : 0.06) + (1 - strike) * 0.12;
    pose.rightArm = {
      elbow: { x: 7.5 - strike * 3, y: -16 - strike * 5 },
      hand: { x: 9 - strike * 7, y: -10 - strike * 15 },
    };
    pose.leftArm = {
      elbow: { x: -3 + strike * 4, y: -13.5 - strike * 5 },
      hand: { x: 5 - strike * 5, y: -10.5 - strike * 13 },
    };
    pose.toolAngle = -0.6 + (1 - strike) * 1.55;
    pose.impact = cycle >= 0.74 && cycle < 0.9 ? (0.9 - cycle) / 0.16 : 0;
  } else if (['gather', 'sow', 'tame', 'deposit'].includes(kind)) {
    pose.bodyDrop = kind === 'tame' ? 2 : 4.2;
    pose.torsoAngle = kind === 'tame' ? 0.1 : 0.24 + lift * 0.06;
    pose.rightArm = { elbow: { x: 6.8, y: -9 }, hand: { x: 9 + wave * 1.8, y: -3 - lift * 4 } };
    pose.leftArm = { elbow: { x: -4.5, y: -12 }, hand: { x: -1.3, y: -9 } };
    if (kind === 'deposit') {
      pose.rightArm.hand = { x: 7 + lift, y: -4 + lift };
      pose.leftArm = { elbow: { x: -3.7, y: -9 }, hand: { x: 3 + lift, y: -4.5 + lift } };
    }
  } else if (kind === 'craft') {
    pose.bodyDrop = 3.4;
    pose.torsoAngle = 0.15;
    pose.leftArm = { elbow: { x: -4.8, y: -12 }, hand: { x: 0, y: -10.2 } };
    pose.rightArm = {
      elbow: { x: 5.3, y: -14 },
      hand: { x: 3.8 + wave * 0.5, y: -12 - lift * 4.6 },
    };
    pose.toolAngle = -0.5 + wave * 0.2;
    pose.impact = lift < 0.14 ? 1 - lift / 0.14 : 0;
  } else if (kind === 'thrust') {
    const reach = Math.max(0, Math.sin(phase));
    pose.bodyLean = reach * 1.3;
    pose.torsoAngle = reach * 0.09;
    pose.rightArm = {
      elbow: { x: 5 + reach * 4.5, y: -17 },
      hand: { x: 7 + reach * 9, y: -16 + reach },
    };
    pose.leftArm = { elbow: { x: -1 + reach * 4, y: -15 }, hand: { x: 3 + reach * 6, y: -16.5 } };
    pose.toolAngle = Math.PI / 2 - 0.08;
  } else if (kind === 'strike') {
    const reach = Math.max(0, wave);
    pose.torsoAngle = reach * 0.1;
    pose.rightArm = {
      elbow: { x: 6 + reach * 3, y: -17 - lift * 2 },
      hand: { x: 7 + reach * 6, y: -12 - lift * 10 },
    };
    pose.leftArm = { elbow: { x: -3, y: -16 }, hand: { x: 0, y: -18 } };
    pose.toolAngle = -0.7 + reach * 1.9;
  } else if (kind === 'eat') {
    pose.rightArm = { elbow: { x: 6, y: -17 }, hand: { x: 4.4 - lift * 2, y: -14 - lift * 10 } };
    pose.leftArm = { elbow: { x: -5, y: -13 }, hand: { x: -0.5, y: -12 } };
    pose.torsoAngle = 0.02;
  } else if (kind === 'cook' || kind === 'guard') {
    pose.bodyDrop = kind === 'cook' ? 2 : 0;
    pose.rightArm = { elbow: { x: 6.5, y: -14 }, hand: { x: 8 + wave, y: -10 - lift * 3 } };
    pose.leftArm = { elbow: { x: -4.7, y: -13 }, hand: { x: 0, y: -12 } };
    pose.torsoAngle = kind === 'cook' ? 0.1 : 0;
  } else if (kind === 'write') {
    pose.bodyDrop = 2;
    pose.torsoAngle = 0.11;
    pose.rightArm = {
      elbow: { x: 4.4, y: -13 },
      hand: { x: 4 + wave * 1.4, y: -10 + Math.cos(phase * 0.6) * 0.7 },
    };
    pose.leftArm = { elbow: { x: -4.5, y: -13 }, hand: { x: -0.5, y: -9.8 } };
  } else if (kind === 'teach' || kind === 'pray') {
    const rise = kind === 'pray' ? 3 : lift * 7;
    pose.rightArm = { elbow: { x: 6, y: -18 - rise * 0.4 }, hand: { x: 8, y: -17 - rise } };
    pose.leftArm = {
      elbow: { x: -5.5, y: -16 },
      hand: { x: -2.5, y: kind === 'pray' ? -20 : -15 },
    };
  }
  if (elder && kind === 'idle') pose.bodyLean = 0.25;
  const transformed = (point: Point): Point => {
    const px = point.x + pose.bodyLean,
      py = point.y + 9 + pose.bodyDrop;
    return {
      x: (Math.cos(pose.torsoAngle) * px - Math.sin(pose.torsoAngle) * py) * facing,
      y: Math.sin(pose.torsoAngle) * px + Math.cos(pose.torsoAngle) * py - 9,
    };
  };
  pose.rightHand = transformed(pose.rightArm.hand);
  pose.leftHand = transformed(pose.leftArm.hand);
  return pose;
}

export function isWalkingPose(unit: Unit) {
  return getUnitAnimation(unit, 0).moving;
}
