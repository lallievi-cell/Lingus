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
  | 'fish'
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
  /** The scene depicts the carried object with a wide silhouette. */
  wideCarry?: boolean;
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

const strikeRhythm = {
  chop: { rate: 0.82, raisedAt: 0.55, contactAt: 0.73, recoverAt: 0.97 },
  mine: { rate: 1.08, raisedAt: 0.4, contactAt: 0.59, recoverAt: 0.83 },
  build: { rate: 1.18, raisedAt: 0.36, contactAt: 0.51, recoverAt: 0.75 },
  forge: { rate: 1.35, raisedAt: 0.47, contactAt: 0.64, recoverAt: 0.89 },
};

function ease(at: number) {
  return at * at * (3 - 2 * at);
}

function swing(
  pose: UnitAnimationPose,
  kind: keyof typeof strikeRhythm,
  time: number,
  offset: number,
) {
  const { rate, raisedAt, contactAt, recoverAt } = strikeRhythm[kind];
  const beat = time * rate + offset;
  const cycle = beat - Math.floor(beat);
  const descending = cycle >= raisedAt && cycle < contactAt;
  const returning = cycle >= contactAt && cycle < recoverAt;
  const downstroke = descending ? ease((cycle - raisedAt) / (contactAt - raisedAt)) : 0;
  const recovery = returning ? 1 - ease((cycle - contactAt) / (recoverAt - contactAt)) : 0;
  const lift = cycle < raisedAt ? ease(cycle / raisedAt) : descending ? 1 - downstroke : 0;
  const followThrough = downstroke + recovery;

  if (kind === 'chop') {
    // Wind up over the shoulder, then sweep across the body toward the trunk.
    pose.bodyDrop = 0.6 + followThrough * 1.15;
    pose.torsoAngle = 0.05 - lift * 0.1 + followThrough * 0.17;
    pose.leftArm = {
      elbow: { x: -4.1 + lift * 4.1, y: -13.7 - lift * 4.5 },
      hand: { x: 3.8 - lift * 3.9 + followThrough * 1.8, y: -12 - lift * 8.7 },
    };
    pose.rightArm = {
      elbow: { x: 6.9 - lift * 2.3, y: -15.6 - lift * 4.7 },
      hand: { x: 6.9 - lift * 5 + followThrough * 2, y: -11.9 - lift * 12 },
    };
    pose.toolAngle = 0.28 - lift * 1.4 + followThrough * 0.75;
  } else if (kind === 'mine') {
    // The rock is low. Knees flex into a steep stroke while both hands guide it.
    pose.bodyDrop = 1.6 + followThrough * 2.2;
    pose.torsoAngle = 0.12 + followThrough * 0.15;
    pose.leftArm = {
      elbow: { x: -3.3 + lift * 5, y: -12.4 - lift * 4.8 },
      hand: { x: 3.1 + followThrough * 0.9, y: -9.1 - lift * 11.1 + followThrough * 2.7 },
    };
    pose.rightArm = {
      elbow: { x: 6.2 - lift * 1.2, y: -12.5 - lift * 7 },
      hand: { x: 7.5 - lift * 2.8, y: -8.8 - lift * 14.6 + followThrough * 4 },
    };
    pose.toolAngle = -0.15 - lift * 0.9 + followThrough * 1.05;
  } else {
    // Small, controlled strokes. The free hand steadies the piece or assembly.
    const forge = kind === 'forge';
    pose.bodyDrop = (forge ? 1.4 : 2.25) + followThrough * 0.65;
    pose.torsoAngle = 0.12 + followThrough * 0.08;
    pose.leftArm = {
      elbow: { x: -4.8, y: -12.4 },
      hand: { x: forge ? 1.9 : 0.9, y: forge ? -9.2 : -8.1 },
    };
    pose.rightArm = {
      elbow: { x: 6.2 + lift * 0.8, y: -13.2 - lift * 2.1 },
      hand: { x: 5.8 + followThrough * 1.2, y: -9.6 - lift * (forge ? 8.2 : 5.8) },
    };
    pose.toolAngle = -0.15 - lift * 0.95 + followThrough * 0.68;
  }
  if (returning) pose.impact = Math.max(0, 1 - (cycle - contactAt) / 0.14);
}

