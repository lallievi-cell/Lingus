import { describe, expect, it } from 'vitest';
import { HOME, INNATE_WORDS } from './content';
import {
  createGame,
  issueCommand,
  parseGame,
  recallSpark,
  serializeGame,
  solveSpark,
  tick,
} from './engine';
import { canRecallSpark, recalledSparkTokens, wasWordLearned } from './knowledgeRecovery';
import { getPersonalDiscoveryProgress } from './personalDiscovery';
import { killUnit } from './simulation';
import type { GameState, Spark } from './types';

function rockSpark(state: GameState): Spark {
  const spark: Spark = {
    id: 'real-experience',
    wordId: 'O_02',
    unitId: state.units[0].id,
    eventLabel: 'Mani contro la roccia',
    hint: 'Colpire la roccia',
    recipe: ['V_03'],
    expiresAt: state.time + 45,
  };
  state.sparks = [spark];
  return spark;
}
function solvedAndLost() {
  let state = createGame(6842, 'guided');
  state.started = true;
  state.time = 5;
  const spark = rockSpark(state);
  state = solveSpark(state, spark.id, spark.recipe);
  state.words.O_02.retention = 0;
  state.words.O_02.custodians = [];
  state.units.forEach((unit) => (unit.knows = unit.knows.filter((id) => id !== 'O_02')));
  state.time = 10;
  return state;
}
function advance(state: GameState, seconds: number) {
  for (let left = seconds; left > 0; left -= 0.25) state = tick(state, Math.min(left, 0.25));
  return state;
}

describe('Guided rediscovery preserves player knowledge without granting tribal knowledge', () => {
  it('requires the full puzzle for a genuinely new word', () => {
    const state = createGame(6842, 'guided'),
      spark = rockSpark(state);
    expect(canRecallSpark(state, spark.id)).toBe(false);
    expect(recalledSparkTokens(state, spark.id)).toBeNull();
    expect(recallSpark(state, spark.id)).toBe(state);
    expect(solveSpark(state, spark.id, ['V_03']).words.O_02.learnedRecipe).toEqual(['V_03']);
  });
  it('requires a new experience and active spark after oral loss, then calls the ordinary solve', () => {
    const state = solvedAndLost();
    expect(wasWordLearned(state, 'O_02')).toBe(true);
    expect(canRecallSpark(state, 'missing')).toBe(false);
    const spark = rockSpark(state),
      before = structuredClone(state);
    expect(canRecallSpark(state, spark.id)).toBe(true);
    expect(state).toEqual(before);
    expect(recallSpark(state, spark.id)).toEqual(solveSpark(state, spark.id, spark.recipe));
    expect(recallSpark(state, spark.id).bornWords?.O_02).toBe(5);
  });
  it('keeps Classic rediscovery as a puzzle', () => {
    const state = solvedAndLost();
    state.playMode = 'classic';
    const spark = rockSpark(state);
    expect(canRecallSpark(state, spark.id)).toBe(false);
    expect(recallSpark(state, spark.id)).toBe(state);
  });
  it('does not invent solved history for words present only in a prepared memory object', () => {
    const state = createGame(6842, 'guided'),
      spark = rockSpark(state);
    state.words.O_02 = { retention: 0, custodians: [], uses: 0 };
    expect(canRecallSpark(state, spark.id)).toBe(false);
    state.words.O_02.learnedRecipe = ['V_14'];
    expect(canRecallSpark(state, spark.id)).toBe(false);
  });
  it('supports legacy saves with a recorded successful discovery timestamp', () => {
    const state = solvedAndLost();
    delete state.words.O_02.learnedRecipe;
    const spark = rockSpark(state);
    const loaded = parseGame(serializeGame(state));
    expect(loaded).not.toBeNull();
    expect(canRecallSpark(loaded!, spark.id)).toBe(true);
    delete state.bornWords;
    expect(canRecallSpark(state, spark.id)).toBe(false);
    expect(parseGame(serializeGame(state))).not.toBeNull();
  });
  it.each([
    'dead',
    'expired',
    'slave',
    'foreign',
    'already-known',
    'missing-prerequisite',
    'invented-recipe',
  ] as const)('cannot bypass %s constraints', (reason) => {
    const state = solvedAndLost(),
      spark = rockSpark(state);
    if (reason === 'dead') state.units[0].hp = 0;
    if (reason === 'expired') spark.expiresAt = state.time - 0.1;
    if (reason === 'slave') state.units[0].caste = 'slave';
    if (reason === 'foreign') state.units[0].factionId = 'other';
    if (reason === 'already-known') state.words.O_02.retention = 1;
    if (reason === 'missing-prerequisite') state.words.V_03.retention = 0;
    if (reason === 'invented-recipe') spark.recipe = ['V_01'];
    expect(canRecallSpark(state, spark.id)).toBe(false);
    expect(recallSpark(state, spark.id)).toBe(state);
  });
  it('round-trips actual solved recipes and rejects malformed or false recipe history', () => {
    const state = solvedAndLost();
    expect(parseGame(serializeGame(state))).not.toBeNull();
    for (const value of [
      [],
      ['no-word'],
      ['S_01', 'V_01'],
      ['V_03', 'V_03'],
      new Array(7).fill('V_03'),
    ]) {
      const invalid = structuredClone(state);
      invalid.words.O_02.learnedRecipe = value;
      expect(parseGame(serializeGame(invalid))).toBeNull();
    }
    const future = structuredClone(state);
    future.bornWords!.O_02 = future.time + 1;
    expect(parseGame(serializeGame(future))).toBeNull();
  });
  it('recovers after a real custodian death only when a real new work intuition is available', () => {
    let state = createGame(6842, 'guided');
    state.started = true;
    const first = state.entities.find((entity) => entity.kind === 'tree')!;
    state = issueCommand(state, ['S_01', 'V_03'], {
      type: 'entity',
      id: first.id,
      x: first.x,
      y: first.y,
    });
    for (let i = 0; i < 160 && !state.sparks.some((spark) => spark.wordId === 'O_03'); i++)
      state = tick(state, 0.25);
    const original = state.sparks.find((spark) => spark.wordId === 'O_03')!;
    expect(original).toBeDefined();
    state = solveSpark(state, original.id, original.recipe);
    const custodian = state.units.find((unit) => unit.id === original.unitId)!;
    killUnit(state, custodian, 'V_03');
    expect(state.words.O_03.retention).toBe(0);
    expect(canRecallSpark(state, original.id)).toBe(false);
    // Isolate a fresh physical experience from the earlier episode's cognitive buffer.
    for (const unit of state.units) {
      unit.eventMemory = unit.eventMemory?.filter((event) => !event.wordIds.includes('O_03'));
      if (unit.tension) delete unit.tension.O_03;
    }
    const next = state.entities.find(
      (entity) => entity.kind === 'tree' && entity.id !== first.id && entity.amount > 0,
    )!;
    const anchor = { type: 'point' as const, x: first.x, y: first.y };
    state = issueCommand(
      state,
      ['S_01', 'V_03'],
      { type: 'entity', id: next.id, x: next.x, y: next.y },
      undefined,
      anchor,
    );
    for (let i = 0; i < 200 && !state.sparks.some((spark) => spark.wordId === 'O_03'); i++)
      state = tick(state, 0.25);
    const rediscovery = state.sparks.find((spark) => spark.wordId === 'O_03')!;
    expect(rediscovery).toBeDefined();
    expect(rediscovery.id).not.toBe(original.id);
    expect(canRecallSpark(state, rediscovery.id)).toBe(true);
    const recovered = recallSpark(state, rediscovery.id);
    expect(recovered.words.O_03.retention).toBe(50);
    expect(recovered.words.O_03.custodians).toEqual([rediscovery.unitId]);
    expect(recovered.words.O_03.custodians).not.toContain(custodian.id);
    expect(parseGame(serializeGame(recovered))).not.toBeNull();
  });
});

