import { bodyTemperatureDelta } from './math';
import { distance, isPlayerBuilding } from './runtime';
import { resolveInteractionPosition } from './interactionPositions';
import { campfireHeatAt, FIRE_HEAT, shelterWarmthAt } from './thermal';
import type { GameState, Unit } from './types';

/** Best real protection available, including partial protection in a blizzard.
 * No source is conjured and no actor is teleported. Stable per-person core slots
 * keep a rescue from sending the entire tribe onto the same fire coordinate. */
export function warmShelterDestination(
  state: GameState,
  unit: Unit,
  ambient: number,
  pelts: number,
) {
  const buildings = state.buildings.filter(
    (building) =>
      isPlayerBuilding(state, building) &&
      building.active &&
      building.hp > 0 &&
      building.completed !== false,
  );
  const fires = buildings.filter((building) => building.kind === 'campfire');
  const homes = buildings.filter((building) => ['house', 'hut'].includes(building.kind));
  const candidates: { id: string; x: number; y: number }[] = [];
  const currentDelta = bodyTemperatureDelta(
    ambient,
    campfireHeatAt(state, unit),
    pelts + shelterWarmthAt(state, unit),
  );
  for (const building of [...homes, ...fires]) {
    const radius = building.kind === 'campfire' ? 14 : 9;
    const d = distance(unit, building);
    const slot = resolveInteractionPosition(state, unit, building, {
      kind: building.kind === 'campfire' ? 'fire' : 'rest',
      key: `cold-shelter:${building.id}`,
      maxRadius: building.kind === 'campfire' ? 3.2 : 2.5,
    });
    candidates.push({ id: building.id, x: slot.x, y: slot.y });
    const scale = d > radius ? radius / d : 1;
    candidates.push({
      id: building.id,
      x: building.x + (unit.x - building.x) * scale,
      y: building.y + (unit.y - building.y) * scale,
    });
  }
  for (const home of homes)
    for (const fire of fires) {
      const d = distance(home, fire);
      if (d <= 0 || d >= 25) continue;
      // Stay inside both genuine protection circles, including narrow overlaps.
      const low = Math.max(0, d - 14.95),
        high = Math.min(9.95, d);
      if (low > high) continue;
      const along = (low + high) / 2 / d;
      const sample = (fraction: number) =>
        candidates.push({
          id: home.id,
          x: home.x + (fire.x - home.x) * fraction,
          y: home.y + (fire.y - home.y) * fraction,
        });
      sample(along);
      sample(low / d);
      sample(high / d);
      if (state.playMode === 'guided') {
        const coreLow = Math.max(0, d - FIRE_HEAT.guidedCoreRadius + 0.05),
          coreHigh = Math.min(9.95, d);
        if (coreLow <= coreHigh) sample((coreLow + coreHigh) / 2 / d);
      }
    }
  return candidates
    .map((point) => ({
      ...point,
      delta: bodyTemperatureDelta(
        ambient,
        campfireHeatAt(state, point),
        pelts + shelterWarmthAt(state, point),
      ),
    }))
    .filter(
      (point) =>
        point.delta > currentDelta + 0.01 ||
        // A sheltered actor may stay at a stable rescue place even when the
        // weather is too harsh for any available place to fully stop cooling.
        (point.delta >= currentDelta - 0.01 &&
          (campfireHeatAt(state, point) > 0 || shelterWarmthAt(state, point) > 0)),
    )
    .sort(
      (left, right) => right.delta - left.delta || distance(unit, left) - distance(unit, right),
    )[0];
}
