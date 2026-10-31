import { SEASON_TEMPERATURES } from './content';
import { getCalendar } from './calendar';
import { getDogmaEffects } from './dogmas';
import { bodyTemperatureDelta } from './math';
import { activeUnits, distance, isPlayerBuilding } from './runtime';
import type { GameState, Unit } from './types';

/** Guided calibration: the visible inner circle can warm a person during a normal
 * winter night. A blizzard still needs clothing or a real shelter. Classic keeps
 * the document's uniform +3 heat within fifteen metres. */
export const FIRE_HEAT = {
  radius: 15,
  guidedCoreRadius: 6,
  guidedCoreHeat: 5.5,
  edgeHeat: 3,
} as const;
export const COLD_RESCUE = {
  guidedWarning: 40,
  classicWarning: 30,
  guidedRecovery: 60,
  classicRecovery: 45,
} as const;
type Point = { x: number; y: number };

export function fireHeatAtDistance(state: Pick<GameState, 'playMode'>, metres: number) {
  if (!Number.isFinite(metres) || metres > FIRE_HEAT.radius) return 0;
  if (state.playMode !== 'guided') return FIRE_HEAT.edgeHeat;
  if (metres <= FIRE_HEAT.guidedCoreRadius) return FIRE_HEAT.guidedCoreHeat;
  const progress =
    (metres - FIRE_HEAT.guidedCoreRadius) / (FIRE_HEAT.radius - FIRE_HEAT.guidedCoreRadius);
  return FIRE_HEAT.guidedCoreHeat + (FIRE_HEAT.edgeHeat - FIRE_HEAT.guidedCoreHeat) * progress;
}

export function campfireHeatAt(state: GameState, point: Point) {
  return state.buildings.reduce(
    (heat, building) =>
      building.kind === 'campfire' &&
      building.active &&
      building.hp > 0 &&
      building.completed !== false &&
      isPlayerBuilding(state, building)
        ? Math.max(heat, fireHeatAtDistance(state, distance(building, point)))
        : heat,
    0,
  );
}

/** The existing rule uses the nearest actual shelter, rather than stacking houses. */
export function shelterWarmthAt(state: GameState, point: Point) {
  const shelter = state.buildings
    .filter(
      (building) =>
        ['hut', 'house'].includes(building.kind) &&
        building.active &&
        building.hp > 0 &&
        building.completed !== false &&
        isPlayerBuilding(state, building) &&
        distance(building, point) <= 10,
    )
    .sort((left, right) => distance(left, point) - distance(right, point))[0];
  return shelter?.kind === 'house' ? 2.5 : shelter?.kind === 'hut' ? 1 : 0;
}

export function unitPelts(state: GameState, unit: Unit) {
  const index = activeUnits(state).findIndex((person) => person.id === unit.id);
  return index >= 0 &&
    !getDogmaEffects(state, { unit }).vegetarian &&
    state.resources.pelt >= index + 1
    ? 1
    : 0;
}

export function thermalConditionsAt(
  state: GameState,
  unit: Unit,
  point: Point = unit,
  ambient?: number,
) {
  const calendar = getCalendar(state);
  ambient ??= state.disasters.blizzard
    ? -10
    : SEASON_TEMPERATURES[calendar.season][calendar.isNight ? 'night' : 'day'];
  const fireHeat = campfireHeatAt(state, point),
    shelterWarmth = shelterWarmthAt(state, point),
    pelts = unitPelts(state, unit);
  return {
    ambient,
    fireHeat,
    shelterWarmth,
    pelts,
    delta: bodyTemperatureDelta(ambient, fireHeat, pelts + shelterWarmth),
  };
}
