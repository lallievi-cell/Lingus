import { distance } from './runtime';
import type { GameState, Inventory, Resource, Unit } from './types';

/** Real extracted materials within the artisan's 15m reach (decision A-20). */
export function canPayLocally(s: GameState, cost: Partial<Inventory>, artisan: Unit) {
  return Object.entries(cost).every(
    ([r, n]) =>
      s.resources[r as Resource] +
        s.entities
          .filter((e) => e.kind === 'ground' && e.resource === r && distance(e, artisan) <= 15)
          .reduce((a, e) => a + e.amount, 0) >=
      n,
  );
}

export function payLocally(s: GameState, cost: Partial<Inventory>, artisan: Unit) {
  for (const [r, n] of Object.entries(cost)) {
    const key = r as Resource,
      take = Math.min(n, s.resources[key]);
    s.resources[key] -= take;
    let left = n - take;
    for (const e of s.entities.filter(
      (e) => e.kind === 'ground' && e.resource === r && distance(e, artisan) <= 15,
    )) {
      const part = Math.min(e.amount, left);
      e.amount -= part;
      left -= part;
      if (left <= 0) break;
    }
  }
}
