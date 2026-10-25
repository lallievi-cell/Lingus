import type { Battalion, GameState } from '../game/types';

export const CITY_FOUNDRY_CHIMNEY = { x: 23.6, y: -33.6 } as const;

/** The close combat range remains physical. Strategic symbols need room around a city. */
export function getBattalionDisplayPoint(state: GameState, battalion: Battalion) {
  if (state.tier < 4 || !state.urbanized || battalion.hp <= 0)
    return { x: battalion.x, y: battalion.y };
  const city = state.cities.find(
    (candidate) =>
      candidate.id === battalion.targetId &&
      candidate.factionId !== battalion.factionId &&
      candidate.factionId !== 'ruins',
  );
  if (
    !city ||
    !['conquering', 'attacking'].includes(battalion.action) ||
    Math.hypot(battalion.x - city.x, battalion.y - city.y) > 3
  )
    return { x: battalion.x, y: battalion.y };
  const armies = state.battalions
    .filter(
      (army) =>
        army.hp > 0 &&
        army.targetId === city.id &&
        army.factionId !== city.factionId &&
        ['conquering', 'attacking'].includes(army.action) &&
        Math.hypot(army.x - city.x, army.y - city.y) <= 3,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const index = Math.max(
    0,
    armies.findIndex((army) => army.id === battalion.id),
  );
  const first = armies[0] ?? battalion;
  const origin = state.cities.find((candidate) => candidate.id === first.cityId);
  let dx = (origin?.x ?? first.x) - city.x;
  let dy = (origin?.y ?? first.y) - city.y;
  if (Math.hypot(dx, dy) < 0.01) {
    dx = -1;
    dy = 0.6;
  }
  const angle = Math.atan2(dy * 1.6, dx * 2.4);
  // This is a cartographic offset in map pixels, not a new movement destination.
  // Reserve alternatives in roster order, so avoiding the footer or a map edge
  // cannot place two formations on the same fallback point.
  const reserved: { x: number; y: number }[] = [];
  for (let slot = 0; slot <= index; slot++) {
    let point: { x: number; y: number } | undefined;
    for (let ring = 0; ring < 4 && !point; ring++) {
      const radius = 70 + ring * 40;
      for (let step = 0; step < 16; step++) {
        const candidateAngle = angle + (slot * Math.PI) / 4 + (step * Math.PI) / 8;
        const x = city.x + (Math.cos(candidateAngle) * radius) / 2.4;
        const y = city.y + (Math.sin(candidateAngle) * radius) / 1.6;
        if ((y - city.y) * 1.6 > 30 && Math.abs((x - city.x) * 2.4) < 50) continue;
        if (x < 12 || x > 488 || y < 20 || y > 480) continue;
        if (reserved.some((other) => Math.hypot((x - other.x) * 2.4, (y - other.y) * 1.6) < 40))
          continue;
        point = { x, y };
        break;
      }
    }
    if (!point) return { x: battalion.x, y: battalion.y };
    if (slot === index) return point;
    reserved.push(point);
  }
  return { x: battalion.x, y: battalion.y };
}
