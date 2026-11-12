import { effectiveElapsed, hasOpeningBalance } from './calendar';
import { distance, hasBuilding } from './runtime';
import { COLD_RESCUE, thermalConditionsAt } from './thermal';
import type { GameState, MapEntity, Unit } from './types';
import { landRouteEffort, planLandRoute } from './landNavigation';
import { sectorIndex } from './worldDimensions';

type Point = { x: number; y: number };

/** The existing 20 m predator trigger plus the gatherer's 3.6 m working layout.
 * This is a route choice, never a change to an animal's speed, range or damage. */
export const AUTONOMOUS_PREDATOR_CLEARANCE = 24;

function distanceToRoute(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x,
    dy = end.y - start.y,
    lengthSquared = dx * dx + dy * dy;
  const along = lengthSquared
    ? Math.max(
        0,
        Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
      )
    : 0;
  return distance(point, { x: start.x + along * dx, y: start.y + along * dy });
}

/** Guided automatic choices avoid known live predators on the outward and
 * homeward route. Unexplored animals are not revealed by this test. Direct
 * orders remain the player's decision, including an intentionally risky meal. */
export function safeAutonomousRoute(state: GameState, start: Point, destination: Point) {
  const actualRoutes =
    state.mapGeneration?.landNavigation === 1
      ? [planLandRoute(state, start, destination), planLandRoute(state, destination, state.home)]
      : undefined;
  if (actualRoutes?.some((route) => !route)) return false;
  if (state.playMode !== 'guided') return true;
  if (
    hasBuilding(state, 'palisade') &&
    distance(start, state.home) <= 15 &&
    // The worker stands beside the source, not exactly at its centre.
    distance(destination, state.home) <= 15 - 3.6
  )
    return true;
  return !state.entities.some((predator) => {
    if (!['alpha', 'wolf'].includes(predator.kind) || predator.hp <= 0 || predator.domesticated)
      return false;
    const known =
      state.tier >= 4 ||
      distance(start, predator) <= 20 ||
      state.sectors.some(
        (sector) =>
          sector.explored &&
          sector.x === sectorIndex(state, predator.x) &&
          sector.y === sectorIndex(state, predator.y),
      );
    if (!known) return false;
    const paths = actualRoutes
      ? [
          [start, ...actualRoutes[0]!],
          [destination, ...actualRoutes[1]!],
        ]
      : [
          [start, destination],
          [destination, state.home],
        ];
    return paths.some((path) =>
      path.some(
        (point, index) =>
          distanceToRoute(predator, index ? path[index - 1] : point, point) <
          AUTONOMOUS_PREDATOR_CLEARANCE,
      ),
    );
  });
}

/** An instinct may wait in real shelter rather than start a freezing round trip.
 * Explicit meals and urgent hunger keep their normal behaviour. This is a
 * conservative current-weather estimate, not a forecast of future disasters. */
export function safeInstinctiveFood(state: GameState, unit: Unit, food: MapEntity) {
  if (!safeAutonomousRoute(state, unit, food)) return false;
  if (!hasOpeningBalance(state) || unit.hunger >= 90) return true;
  const outside = thermalConditionsAt(state, unit, food);
  if (outside.delta >= 0) return true;
  const home = thermalConditionsAt(state, unit, state.home);
  if (home.fireHeat <= 0 && home.shelterWarmth <= 0) return true;
  if (home.delta <= outside.delta) return true;
  const routeDistance = (from: Point, to: Point) => {
    if (state.mapGeneration?.landNavigation !== 1) return distance(from, to);
    const path = planLandRoute(state, from, to);
    return path ? landRouteEffort(state, from, path) : Infinity;
  };
  const trip = (routeDistance(unit, food) + routeDistance(food, state.home)) / 4 + 1.5;
  const exposure = effectiveElapsed(state, state.time, state.time + trip);
  return unit.temp + outside.delta * exposure >= COLD_RESCUE.guidedWarning;
}
