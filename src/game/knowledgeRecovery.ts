import { INNATE_WORDS, WORDS } from './content';
import { hasWord } from './runtime';
import type { GameState, Spark } from './types';

const sameRecipe = (left: readonly string[], right: readonly string[]) => {
  const a = [...left].sort(),
    b = [...right].sort();
  return a.length === b.length && a.every((token, i) => token === b[i]);
};

/** A historical successful solve is player knowledge, separate from oral retention.
 * bornWords supplies the same evidence in saves written before learnedRecipe existed. */
export function wasWordLearned(state: GameState, wordId: string) {
  const memory = state.words[wordId];
  const bornAt = state.bornWords?.[wordId];
  return (
    !!memory &&
    !INNATE_WORDS.includes(wordId) &&
    (validLearnedRecipe(wordId, memory.learnedRecipe) ||
      (typeof bornAt === 'number' &&
        Number.isFinite(bornAt) &&
        bornAt >= 0 &&
        bornAt <= state.time))
  );
}

function legitimateRecipe(state: GameState, spark: Spark) {
  const word = WORDS[spark.wordId];
  if (!word || !spark.recipe.length || spark.recipe.length > 6) return false;
  const alternatives = [word.recipe, ...(word.alternatives ?? [])];
  if (spark.wordId === 'M_03' && state.playMode === 'guided') alternatives.push(['O_06', 'O_01']);
  return alternatives.some((recipe) => sameRecipe(recipe, spark.recipe));
}

export function validLearnedRecipe(wordId: string, value: unknown): value is string[] {
  if (
    !WORDS[wordId] ||
    INNATE_WORDS.includes(wordId) ||
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 6 ||
    value.some((token) => typeof token !== 'string' || !WORDS[token])
  )
    return false;
  const recipes = [WORDS[wordId].recipe, ...(WORDS[wordId].alternatives ?? [])];
  if (wordId === 'M_03') recipes.push(['O_06', 'O_01']);
  return recipes.some((recipe) => sameRecipe(recipe, value));
}

/** Requires a fresh real intuition; this is never a restore-from-dictionary action. */
export function canRecallSpark(state: GameState, id: string): boolean {
  const spark = state.sparks.find((entry) => entry.id === id);
  if (
    state.playMode !== 'guided' ||
    state.gameOver ||
    state.victory ||
    !spark ||
    spark.expiresAt < state.time ||
    hasWord(state, spark.wordId)
  )
    return false;
  const witness = state.units.find((unit) => unit.id === spark.unitId);
  return (
    !!witness &&
    witness.hp > 0 &&
    witness.caste !== 'slave' &&
    (!witness.factionId || witness.factionId === 'player') &&
    state.words[spark.wordId]?.retention === 0 &&
    wasWordLearned(state, spark.wordId) &&
    legitimateRecipe(state, spark) &&
    spark.recipe.every((token) => hasWord(state, token))
  );
}

export function recalledSparkTokens(state: GameState, id: string): string[] | null {
  return canRecallSpark(state, id)
    ? [...state.sparks.find((spark) => spark.id === id)!.recipe]
    : null;
}
