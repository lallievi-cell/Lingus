import { bodyTemperatureDelta } from './math';
import { distance, isPlayerBuilding } from './runtime';
import type { GameState, Unit } from './types';

/** Existing heat radii and temperature equation, sampled at real destinations. */
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
  for (const building of [...homes, ...fires]) {
    const radius = building.kind === 'campfire' ? 14 : 9;
    const d = distance(unit, building);
    candidates.push({ id: building.id, x: building.x, y: building.y });
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
      candidates.push({
        id: home.id,
        x: home.x + (fire.x - home.x) * along,
        y: home.y + (fire.y - home.y) * along,
      });
    }
  return candidates
    .filter((point) => {
      const home = homes
        .filter((building) => distance(building, point) <= 10)
        .sort((left, right) => distance(left, point) - distance(right, point))[0];
      const fire = fires.some((building) => distance(building, point) <= 15);
      return (
        bodyTemperatureDelta(
          ambient,
          fire ? 3 : 0,
          pelts + (home?.kind === 'house' ? 2.5 : home ? 1 : 0),
        ) >= 0
      );
    })
    .sort((left, right) => distance(unit, left) - distance(unit, right))[0];
}
