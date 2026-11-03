import { getCalendar } from './calendar';
import { validLearnedRecipe } from './knowledgeRecovery';
import { hasWord, log } from './runtime';
import type { GameState, Spark } from './types';

export const GUIDED_DISCOVERY_PACING = {
  visibleLimit: 2,
  earlySeasons: 8,
  optionalInterval: 25,
  sparkLifetime: 45,
} as const;

/** These meanings keep the early food, materials and fire sequence moving. */
export const SURVIVAL_DISCOVERY_ORDER = [
  'O_03',
  'O_02',
  'O_01',
  'S_02',
  'O_04',
  'V_04',
  'V_05',
  'V_06',
  'O_05',
  'V_07',
  'V_08',
  'M_02',
  'C_01',
] as const;

const optionalPresentationKey = 'guidedDiscovery:lastOptionalAt';

export function visibleSparks(state: GameState): Spark[] {
  return state.sparks.filter((spark) => !spark.deferred);
}

/** Only the normal experience/recipe/tension evaluator may earn an intuition.
 * Its saved recipe survives the short cognitive event buffer while it waits. */
export function queueEarnedSpark(state: GameState, spark: Spark) {
  state.sparks.push(
    state.playMode === 'guided'
      ? { ...spark, deferred: true, earnedAt: state.time, expiresAt: 0 }
      : spark,
  );
}

function survivalRank(spark: Spark) {
  const rank = (SURVIVAL_DISCOVERY_ORDER as readonly string[]).indexOf(spark.wordId);
  return rank < 0 ? Infinity : rank;
}

function presentationRank(state: GameState, spark: Spark) {
  const rank = survivalRank(spark);
  return rank < Infinity
    ? rank
    : state.bornWords?.[spark.wordId] !== undefined
      ? SURVIVAL_DISCOVERY_ORDER.length
      : Infinity;
}

/** Present already earned intuitions; never grant words or transfer witnesses.
 * The two-card limit also bounds the drain after early optional spacing ends.
 * Existing visible save entries keep their original expiry and presentation. */
export function promoteDeferredSparks(state: GameState): void {
  if (state.playMode !== 'guided') return;
  const occupiedWords = new Set(visibleSparks(state).map((spark) => spark.wordId));
  state.sparks = state.sparks.filter((spark) => {
    if (!spark.deferred) return true;
    const witness = state.units.find((unit) => unit.id === spark.unitId);
    if (
      !Number.isFinite(spark.earnedAt) ||
      spark.earnedAt! < 0 ||
      spark.earnedAt! > state.time ||
      !witness ||
      witness.hp <= 0 ||
      witness.caste === 'slave' ||
      (witness.factionId && witness.factionId !== 'player') ||
      hasWord(state, spark.wordId) ||
      !validLearnedRecipe(spark.wordId, spark.recipe) ||
      occupiedWords.has(spark.wordId)
    )
      return false;
    occupiedWords.add(spark.wordId);
    return true;
  });

  const early = getCalendar(state).seasonIndex < GUIDED_DISCOVERY_PACING.earlySeasons;
  let visibleCount = visibleSparks(state).length;
  const pending = state.sparks
    .filter((spark) => spark.deferred)
    .sort(
      (left, right) =>
        presentationRank(state, left) - presentationRank(state, right) ||
        left.earnedAt! - right.earnedAt!,
    );
  for (const spark of pending) {
    if (visibleCount >= GUIDED_DISCOVERY_PACING.visibleLimit) break;
    const witness = state.units.find((unit) => unit.id === spark.unitId)!;
    if (
      !spark.recipe.every((id) => hasWord(state, id)) ||
      (witness.cooldowns?.[spark.wordId] ?? 0) > state.time ||
      (state.cooldowns[spark.wordId] ?? 0) > state.time
    )
      continue;
    const optional = presentationRank(state, spark) === Infinity;
    if (
      early &&
      optional &&
      state.time - (state.eventTimes[optionalPresentationKey] ?? -Infinity) <
        GUIDED_DISCOVERY_PACING.optionalInterval
    )
      continue;
    spark.deferred = false;
    spark.expiresAt = state.time + GUIDED_DISCOVERY_PACING.sparkLifetime;
    visibleCount++;
    if (optional) state.eventTimes[optionalPresentationKey] = state.time;
    log(state, `${witness.name} cerca un nome per un’esperienza nuova.`, 'discovery');
  }
}
