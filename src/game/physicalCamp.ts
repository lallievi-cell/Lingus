import { coastDistance } from './coastGeometry';
import type { GameState } from './types';

type CampWorld = Pick<GameState, 'mapGeneration' | 'sectors' | 'home'> &
  Partial<Pick<GameState, 'world' | 'units' | 'buildings' | 'cities' | 'resources'>>;

/** A region's bookkeeping home is not itself a physical camp or a free settlement. */
export function hasPhysicalCamp(state: CampWorld): boolean {
  if (state.mapGeneration?.worldRules !== 1) return true;
  const regionId = `${state.mapGeneration.regionX}:${state.mapGeneration.regionY}`;
  if (regionId === (state.world?.homeRegionId ?? '0:0')) return true;
  if (coastDistance(state, state.home) <= 0.25) return false;
  const nearby = (point: { x: number; y: number }) =>
    Math.hypot(point.x - state.home.x, point.y - state.home.y) <= 25;
  return (
    !!state.units?.some(
      (unit) =>
        unit.hp > 0 &&
        (!unit.factionId || unit.factionId === 'player') &&
        !unit.boatId &&
        nearby(unit),
    ) ||
    !!state.buildings?.some(
      (building) =>
        building.hp > 0 &&
        building.completed !== false &&
        (!building.cityId ||
          state.cities?.some(
            (city) => city.id === building.cityId && city.factionId === 'player',
          )) &&
        nearby(building),
    ) ||
    (!!state.resources &&
      Object.values(state.resources).some((amount) => Number.isFinite(amount) && amount > 0))
  );
}
