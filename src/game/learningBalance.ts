import { effectiveElapsed, getCalendar } from './calendar';
import { SEASON_TEMPERATURES, WORDS } from './content';
import { attentionPoints, clamp } from './math';
import { activeUnits } from './runtime';
import { thermalConditionsAt } from './thermal';
import type { GameState } from './types';

/** Versioned product calibration; older Guided saves retain their original rules. */
export const hasLearningBalance = (state: GameState) =>
  state.playMode === 'guided' && state.openingBalanceVersion === 1;

export const LEARNING_BALANCE = {
  firstYearCouncilBase: 30,
  laterCouncilBase: 20,
  attentionPerBurntWood: 2,
  attentionPerElder: 5,
  hungerPenaltyStarts: 70,
  attentionPerExcessHunger: 2,
  lastCustodianFloor: 80,
  livedFireUseSeconds: 2,
} as const;

/** Seasonal settlement and its council belong to the season that just ended. */
function closedSeason(state: GameState) {
  return Math.max(0, getCalendar(state).seasonIndex - 1);
}

export interface CouncilAttention {
  base: number;
  fuel: number;
  elders: number;
  hungerPenalty: number;
  temple: number;
  total: number;
}

/** All inputs describe actual fuel, people and food needs at this boundary. */
export function getCouncilAttention(
  state: GameState,
  burntWood: number,
  elders: number,
  averageHunger: number,
  maximum = 100,
  temple = 0,
): CouncilAttention {
  if (!hasLearningBalance(state))
    return {
      base: 0,
      fuel: burntWood * 5,
      elders: elders * 10,
      hungerPenalty: averageHunger,
      temple,
      total: clamp(attentionPoints(burntWood, elders, averageHunger, maximum) + temple, 0, maximum),
    };
  const base =
      closedSeason(state) < 4
        ? LEARNING_BALANCE.firstYearCouncilBase
        : LEARNING_BALANCE.laterCouncilBase,
    fuel = burntWood * LEARNING_BALANCE.attentionPerBurntWood,
    elderBonus = elders * LEARNING_BALANCE.attentionPerElder,
    hungerPenalty =
      Math.max(0, averageHunger - LEARNING_BALANCE.hungerPenaltyStarts) *
      LEARNING_BALANCE.attentionPerExcessHunger;
  return {
    base,
    fuel,
    elders: elderBonus,
    hungerPenalty,
    temple,
    total: clamp(base + fuel + elderBonus + temple - hungerPenalty, 0, maximum),
  };
}

/** Preserve dogma multipliers while gradually introducing the full oral burden. */
export function learningDecayGamma(state: GameState, ordinaryGamma: number, settling = true) {
  if (!hasLearningBalance(state)) return ordinaryGamma;
  const season = settling ? closedSeason(state) : getCalendar(state).seasonIndex;
  return ordinaryGamma * (season < 4 ? 1 / 3 : season < 8 ? 2 / 3 : 1);
}

/** A paid transmission from an early last custodian gives a robust second voice. */
export function teachingMemoryGain(state: GameState, wordId: string, ordinaryGain: number) {
  const memory = state.words[wordId],
    word = WORDS[wordId],
    season = state.campfirePending ? closedSeason(state) : getCalendar(state).seasonIndex;
  if (
    !hasLearningBalance(state) ||
    season >= 4 ||
    !memory ||
    memory.retention <= 0 ||
    !word ||
    word.tier === 0 ||
    word.tier > 2 ||
    activeUnits(state).filter(
      (unit) => unit.caste !== 'slave' && memory.custodians.includes(unit.id),
    ).length !== 1
  )
    return ordinaryGain;
  return Math.max(ordinaryGain, LEARNING_BALANCE.lastCustodianFloor - memory.retention);
}

/** Heat is lived use, not an artificial order. Exposure is global, not per person.
 * Normalized seconds preserve the same seasonal reinforcement in a longer opening.
 * Partial exposure survives save/reload without granting a word or another custodian. */
export function recordLivedFireUse(state: GameState, dt: number) {
  if (!hasLearningBalance(state) || !Number.isFinite(dt) || dt <= 0) return;
  const memory = state.words.O_05;
  if (!memory || memory.retention <= 0) return;
  const calendar = getCalendar(state, Math.max(0, state.time - dt / 2)),
    ambient = state.disasters.blizzard
      ? -10
      : SEASON_TEMPERATURES[calendar.season][calendar.isNight ? 'night' : 'day'];
  const warmedCustodian = activeUnits(state).some((unit) => {
    if (unit.caste === 'slave' || !memory.custodians.includes(unit.id)) return false;
    const thermal = thermalConditionsAt(state, unit, unit, ambient);
    return thermal.ambient < 50 && thermal.fireHeat > 0;
  });
  if (!warmedCustodian) return;
  const key = 'livedFireExposure:O_05',
    exposure = (state.eventTimes[key] ?? 0) + effectiveElapsed(state, state.time - dt, state.time),
    uses = Math.floor((exposure + 1e-9) / LEARNING_BALANCE.livedFireUseSeconds);
  memory.uses += uses;
  state.eventTimes[key] = Math.max(0, exposure - uses * LEARNING_BALANCE.livedFireUseSeconds);
}
