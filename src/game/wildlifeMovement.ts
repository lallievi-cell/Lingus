import type { MapEntity } from './types';

/** The old idle pose is still the destination, not an instantaneous position.
 * Travel back from a flight or a fight therefore obeys the animal's real speed. */
export function wanderDestination(entity: MapEntity, time: number) {
  const suffix = Number(entity.id.split('-').at(-1));
  let phase = Number.isFinite(suffix) ? suffix : 0;
  if (!Number.isFinite(suffix))
    for (const character of entity.id) phase = (phase * 31 + character.charCodeAt(0)) >>> 0;
  phase += time * 0.05;
  return {
    x: Math.max(0, Math.min(500, (entity.originX ?? entity.x) + Math.sin(phase) * 2)),
    y: Math.max(0, Math.min(500, (entity.originY ?? entity.y) + Math.cos(phase) * 2)),
  };
}

/** Mutates position only; no RNG, resources, health or attack range changes. */
export function moveWildlifeToward(
  entity: MapEntity,
  destination: { x: number; y: number },
  maximumStep: number,
) {
  const dx = destination.x - entity.x,
    dy = destination.y - entity.y,
    distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || !Number.isFinite(maximumStep) || maximumStep <= 0) return;
  if (distance <= maximumStep) {
    entity.x = destination.x;
    entity.y = destination.y;
  } else {
    entity.x += (dx / distance) * maximumStep;
    entity.y += (dy / distance) * maximumStep;
  }
}
