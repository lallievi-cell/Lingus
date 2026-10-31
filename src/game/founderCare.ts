import { getCalendar, hasOpeningBalance } from './calendar';
import { senileDeathProbability } from './math';
import type { GameState, Unit } from './types';

export const FOUNDER_CARE = {
  additionalElderSeasons: 2,
  protectedCouncils: 2,
  lastProtectedSeason: 8,
} as const;

/** More time with the elders, without changing adulthood, fertility or elder status. */
export function getOldAgeProbability(state: GameState, unit: Pick<Unit, 'id' | 'age'>) {
  if (!hasOpeningBalance(state)) return senileDeathProbability(unit.age);
  const founder = /^unit-[0-6]$/.test(unit.id);
  if (
    founder &&
    (state.openingCouncilsCompleted ?? 0) < FOUNDER_CARE.protectedCouncils &&
    getCalendar(state).seasonIndex < FOUNDER_CARE.lastProtectedSeason
  )
    return 0;
  return senileDeathProbability(unit.age - FOUNDER_CARE.additionalElderSeasons);
}
