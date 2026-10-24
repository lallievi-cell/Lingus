import type { Unit } from '../game/types';

type Point = { x: number; y: number };
type Facing = -1 | 1;
export type MotionActor = Pick<Unit, 'id' | 'x' | 'y' | 'hp'> &
  Partial<Pick<Unit, 'tx' | 'ty' | 'action'>>;
type Sample = {
  previous: Point;
  current: Point;
  display: Point;
  time: number;
  interval: number;
  facing: Facing;
  speed: number;
};

export interface MapMotionSession {
  units: Map<string, Sample>;
  simulationTime: number;
}

export interface UnitMotion {
  moving: boolean;
  facing: Facing;
  speed: number;
  displayX: number;
  displayY: number;
}

/** Presentation history belongs to one map instance, never to a saved Unit. */
export function createMapMotionSession(): MapMotionSession {
  return { units: new Map(), simulationTime: -Infinity };
}

function initialFacing(unit: MotionActor): Facing {
  if (unit.tx !== undefined && Math.abs(unit.tx - unit.x) > 0.05) return unit.tx < unit.x ? -1 : 1;
  return Array.from(unit.id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 2 ? -1 : 1;
}

/**
 * Tween between real simulation samples. A stationary task name does not invent
 * movement, and an idle unit which really wanders still walks. The tween is at
 * most one observed sample behind the authoritative position.
 */
export function observeUnitMotion(
  session: MapMotionSession,
  unit: MotionActor,
  simulationTime: number,
  renderTime: number,
  paused = false,
): UnitMotion {
  if (simulationTime < session.simulationTime) session.units.clear();
  session.simulationTime = simulationTime;
  let sample = session.units.get(unit.id);
  if (!sample) {
    sample = {
      previous: { x: unit.x, y: unit.y },
      current: { x: unit.x, y: unit.y },
      display: { x: unit.x, y: unit.y },
      time: simulationTime,
      interval: 0.25,
      facing: initialFacing(unit),
      speed: 0,
    };
    if (session.units.size >= 2048) session.units.delete(session.units.keys().next().value!);
    session.units.set(unit.id, sample);
  }
  const dx = unit.x - sample.current.x,
    dy = unit.y - sample.current.y,
    elapsed = simulationTime - sample.time;
  if (elapsed > 0 || dx !== 0 || dy !== 0) {
    const distance = Math.hypot(dx, dy);
    // Imports, deliberate repositioning and long suspended tabs are snapshots,
    // not a walk across the entire map.
    const reset = elapsed <= 0 || elapsed > 4 || distance > Math.max(12, elapsed * 16);
    sample.previous = reset ? { x: unit.x, y: unit.y } : sample.current;
    sample.current = { x: unit.x, y: unit.y };
    sample.interval = Math.max(0.05, Math.min(1, elapsed || 0.25));
    sample.time = simulationTime;
    sample.speed = reset ? 0 : distance / elapsed;
    if (!reset && Math.abs(dx) > 0.001) sample.facing = dx < 0 ? -1 : 1;
  }
  if (paused) {
    sample.previous = sample.current;
    sample.display = { x: unit.x, y: unit.y };
    sample.speed = 0;
  } else {
    const fraction = Math.max(0, Math.min(1, (renderTime - sample.time) / sample.interval));
    sample.display = {
      x: sample.previous.x + (sample.current.x - sample.previous.x) * fraction,
      y: sample.previous.y + (sample.current.y - sample.previous.y) * fraction,
    };
  }
  const remaining = Math.hypot(
    sample.current.x - sample.display.x,
    sample.current.y - sample.display.y,
  );
  const moving = !paused && unit.hp > 0 && unit.action !== 'sleeping' && remaining > 0.002;
  return {
    moving,
    facing: sample.facing,
    speed: moving ? sample.speed : 0,
    displayX: sample.display.x,
    displayY: sample.display.y,
  };
}

/** Hit testing follows the drawn position while preserving the real target coordinates. */
export function readUnitDisplay(session: MapMotionSession, id: string): Point | undefined {
  const point = session.units.get(id)?.display;
  return point ? { ...point } : undefined;
}

export interface AnimationClock {
  simulationTime: number;
  timestamp: number;
  value: number;
  paused: boolean;
}

export function createAnimationClock(): AnimationClock {
  return { simulationTime: -Infinity, timestamp: 0, value: -Infinity, paused: false };
}

/** Continuous phase between the app's 250ms samples; pausing freezes the exact snapshot. */
export function continuousAnimationTime(
  clock: AnimationClock,
  simulationTime: number,
  timestampMs: number,
  paused: boolean,
  speed = 1,
): number {
  if (
    !Number.isFinite(clock.simulationTime) ||
    simulationTime !== clock.simulationTime ||
    paused !== clock.paused ||
    timestampMs < clock.timestamp
  ) {
    if (simulationTime < clock.simulationTime || paused) clock.value = simulationTime;
    clock.simulationTime = simulationTime;
    clock.timestamp = timestampMs;
    clock.paused = paused;
  }
  if (paused) return (clock.value = simulationTime);
  const elapsed = Math.max(0, Math.min(0.25, (timestampMs - clock.timestamp) / 1000));
  const next = simulationTime + elapsed * speed;
  clock.value = Math.max(simulationTime, clock.value, next);
  return clock.value;
}
