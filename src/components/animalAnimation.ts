import type { MapEntity, Unit } from '../game/types';

export interface AnimalAnimationContext {
  units: readonly Unit[];
  simulationTime: number;
  /** One identity per mounted world prevents an old animal lending its pose to a new game. */
  sessionKey?: object | string;
}

type Motion = {
  x: number;
  y: number;
  originX?: number;
  originY?: number;
  time: number;
  lastMovedAt: number;
  movingUntil: number;
  facing: number;
  travelled: number;
  speed: number;
  hp: number;
  hurtAt: number;
};

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const idPhase = (id: string) => {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return ((hash >>> 0) / 4294967296) * Math.PI * 2;
};

/** Observes the simulation without giving an animal a new FSM or changing its position. */
export function createAnimalAnimationObserver() {
  const sessions = new Map<object | string, Map<string, Motion>>();
  return (entity: MapEntity, time: number, context?: AnimalAnimationContext) => {
    const key = context?.sessionKey ?? 'default';
    let motion = sessions.get(key);
    if (!motion) {
      motion = new Map();
      if (sessions.size >= 8) sessions.delete(sessions.keys().next().value!);
      sessions.set(key, motion);
    }
    let value = motion.get(entity.id);
    const phase = idPhase(entity.id);
    if (
      !value ||
      time < value.time ||
      value.originX !== entity.originX ||
      value.originY !== entity.originY
    ) {
      value = {
        x: entity.x,
        y: entity.y,
        originX: entity.originX,
        originY: entity.originY,
        time,
        lastMovedAt: time,
        movingUntil: -Infinity,
        facing: phase > Math.PI ? -1 : 1,
        travelled: 0,
        speed: 0,
        hp: entity.hp,
        hurtAt: -Infinity,
      };
    }
    const elapsed = time - value.time;
    const travelled = distance(value, entity);
    if (travelled > 0.0001) {
      if (Math.abs(entity.x - value.x) > 0.0001) value.facing = entity.x < value.x ? -1 : 1;
      value.travelled += Math.min(travelled, 2);
      if (elapsed > 0) value.speed = clamp(travelled / Math.max(elapsed, 0.016), 0, 8);
      value.lastMovedAt = time;
      value.movingUntil = time + 0.2;
    }
    if (entity.hp < value.hp && entity.hp > 0) value.hurtAt = time;
    const dead = entity.hp <= 0;
    const units = context?.units.filter((unit) => unit.hp > 0) ?? [];
    let closest: Unit | undefined;
    let nearest = Infinity;
    for (const unit of units) {
      const d = distance(unit, entity);
      if (d < nearest) {
        nearest = d;
        closest = unit;
      }
    }
    const simTime = context?.simulationTime ?? time;
    // attacked is a durable command flag, not evidence that a bite happened.
    // Include a just-killed victim for the final real bite; it is not a new target.
    const victim = (context?.units ?? units).find((unit) => {
      const wound = unit.lastCombatSource;
      return (
        wound?.id === entity.id &&
        wound.kind === entity.kind &&
        simTime >= wound.time &&
        simTime - wound.time <= 0.4 &&
        distance(unit, entity) <= 4
      );
    });
    const moving = !dead && time < value.movingUntil;
    const fleeing =
      moving && !entity.domesticated && entity.kind === 'deer' && !entity.attacked && nearest <= 15;
    const attacking = !dead && !!victim;
    if (attacking && victim && Math.abs(victim.x - entity.x) > 0.05)
      value.facing = victim.x < entity.x ? -1 : 1;
    else if (!moving && closest && nearest < 12 && Math.abs(closest.x - entity.x) > 0.1)
      value.facing = closest.x < entity.x ? -1 : 1;
    const gaitPhase =
      phase +
      (value.travelled +
        (moving ? value.speed * Math.min(0.1, Math.max(0, time - value.lastMovedAt)) : 0)) *
        (entity.kind === 'mammoth' ? 1.6 : fleeing ? 2.8 : value.speed > 2.2 ? 3 : 4.4);
    const hurtProgress = clamp((time - value.hurtAt) / 0.35, 0, 1);
    const hurt = dead || hurtProgress >= 1 ? 0 : Math.sin(hurtProgress * Math.PI);
    const attack = attacking ? Math.max(0, Math.sin(time * 10 + phase)) : 0;
    Object.assign(value, { x: entity.x, y: entity.y, hp: entity.hp, time });
    motion.delete(entity.id);
    if (motion.size >= 1024) motion.delete(motion.keys().next().value!);
    motion.set(entity.id, value);
    return {
      dead,
      moving,
      running: moving && value.speed > 2.2,
      fleeing,
      attacking,
      attack,
      hurt,
      facing: value.facing,
      gait: moving ? Math.sin(gaitPhase) : 0,
      speed: moving ? value.speed : 0,
      alert: !dead && !entity.domesticated && nearest < 20,
      phase,
    };
  };
}

export const observeAnimalAnimation = createAnimalAnimationObserver();
