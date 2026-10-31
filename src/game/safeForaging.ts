import { effectiveElapsed, hasOpeningBalance } from './calendar';
import { distance } from './runtime';
import { COLD_RESCUE, thermalConditionsAt } from './thermal';
import type { GameState, MapEntity, Unit } from './types';

/** An instinct may wait in real shelter rather than start a freezing round trip.
 * Explicit meals and urgent hunger keep their normal behaviour. This is a
 * conservative current-weather estimate, not a forecast of future disasters. */
export function safeInstinctiveFood(state: GameState, unit: Unit, food: MapEntity) {
  if (!hasOpeningBalance(state) || unit.hunger >= 90) return true;
  const outside = thermalConditionsAt(state, unit, food);
  if (outside.delta >= 0) return true;
  const home = thermalConditionsAt(state, unit, state.home);
  if (home.fireHeat <= 0 && home.shelterWarmth <= 0) return true;
  if (home.delta <= outside.delta) return true;
  const trip = (distance(unit, food) + distance(food, state.home)) / 4 + 1.5;
  const exposure = effectiveElapsed(state, state.time, state.time + trip);
  return unit.temp + outside.delta * exposure >= COLD_RESCUE.guidedWarning;
}
