import { BUILDING_SPECS, RESOURCE_SPECS, SEASON_LENGTH } from './content';
import { getCalendar } from './calendar';
import { resourceSpoilage } from './math';
import { foreignForgeNeedsArms } from './foreignPolicy';
import { openingFoodSpoilageMultiplier } from './foodPreservation';
import type { City, GameState } from './types';

/** Autonomous planning choices, not new production bonuses or resource grants. */
export const FOREIGN_ECONOMY_ASSUMPTIONS = {
  peacefulIngotReserve: 12,
  seedGatheringAttemptsPerSeed: 10,
} as const;

export function foreignSeedReserve(state: GameState, city: City, additionalFarms = 0) {
  const farms =
    state.buildings.filter(
      (b) => b.cityId === city.id && b.kind === 'farm' && b.hp > 0 && b.completed !== false,
    ).length + additionalFarms;
  if (!farms) return 0;
  let reserve = farms * (BUILDING_SPECS.farm.upkeep.seed ?? 0);
  const ended = (getCalendar(state).season + 3) % 4;
  const storage = state.buildings.some(
    (b) =>
      b.cityId === city.id && b.kind === 'storage' && b.hp > 0 && b.active && b.completed !== false,
  );
  // Seed maintenance is paid before spoilage at the close of the next spring.
  let advance = 1;
  for (let future = (ended + 1) % 4; future !== 0; future = (future + 1) % 4, advance++) {
    const rate =
      resourceSpoilage(
        RESOURCE_SPECS.seed.spoil,
        future === 1,
        storage,
        city.resources.pottery > 0,
      ) * openingFoodSpoilageMultiplier(state, getCalendar(state).seasonIndex - 1 + advance);
    reserve /= Math.max(0.01, 1 - rate);
  }
  return reserve;
}

/** Hearth upkeep and useful cooking precede discretionary metal production. */
export function foreignFuelReserve(state: GameState, city: City) {
  const fire = state.buildings.some(
    (b) => b.cityId === city.id && b.kind === 'campfire' && b.hp > 0 && b.completed !== false,
  );
  if (!fire) return 0;
  const population = Object.values(city.cohorts).reduce((sum, count) => sum + count, 0);
  const cooking = Math.min(
    city.resources.meat,
    (population * SEASON_LENGTH * 0.8) / RESOURCE_SPECS.cooked.nutrition,
  );
  return (BUILDING_SPECS.campfire.upkeep.wood ?? 0) + Math.ceil(cooking);
}

export function foreignIngotDemand(state: GameState, city: City) {
  const faction = state.factions.find((entry) => entry.id === city.factionId);
  return faction?.hostile ||
    state.foreignPolicy?.relations.some(
      (relation) => relation.atWar && [relation.leftId, relation.rightId].includes(city.factionId),
    )
    ? 20
    : FOREIGN_ECONOMY_ASSUMPTIONS.peacefulIngotReserve;
}

export function foreignForgeCanWork(state: GameState, city: City) {
  return (
    foreignForgeNeedsArms(state, city) ||
    (city.resources.ore >= 1 &&
      city.resources.wood >= foreignFuelReserve(state, city) + 2 &&
      city.resources.ingot < foreignIngotDemand(state, city))
  );
}
