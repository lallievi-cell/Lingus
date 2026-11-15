import { distance, freeCapacity } from './runtime';
import { hasOpeningBalance } from './calendar';
import { planLandRoute } from './landNavigation';
import type { GameState, Inventory, MapEntity, Resource, Unit } from './types';

/** Stock-first payment frees inventory slots; nearby ground inputs do not. */
export function canFitCraftOutput(
  s: GameState,
  cost: Partial<Inventory>,
  output: Resource,
  amount = 1,
) {
  const resources = { ...s.resources };
  for (const [r, n] of Object.entries(cost)) {
    const key = r as Resource;
    resources[key] = (resources[key] ?? 0) - Math.min(n, resources[key] ?? 0);
  }
  // Reuse the real storage categories and live carriers' reservations.
  return freeCapacity({ ...s, resources }, output) >= amount;
}

/** A camp artisan can use the extracted inputs around the new Guided camp.
 * Outside camp, and in older profiles, the ordinary 15m reach remains. */
export function canUseGroundInput(s: GameState, entity: MapEntity, artisan: Unit) {
  const camp = hasOpeningBalance(s) && distance(artisan, s.home) <= 15;
  return (
    entity.kind === 'ground' &&
    entity.amount > 0 &&
    (distance(entity, artisan) <= 15 || (camp && distance(entity, s.home) <= 35)) &&
    (s.mapGeneration?.landNavigation !== 1 || !!planLandRoute(s, artisan, entity))
  );
}
function localInputs(s: GameState, resource: string, artisan: Unit) {
  return s.entities.filter(
    (entity) => entity.resource === resource && canUseGroundInput(s, entity, artisan),
  );
}

export function canPayLocally(s: GameState, cost: Partial<Inventory>, artisan: Unit) {
  return Object.entries(cost).every(
    ([r, n]) =>
      (s.resources[r as Resource] ?? 0) +
        localInputs(s, r, artisan).reduce((a, e) => a + e.amount, 0) >=
      n,
  );
}

export function payLocally(s: GameState, cost: Partial<Inventory>, artisan: Unit) {
  for (const [r, n] of Object.entries(cost)) {
    const key = r as Resource,
      take = Math.min(n, s.resources[key] ?? 0);
    s.resources[key] = (s.resources[key] ?? 0) - take;
    let left = n - take;
    for (const e of localInputs(s, r, artisan)) {
      const part = Math.min(e.amount, left);
      e.amount -= part;
      left -= part;
      if (left <= 0) break;
    }
  }
}
