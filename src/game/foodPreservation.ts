import { hasOpeningBalance, type CalendarState } from './calendar';

/** Early reserves are forgiving; full storage pressure arrives gradually.
 * The absolute season being closed matters, not its repeating climate index. */
export function openingFoodSpoilageMultiplier(state: CalendarState, closedOrdinal: number) {
  if (!hasOpeningBalance(state)) return 1;
  return closedOrdinal < 4 ? 0.4 : closedOrdinal < 8 ? 0.7 : 1;
}
