import { distance, freeCapacity } from './runtime';
import { hasOpeningBalance } from './calendar';
import type { GameState, Inventory, Resource, Unit } from './types';

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
    resources[key] -= Math.min(n, resources[key]);
  }
  // Reuse the real storage categories and live carriers' reservations.
  return freeCapacity({ ...s, resources }, output) >= amount;
}

/** A camp artisan can use the extracted inputs around the new Guided camp.
 * Outside camp, and in older profiles, the ordinary 15m reach remains. */
function localInputs(s: GameState, resource: string, artisan: Unit) {
  const camp = hasOpeningBalance(s) && distance(artisan, s.home) <= 15;
  return s.entities.filter(
    (entity) =>
      entity.kind === 'ground' &&
      entity.resource === resource &&
      (distance(entity, artisan) <= 15 || (camp && distance(entity, s.home) <= 35)),
  );
}

export function canPayLocally(s: GameState, cost: Partial<Inventory>, artisan: Unit) {
  return Object.entries(cost).every(
    ([r, n]) =>
      s.resources[r as Resource] + localInputs(s, r, artisan).reduce((a, e) => a + e.amount, 0) >=
      n,
  );
}

export function payLocally(s: GameState, cost: Partial<Inventory>, artisan: Unit) {
  for (const [r, n] of Object.entries(cost)) {
    const key = r as Resource,
      take = Math.min(n, s.resources[key]);
    s.resources[key] -= take;
    let left = n - take;
    for (const e of localInputs(s, r, artisan)) {
      const part = Math.min(e.amount, left);
      e.amount -= part;
      left -= part;
      if (left <= 0) break;
    }
  }
}
