import { ADULT_AGE } from './content';
import { activeUnits, hasWord } from './runtime';
import type { GameState, Target } from './types';

/** An explicit UI selection scope, never a word or a persisted gameplay flag. */
export const ALL_ADULTS_ANCHOR_ID = 'selection:all-adults';
export const CUSTOM_GROUP_ANCHOR_ID = 'selection:custom';

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

export function isCustomGroupAnchor(target?: Target | null) {
  return target?.type === 'point' && target.id === CUSTOM_GROUP_ANCHOR_ID;
}

/** A roster selection is a player control, never an order or a saved tradition.
 * Resolve its members afresh: death, missions and loss of Io cannot recruit
 * somebody else just because they now stand near the old selection centre. */
export function customGroupMembers(state: GameState, target?: Target | null) {
  if (!isCustomGroupAnchor(target) || !hasWord(state, 'S_02')) return [];
  const selected = new Set(target?.unitIds ?? []);
  return selectableTribeAdults(state).filter((unit) => selected.has(unit.id));
}

export function customGroupAnchor(state: GameState, unitIds: readonly string[]): Target {
  const requested = new Set(unitIds);
  const members = hasWord(state, 'S_02')
    ? selectableTribeAdults(state).filter((unit) => requested.has(unit.id))
    : [];
  return {
    type: 'point',
    id: CUSTOM_GROUP_ANCHOR_ID,
    unitIds: members.map((unit) => unit.id),
    x: members.length
      ? members.reduce((sum, unit) => sum + unit.x, 0) / members.length
      : state.home.x,
    y: members.length
      ? members.reduce((sum, unit) => sum + unit.y, 0) / members.length
      : state.home.y,
  };
}

/** Choose only people without an order or a suspended workplace. Resting,
 * warming up and eating companions keep recovering until explicitly chosen. */
export function idleTribeAdults(state: GameState) {
  return selectableTribeAdults(state).filter(
    (unit) => unit.action === 'idle' && !unit.command && !unit.jobBuildingId && !unit.suspendedJob,
  );
}
