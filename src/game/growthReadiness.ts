import { ADULT_AGE, BASE_HOUSING, BUILDING_SPECS, ELDER_AGE } from './content';
import { getDogmaEffects } from './dogmas';
import { pairFertileUnits, resolveUnitSex } from './demography';
import { activeUnits, distance, isPlayerBuilding } from './runtime';
import type { GameState, Unit } from './types';

export type FertilityBlocker =
  | 'dead'
  | 'foreign'
  | 'child'
  | 'elder'
  | 'food'
  | 'rest'
  | 'home'
  | 'dogma';
export type GrowthBlocker = 'food' | 'rest' | 'home' | 'dogma' | 'housing' | 'partner';
export interface FertilityContext {
  /** Settlement captures rest before clearing the per-season flags. */
  restedIds?: ReadonlySet<string>;
  /** UI forecasts the age increment that happens before the next birth roll. */
  ageOffset?: number;
  celibateSages?: boolean;
}

export function villageHousing(state: GameState): number {
  return (
    BASE_HOUSING +
    state.buildings
      .filter(
        (building) =>
          isPlayerBuilding(state, building) &&
          building.hp > 0 &&
          building.active &&
          building.completed !== false,
      )
      .reduce((sum, building) => sum + (BUILDING_SPECS[building.kind].housing ?? 0), 0)
  );
}

/** The same eligibility check is used by the birth roll and the player view. */
export function fertilityBlockers(
  state: GameState,
  unit: Unit,
  context: FertilityContext = {},
): FertilityBlocker[] {
  if (unit.hp <= 0) return ['dead'];
  if (unit.factionId !== undefined && unit.factionId !== 'player') return ['foreign'];
  const age = unit.age + (context.ageOffset ?? 0);
  if (age < ADULT_AGE) return ['child'];
  if (age >= ELDER_AGE) return ['elder'];
  const blockers: FertilityBlocker[] = [];
  if (unit.hunger > 50) blockers.push('food');
  const rested = context.restedIds
    ? context.restedIds.has(unit.id)
    : unit.sleptThisNight || unit.restedThisSeason;
  if (!rested) blockers.push('rest');
  if (distance(unit, state.home) > 10) blockers.push('home');
  const celibate = context.celibateSages ?? getDogmaEffects(state).celibateSages;
  if (celibate && unit.intelligence >= 7) blockers.push('dogma');
  return blockers;
}

export function eligibleParents(state: GameState, context: FertilityContext = {}): Unit[] {
  const conditions = {
    ...context,
    celibateSages: context.celibateSages ?? getDogmaEffects(state).celibateSages,
  };
  return activeUnits(state).filter(
    (unit) => fertilityBlockers(state, unit, conditions).length === 0,
  );
}

export interface GrowthReadiness {
  urbanized: boolean;
  population: number;
  housing: number;
  freePlaces: number;
  candidateMales: number;
  candidateFemales: number;
  readyMales: number;
  readyFemales: number;
  readyPairs: number;
  blockers: GrowthBlocker[];
  missingSex?: 'M' | 'F' | 'both';
}

/** A conditional forecast: food, rest, position and survival can still change. */
export function getGrowthReadiness(state: GameState): GrowthReadiness {
  const living = activeUnits(state);
  const housing = villageHousing(state);
  const context: FertilityContext = {
    ageOffset: 1,
    celibateSages: getDogmaEffects(state).celibateSages,
  };
  const candidates = living.filter((unit) => unit.age + 1 >= ADULT_AGE && unit.age + 1 < ELDER_AGE);
  const males = candidates.filter((unit) => resolveUnitSex(unit) === 'M');
  const females = candidates.filter((unit) => resolveUnitSex(unit) === 'F');
  const ready = eligibleParents(state, context);
  const readyPairs = pairFertileUnits(ready).length;
  const blockers: GrowthBlocker[] = [];
  if (living.length >= housing) blockers.push('housing');
  if (!males.length || !females.length) blockers.push('partner');
  // Explain the nearest potential pair, rather than calling every hungry
  // adult a blocker when another pair already meets the conditions.
  if (!readyPairs) {
    const best = (group: Unit[]) =>
      group
        .map((unit) => fertilityBlockers(state, unit, context))
        .sort((a, b) => a.length - b.length)[0] ?? [];
    for (const blocker of [...best(males), ...best(females)])
      if (
        ['food', 'rest', 'home', 'dogma'].includes(blocker) &&
        !blockers.includes(blocker as GrowthBlocker)
      )
        blockers.push(blocker as GrowthBlocker);
  }
  return {
    urbanized: state.urbanized,
    population: living.length,
    housing,
    freePlaces: Math.max(0, housing - living.length),
    candidateMales: males.length,
    candidateFemales: females.length,
    readyMales: ready.filter((unit) => resolveUnitSex(unit) === 'M').length,
    readyFemales: ready.filter((unit) => resolveUnitSex(unit) === 'F').length,
    readyPairs,
    blockers,
    missingSex:
      !males.length && !females.length
        ? 'both'
        : !males.length
          ? 'M'
          : !females.length
            ? 'F'
            : undefined,
  };
}

export const GROWTH_BLOCKER_TEXT: Record<GrowthBlocker, string> = {
  food: 'Cibo: servono futuri genitori sazi.',
  rest: 'Riposo: occorre dormire nella stagione in corso.',
  home: 'Giaciglio: i futuri genitori devono tornare al campo.',
  dogma: 'Dogma: il celibato esclude i saggi dalla riproduzione.',
  housing: 'Alloggi: tutti i posti sono occupati; prepara un altro riparo.',
  partner: 'Partner: manca una coppia in età fertile.',
};

export function individualGrowthHint(state: GameState, unit: Unit): string {
  if (state.urbanized) return 'La crescita della città si valuta nel suo insediamento.';
  if (unit.hp <= 0 || (unit.factionId !== undefined && unit.factionId !== 'player')) return '';
  if (unit.age + 1 < ADULT_AGE) return 'Cresce ancora: potrà diventare genitore da adulto.';
  if (unit.age >= ELDER_AGE) return 'Ha superato l’età fertile; può ancora tramandare il sapere.';
  if (unit.age + 1 >= ELDER_AGE)
    return 'Al prossimo cambio di stagione entrerà nell’età anziana e uscirà dall’età fertile.';
  const own = fertilityBlockers(state, unit, { ageOffset: 1 });
  const blocked = own.filter((reason): reason is 'food' | 'rest' | 'home' | 'dogma' =>
    ['food', 'rest', 'home', 'dogma'].includes(reason),
  );
  if (blocked.length)
    return `Per il prossimo cambio: ${blocked.map((reason) => GROWTH_BLOCKER_TEXT[reason]).join(' ')}`;
  if (activeUnits(state).length >= villageHousing(state)) return GROWTH_BLOCKER_TEXT.housing;
  const mate = eligibleParents(state, { ageOffset: 1 }).some(
    (other) => other.id !== unit.id && resolveUnitSex(other) !== resolveUnitSex(unit),
  );
  if (!mate)
    return 'Le sue condizioni sono favorevoli; serve anche un partner fertile, sazio e riposato al campo.';
  return 'Le condizioni presenti sono favorevoli per il prossimo cambio. La nascita resta una possibilità, non una certezza.';
}
