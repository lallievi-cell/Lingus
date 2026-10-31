import type { GameState } from './types';

export type CalendarState = Pick<GameState, 'time'> &
  Partial<Pick<GameState, 'playMode' | 'openingBalanceVersion'>>;

export const OPENING_CALENDAR = {
  seasons: 4,
  seasonSeconds: 150,
  ordinarySeasonSeconds: 90,
} as const;

export function hasOpeningBalance(state: CalendarState) {
  return state.playMode === 'guided' && state.openingBalanceVersion === 1;
}

export function seasonStart(state: CalendarState, ordinal: number): number {
  const index = Math.max(0, Math.floor(ordinal));
  if (!hasOpeningBalance(state)) return index * 90;
  return Math.min(index, 4) * 150 + Math.max(0, index - 4) * 90;
}

export function seasonLength(state: CalendarState, ordinal: number): number {
  return hasOpeningBalance(state) && ordinal < 4 ? 150 : 90;
}

export function getCalendar(state: CalendarState, time = state.time) {
  const elapsed = Math.max(0, time);
  const seasonIndex = hasOpeningBalance(state)
    ? elapsed < 600
      ? Math.floor(elapsed / 150)
      : 4 + Math.floor((elapsed - 600) / 90)
    : Math.floor(elapsed / 90);
  const start = seasonStart(state, seasonIndex);
  const length = seasonLength(state, seasonIndex);
  const phase = elapsed - start;
  const dayLength = (length * 2) / 3;
  const isNight = phase >= dayLength;
  return {
    seasonIndex,
    season: seasonIndex % 4,
    year: Math.floor(seasonIndex / 4) + 1,
    seasonStart: start,
    seasonEnd: start + length,
    seasonLength: length,
    dayLength,
    phase,
    canonicalPhase: (phase * 90) / length,
    isNight,
    progress: phase / length,
    remaining: Math.ceil((isNight ? length : dayLength) - phase),
  };
}

export function getSeasonRate(state: CalendarState, time = state.time) {
  return 90 / getCalendar(state, time).seasonLength;
}

function effectiveTime(state: CalendarState, time: number) {
  // A direct subsystem update may describe an interval ending at time zero.
  // Extend its initial rate to negative time rather than dropping that work.
  const elapsed = time;
  return hasOpeningBalance(state) && elapsed < 600
    ? elapsed * (90 / 150)
    : hasOpeningBalance(state)
      ? elapsed - 240
      : elapsed;
}

/** Biological/economic seconds, integrated across the change of pace. */
export function effectiveElapsed(state: CalendarState, start: number, end: number) {
  return Math.max(0, effectiveTime(state, end) - effectiveTime(state, start));
}

/** Physical duration needed to consume a given biological/economic budget. */
export function secondsForEffectiveDuration(
  state: CalendarState,
  start: number,
  effectiveSeconds: number,
) {
  if (effectiveSeconds <= 0) return 0;
  if (effectiveSeconds === Infinity) return Infinity;
  const end = effectiveTime(state, start) + effectiveSeconds;
  const physicalEnd = hasOpeningBalance(state) ? (end < 360 ? end * (150 / 90) : end + 240) : end;
  return Math.max(0, physicalEnd - start);
}
