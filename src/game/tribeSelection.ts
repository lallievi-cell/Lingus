import { ADULT_AGE } from './content';
import { activeUnits } from './runtime';
import type { GameState, Target } from './types';

/** An explicit UI selection scope, never a word or a persisted gameplay flag. */
export const ALL_ADULTS_ANCHOR_ID = 'selection:all-adults';

export function allAdultsAnchor(state: GameState): Target {
  return { type: 'point', id: ALL_ADULTS_ANCHOR_ID, ...state.home };
}

/** Urban residents and real missions have their own public controls. A village
 * recall must never detach soldiers, delegates or travelling settlers. */
export function selectableTribeAdults(state: GameState) {
  if (state.urbanized) return [];
  return activeUnits(state).filter(
    (unit) =>
      unit.age >= ADULT_AGE &&
      !unit.cityId &&
      ![
        'delegating',
        'frontline',
        'frontline-returning',
        'colonizing',
        'assimilating',
        'captured',
        'trading',
      ].includes(unit.action),
  );
}

export function isAllAdultsAnchor(target?: Target | null) {
  return target?.type === 'point' && target.id === ALL_ADULTS_ANCHOR_ID;
}