describe('Io has a real early personal experience in Guided', () => {
  it('emerges from a normal group order and a spontaneous meal before Qui without isolation', () => {
    let state = createGame(6842, 'guided');
    state.started = true;
    const tree = state.entities.find((entity) => entity.kind === 'tree')!;
    state = issueCommand(state, ['S_01', 'V_03'], {
      type: 'entity',
      id: tree.id,
      x: tree.x,
      y: tree.y,
    });
    for (let i = 0; i < 240 && !state.sparks.some((spark) => spark.wordId === 'S_02'); i++)
      state = tick(state, 0.25);
    const spark = state.sparks.find((entry) => entry.wordId === 'S_02');
    expect(spark).toBeDefined();
    expect(state.time).toBeLessThan(60);
    expect(state.words.O_01).toBeUndefined();
    expect(state.units.every((unit) => unit.isolation < 30)).toBe(true);
    expect(spark!.eventLabel).toContain('nutrirsi');
    expect(spark!.recipe).toEqual(['S_01']);
    expect(getPersonalDiscoveryProgress(state)).toMatchObject({ ready: true, sparkId: spark!.id });
    expect(state.words.S_02).toBeUndefined();
    state = solveSpark(state, spark!.id, ['S_01']);
    expect(state.words.S_02.custodians).toContain(spark!.unitId);
    expect(getPersonalDiscoveryProgress(state)).toBeNull();
    expect(parseGame(serializeGame(state))).not.toBeNull();
  });
  it('does not turn explicit group meals or passive idle time into personal initiative', () => {
    let state = createGame(6842, 'guided');
    state.started = true;
    const berries = state.entities.find((entity) => entity.kind === 'berries')!;
    state = issueCommand(state, ['S_01', 'V_02'], {
      type: 'entity',
      id: berries.id,
      x: berries.x,
      y: berries.y,
    });
    state = advance(state, 10);
    expect(state.sparks.some((spark) => spark.wordId === 'S_02')).toBe(false);
    expect(state.units.every((unit) => (unit.tension?.S_02 ?? 0) === 0)).toBe(true);
  });
  it('retains Classic isolation discovery without the new experience producer', () => {
    let state = createGame(6842, 'classic');
    state.started = true;
    const tree = state.entities.find((entity) => entity.kind === 'tree')!;
    state = issueCommand(state, ['S_01', 'V_03'], {
      type: 'entity',
      id: tree.id,
      x: tree.x,
      y: tree.y,
    });
    state = advance(state, 55);
    expect(state.sparks.some((spark) => spark.wordId === 'S_02')).toBe(false);
    expect(state.units.every((unit) => (unit.tension?.S_02 ?? 0) === 0)).toBe(true);
  });
  it('counts actual single-artisan craft completions as a fallback without granting the word', () => {
    let state = createGame(6842, 'guided');
    state.started = true;
    state.tier = 1;
    for (const id of ['V_06', 'O_02'])
      state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
    state.resources.stone = 5;
    state.units = state.units.slice(0, 1);
    state.units[0].knows = [...INNATE_WORDS, 'V_06', 'O_02'];
    Object.assign(state.units[0], { ...HOME, hunger: 0, temp: 100 });
    state = issueCommand(state, ['S_01', 'V_06', 'O_02']);
    state = advance(state, 16);
    expect(state.resources.tool).toBeGreaterThanOrEqual(3);
    expect(state.sparks.some((spark) => spark.wordId === 'S_02')).toBe(true);
    expect(state.words.S_02).toBeUndefined();
  });
});
