import type { GameState } from './types';

export const institutionIds = (state: GameState) =>
  new Set([
    ...state.traditions.map((entry) => `tradition:${entry.id}`),
    ...state.laws.map((entry) => `law:${entry.id}`),
    ...state.dogmas.map((entry) => `dogma:${entry.id}`),
    ...state.cities.flatMap((city) => city.vocations.map((entry) => `vocation:${entry.id}`)),
  ]);

/** Institutional speech is acknowledged by its real result, not the direct-order counter. */
export function orderAcknowledged(previous: GameState, next: GameState) {
  if (next.stats.commands > previous.stats.commands) return true;
  const existing = institutionIds(previous);
  return [...institutionIds(next)].some((id) => !existing.has(id));
}
