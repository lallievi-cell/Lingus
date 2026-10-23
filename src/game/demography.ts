import { ADULT_AGE, ELDER_AGE } from './content';
import { nextId } from './runtime';
import type { GameState, TribeEvent, Unit } from './types';

export const TRIBE_EVENT_LIMIT = 80;
export type LifeStage = 'newborn' | 'child' | 'adult' | 'elder';
const INITIAL_SEX: Record<string, 'M' | 'F'> = {
  Korg: 'M',
  Ayla: 'F',
  Nara: 'F',
  Oru: 'M',
  Tala: 'F',
  Uma: 'F',
  Ilo: 'M',
};
const NAMES = {
  M: ['Turo', 'Bram', 'Dako', 'Elan', 'Aren', 'Orin', 'Luan', 'Neri'],
  F: ['Sora', 'Lira', 'Yuna', 'Mako', 'Ena', 'Runa', 'Mira', 'Ari'],
};

/** Old v2 saves keep a stable identity without consuming simulation randomness. */
export function resolveUnitSex(unit: Unit): 'M' | 'F' {
  if (unit.sex) return unit.sex;
  if (Object.hasOwn(INITIAL_SEX, unit.name)) return INITIAL_SEX[unit.name];
  let hash = 0;
  for (const char of unit.id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return hash % 2 === 0 ? 'M' : 'F';
}

export function getLifeStage(unit: Unit): LifeStage {
  return unit.age < 1
    ? 'newborn'
    : unit.age < ADULT_AGE
      ? 'child'
      : unit.age < ELDER_AGE
        ? 'adult'
        : 'elder';
}

/** Eligibility (rest, food, age and housing) remains the seasonal caller's job. */
export function pairFertileUnits(units: Unit[]): [Unit, Unit][] {
  const males = units.filter((u) => resolveUnitSex(u) === 'M');
  const females = units.filter((u) => resolveUnitSex(u) === 'F');
  return males.slice(0, females.length).map((male, i) => [male, females[i]]);
}

export function newbornName(state: GameState, sex: 'M' | 'F'): string {
  const used = new Set(state.units.map((u) => u.name));
  const names = NAMES[sex];
  for (let cycle = 0; ; cycle++) {
    let suffix = '',
      remaining = cycle;
    while (remaining > 0) {
      suffix = ['ka', 'ra', 'na', 'mi', 'ta', 'lo', 'su', 've'][(remaining - 1) % 8] + suffix;
      remaining = Math.floor((remaining - 1) / 8);
    }
    for (const name of names) {
      const candidate = suffix ? `${name}-${suffix}` : name;
      if (!used.has(candidate)) return candidate;
    }
  }
}

export function recordTribeEvent(state: GameState, event: Omit<TribeEvent, 'id' | 'time'>) {
  state.tribeEvents ??= [];
  state.tribeEvents.unshift({ ...event, id: nextId(state, 'tribe-event'), time: state.time });
  state.tribeEvents.length = Math.min(state.tribeEvents.length, TRIBE_EVENT_LIMIT);
}
