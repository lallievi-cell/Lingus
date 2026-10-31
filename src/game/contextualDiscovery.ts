import { WORDS } from './content';
import { getDogmaEffects } from './dogmas';
import { cognitiveTension } from './math';
import { hasWord } from './runtime';
import type { GameState, Spark } from './types';

/** These first concrete meanings share the same one-token puzzle. Their real
 * experience still has to mature; only the repeated confirmation is removed. */
export const CONTEXTUAL_WORDS = ['O_03', 'O_02', 'M_01'] as const;
const experienceTags: Record<string, string> = {
  O_03: 'ENV_TREE_NODE',
  O_02: 'ENV_ROCK_NODE',
  M_01: 'ENV_ALLY_DAMAGED',
};

export function contextualDiscoveryKey(wordId: string) {
  return `contextualDiscovery:${wordId}`;
}

export function contextualSparkWitness(state: GameState, spark: Spark) {
  if (
    state.playMode !== 'guided' ||
    state.openingBalanceVersion !== 1 ||
    !state.started ||
    state.paused ||
    state.gameOver ||
    state.victory ||
    !(CONTEXTUAL_WORDS as readonly string[]).includes(spark.wordId) ||
    spark.expiresAt < state.time ||
    hasWord(state, spark.wordId) ||
    !state.sparks.some((entry) => entry.id === spark.id) ||
    spark.recipe.length !== WORDS[spark.wordId].recipe.length ||
    spark.recipe.some((id, index) => id !== WORDS[spark.wordId].recipe[index]) ||
    !spark.recipe.every((id) => hasWord(state, id))
  )
    return undefined;
  const witness = state.units.find((unit) => unit.id === spark.unitId);
  const lostAt = (state.tribeEvents ?? []).reduce(
    (latest, event) =>
      event.kind === 'word-lost' && event.wordId === spark.wordId
        ? Math.max(latest, event.time)
        : latest,
    -Infinity,
  );
  if (
    !witness ||
    witness.hp <= 0 ||
    witness.caste === 'slave' ||
    (witness.factionId && witness.factionId !== 'player') ||
    !witness.eventMemory?.some(
      (event) =>
        event.tag === experienceTags[spark.wordId] &&
        event.wordIds.includes(spark.wordId) &&
        event.time > lostAt &&
        event.time <= state.time &&
        state.time - event.time <= 60 &&
        event.weight > 0,
    )
  )
    return undefined;
  const tension =
    cognitiveTension(witness.eventMemory, witness.intelligence, state.time) *
      getDogmaEffects(state, { unit: witness }).cognitive +
    (witness.tension?.[spark.wordId] ?? 0);
  return tension + 1e-7 >= 100 ? witness : undefined;
}

/** UI observation consumes only newly completed experiences. Loading a save or
 * replacing the session must establish a new snapshot instead of replaying it. */
export function newContextualDiscoveries(previous: GameState, next: GameState): string[] {
  if (next.playMode !== 'guided' || next.openingBalanceVersion !== 1 || next.time < previous.time)
    return [];
  return CONTEXTUAL_WORDS.filter((id) => {
    const key = contextualDiscoveryKey(id),
      at = next.eventTimes[key];
    return (
      typeof at === 'number' &&
      at >= previous.time &&
      at <= next.time &&
      at !== previous.eventTimes[key] &&
      !hasWord(previous, id) &&
      hasWord(next, id)
    );
  });
}
