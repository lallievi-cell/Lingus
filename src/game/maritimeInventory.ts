import { hasOpeningBalance } from './calendar';
import { coastLandmassAt, createCoastGeometry } from './coastGeometry';
import { isLandSegment, planLandRoute } from './landNavigation';
import { addResource, distance, nextId } from './runtime';
import { sectorIndex } from './worldDimensions';
import type { GameState, Inventory, MapEntity, Resource } from './types';

type Site = { x: number; y: number };

/** Cheap sea separation for candidate lists. Actual chosen land routes still
 * check rivers, fords and every intervening segment in the route planner. */
export function sameLandmass(state: GameState, a: Site, b: Site) {
  if (state.mapGeneration?.maritimeRules !== 1) return true;
  const coast = createCoastGeometry(state);
  if (!coast) return true;
  const from = coastLandmassAt(coast, a);
  return from !== undefined && from === coastLandmassAt(coast, b);
}

/** A sea crossing never grants access to the shared stock at home. */
export function hasHomeLandAccess(state: GameState, point: Site) {
  // Access needs a physical connection, not the cheapest terrain-aware trip.
  return (
    state.mapGeneration?.maritimeRules !== 1 ||
    (sameLandmass(state, point, state.home) &&
      (isLandSegment(state, point, state.home) || !!planLandRoute(state, point, state.home)))
  );
}

/** Physical piles keep the ordinary artisan reach, including the Guided camp. */
export function canUseSiteGroundInput(state: GameState, entity: MapEntity, site: Site) {
  const camp = hasOpeningBalance(state) && distance(site, state.home) <= 15;
  return (
    entity.kind === 'ground' &&
    entity.amount > 0 &&
    (distance(entity, site) <= 15 || (camp && distance(entity, state.home) <= 35)) &&
    (state.mapGeneration?.landNavigation !== 1 || !!planLandRoute(state, site, entity))
  );
}

function localInputs(state: GameState, point: Site, resource: Resource) {
  return state.entities.filter(
    (entity) => entity.resource === resource && canUseSiteGroundInput(state, entity, point),
  );
}

export function availableResourceAt(state: GameState, point: Site, resource: Resource) {
  return (
    (hasHomeLandAccess(state, point) ? (state.resources[resource] ?? 0) : 0) +
    localInputs(state, point, resource).reduce((amount, entity) => amount + entity.amount, 0)
  );
}

export function canPayAt(state: GameState, point: Site, cost: Partial<Inventory>) {
  return Object.entries(cost).every(
    ([resource, amount]) => availableResourceAt(state, point, resource as Resource) >= amount,
  );
}

/** Call only after canPayAt: camp stock first, then real reachable ground piles. */
export function payAt(state: GameState, point: Site, cost: Partial<Inventory>) {
  const home = hasHomeLandAccess(state, point);
  for (const [resource, amount] of Object.entries(cost)) {
    const key = resource as Resource;
    const stored = home ? Math.min(amount, state.resources[key] ?? 0) : 0;
    if (home) state.resources[key] = (state.resources[key] ?? 0) - stored;
    let left = amount - stored;
    for (const pile of localInputs(state, point, key)) {
      const take = Math.min(pile.amount, left);
      pile.amount -= take;
      left -= take;
      if (left <= 0) break;
    }
  }
}

/** Island output stays at the producer until somebody carries it onto a boat.
 * Return the real deposited amount so a normal camp can still handle overflow. */
export function depositResourceAt(
  state: GameState,
  point: Site,
  resource: Resource,
  amount: number,
  reserved = false,
) {
  if (hasHomeLandAccess(state, point)) return addResource(state, resource, amount, reserved);
  const deposited = Math.max(0, amount);
  if (deposited <= 0) return 0;
  const pile = state.entities.find(
    (entity) =>
      entity.kind === 'ground' && entity.resource === resource && distance(entity, point) <= 0.5,
  );
  if (pile) {
    pile.amount += deposited;
    pile.maxAmount = Math.max(pile.maxAmount ?? 0, pile.amount);
  } else {
    state.entities.push({
      id: nextId(state, 'ground'),
      kind: 'ground',
      x: point.x,
      y: point.y,
      amount: deposited,
      maxAmount: deposited,
      hp: 0,
      maxHp: 1,
      resource,
      sectorId: `sector-${sectorIndex(state, point.x)}-${sectorIndex(state, point.y)}`,
    });
  }
  return deposited;
}
