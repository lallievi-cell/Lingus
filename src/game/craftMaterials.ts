import { freeCapacity } from './runtime';
import { canPayAt, canUseSiteGroundInput, hasHomeLandAccess, payAt } from './maritimeInventory';
import type { GameState, Inventory, MapEntity, Resource, Unit } from './types';

/** Stock-first payment frees inventory slots; nearby ground inputs do not. */
export function canFitCraftOutput(
  s: GameState,
  cost: Partial<Inventory>,
  output: Resource,
  amount = 1,
  artisan?: { x: number; y: number },
) {
  if (artisan && !hasHomeLandAccess(s, artisan)) return true;
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
  return canUseSiteGroundInput(s, entity, artisan);
}

export function canPayLocally(s: GameState, cost: Partial<Inventory>, artisan: Unit) {
  return canPayAt(s, artisan, cost);
}

export function payLocally(s: GameState, cost: Partial<Inventory>, artisan: Unit) {
  payAt(s, artisan, cost);
}