function workKind(unit: Unit, context: UnitAnimationContext): UnitAnimationKind {
  const action = unit.action,
    target = context.targetKind;
  if (action === 'sleeping') return 'sleep';
  if (action === 'eating') return 'eat';
  if (action === 'crafting') return 'craft';
  if (action === 'cooking') return 'cook';
  if (action === 'building' || action === 'boatbuilding') return 'build';
  if (action === 'loadingBoat' || action === 'unloadingBoat') return 'deposit';
  if (['hunting', 'combat', 'frontline'].includes(action))
    return context.equipment?.held === 'spear' ? 'thrust' : 'strike';
  if (action === 'gathering') {
    if (target === 'fishery') return 'fish';
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
  const hasLoad = (unit.carry?.amount ?? 0) > 0;
  let kind = moving
    ? unit.action === 'fleeing'
      ? 'run'
      : hasLoad
        ? 'carry'
        : 'walk'
    : workKind(unit, context);
  if (kind === 'fish' && (unit.progress <= 0 || distance > 3)) kind = 'idle';
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
  const wideCarry = context.wideCarry === true;
  const cadence =
    kind === 'run'
      ? 10.5
      : kind === 'carry'
        ? wideCarry
          ? 6.35
          : 6.85
        : moving
          ? 8.3
          : ['craft', 'write', 'cook'].includes(kind)
            ? 6
            : 4.6;
  const phase = time * cadence + offset * Math.PI * 2;
  const wave = Math.sin(phase),
    lift = (1 - Math.cos(phase)) / 2;
  const step = moving ? wave * (kind === 'carry' ? (wideCarry ? 0.67 : 0.76) : 1) : 0;
  const elder = unit.age >= 14;
  const pose: UnitAnimationPose = {
    kind,
    moving,
    facing,
    phase,
    step,
    bob: moving ? Math.abs(step) * (kind === 'carry' ? 0.24 : 0.35) : 0,
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
  if (unit.age >= 1 && hasLoad && (kind === 'carry' || kind === 'run' || kind === 'idle')) {
    // Keep the two grips braced around a real load, even when the carrier pauses.
    const balance = step * 0.55;
    const separation = wideCarry ? 5.2 : 2.85;
    pose.leftArm = {
      elbow: { x: -5.4, y: wideCarry ? -13.4 : -14.1 },
      hand: { x: 1.45 - separation + balance, y: -12.85 + balance },
    };
    pose.rightArm = {
      elbow: { x: 6.7, y: wideCarry ? -13.2 : -14.6 },
      hand: { x: 1.45 + separation + balance, y: -13.15 - balance },
    };
    pose.bodyDrop = wideCarry ? 1.05 : 0.65;
    pose.bodyLean = -0.5 + balance * 0.4;
    pose.torsoAngle += 0.08 + balance * 0.06;
  }
  if (kind === 'chop' || kind === 'mine' || kind === 'build' || kind === 'forge') {
    swing(pose, kind, time, offset);
  } else if (['gather', 'sow', 'tame', 'deposit'].includes(kind)) {
    pose.bodyDrop = kind === 'tame' ? 2 : 4.2;
    pose.torsoAngle = kind === 'tame' ? 0.1 : 0.24 + lift * 0.06;
    pose.rightArm = { elbow: { x: 6.8, y: -9 }, hand: { x: 9 + wave * 1.8, y: -3 - lift * 4 } };
    pose.leftArm = { elbow: { x: -4.5, y: -12 }, hand: { x: -1.3, y: -9 } };
    if (kind === 'deposit') {
      pose.rightArm.hand = { x: 7 + lift, y: -4 + lift };
      pose.leftArm = { elbow: { x: -3.7, y: -9 }, hand: { x: 3 + lift, y: -4.5 + lift } };
    }
  } else if (kind === 'fish') {
    const haul = (1 + Math.sin(phase * 0.42)) / 2;
    pose.bodyDrop = 1.1;
    pose.torsoAngle = 0.1 + (1 - haul) * 0.09;
    pose.rightArm = {
      elbow: { x: 7 + (1 - haul) * 1.8, y: -15 },
      hand: { x: 9 + (1 - haul) * 5, y: -11 - haul * 3 },
    };
    pose.leftArm = {
      elbow: { x: -3.8, y: -13.5 },
      hand: { x: 1.8 + haul * 2, y: -12 - haul * 1.5 },
    };
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
  if (elder && kind === 'idle' && !hasLoad) pose.bodyLean = 0.25;
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
