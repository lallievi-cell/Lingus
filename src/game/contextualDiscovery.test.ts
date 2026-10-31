import { describe, expect, it } from 'vitest';
import {
  CONTEXTUAL_WORDS,
  contextualDiscoveryKey,
  newContextualDiscoveries,
} from './contextualDiscovery';
import { createGame, hasWord, issueCommand, resolveContextualDiscoveries, tick } from './engine';
import { evaluateDiscoveries, killUnit, recordEvent, resetUnit } from './simulation';
import { GameAudioEvents } from '../audio/gameAudio';
import { allAdultsAnchor } from './tribeSelection';
import type { GameState } from './types';

function running(mode: 'guided' | 'classic' = 'guided') {
  return { ...createGame(6842, mode), started: true };
}

function work(state: GameState, kind: 'tree' | 'stone') {
  const entity = state.entities.find((entry) => entry.kind === kind && entry.amount > 0)!;
  return issueCommand(
    state,
    ['S_01', 'V_03'],
    { type: 'entity', id: entity.id, x: entity.x, y: entity.y },
    undefined,
    allAdultsAnchor(state),
  );
}

function until(state: GameState, condition: (state: GameState) => boolean, seconds = 60) {
  for (let time = 0; time < seconds && !condition(state); time += 0.25) state = tick(state, 0.25);
  return state;
}

/** Public experience producers isolate validation cases from travel and hunger. */
function witnessedDanger() {
  const state = running();
  state.time = 10;
  const witness = state.units.find((unit) => unit.name === 'Uma')!;
  recordEvent(state, witness, 'ENV_ALLY_DAMAGED', 60, ['M_01']);
  state.time = 11;
  recordEvent(state, witness, 'ENV_ALLY_DAMAGED', 60, ['M_01']);
  evaluateDiscoveries(state, witness);
  return { state, witness, spark: state.sparks.find((entry) => entry.wordId === 'M_01')! };
}

describe('contextual elementary discoveries in the new Guided opening', () => {
  it('does not grant materials, danger or custody merely by starting or waiting', () => {
    const initial = running();
    expect(initial.openingBalanceVersion).toBe(1);
    expect(CONTEXTUAL_WORDS.every((id) => !hasWord(initial, id))).toBe(true);
    const state = until(initial, () => false, 30);
    expect(CONTEXTUAL_WORDS.every((id) => !hasWord(state, id))).toBe(true);
    expect(resolveContextualDiscoveries(state)).toEqual([]);
  });

  it.each([
    ['tree', 'O_03', 'ENV_TREE_NODE'],
    ['stone', 'O_02', 'ENV_ROCK_NODE'],
  ] as const)(
    'learns from real %s work and keeps the physical extraction separate from stocks',
    (kind, id, tag) => {
      const initial = running();
      let state = work(initial, kind);
      expect(state.stats.commands).toBe(1);
      expect(state.voice).toBe(2);
      state = until(state, (next) => hasWord(next, id));
      expect(hasWord(state, id)).toBe(true);
      expect(state.sparks.some((spark) => spark.wordId === id)).toBe(false);
      const memory = state.words[id],
        custodian = state.units.find((unit) => unit.id === memory.custodians[0])!;
      expect(memory.custodians).toHaveLength(1);
      expect(custodian.hp).toBeGreaterThan(0);
      expect(custodian.knows).toContain(id);
      expect(custodian.eventMemory?.some((event) => event.tag === tag)).toBe(true);
      expect(memory.learnedRecipe).toEqual(['V_03']);
      expect(state.eventTimes[contextualDiscoveryKey(id)]).toBe(state.bornWords![id]);
      expect(state.resources[kind === 'tree' ? 'wood' : 'stone']).toBe(0);
      expect(state.entities.some((entity) => entity.kind === 'ground' && entity.amount > 0)).toBe(
        true,
      );
      expect(state.paused).toBe(false);
      const count = state.stats.discoveries;
      expect(resolveContextualDiscoveries(state)).toEqual([]);
      expect(state.stats.discoveries).toBe(count);
    },
  );

  it.each(['classic', 'legacy-guided'] as const)(
    'keeps %s material discovery as a puzzle',
    (mode) => {
      const initial = running(mode === 'classic' ? 'classic' : 'guided');
      delete initial.openingBalanceVersion;
      const state = until(work(initial, 'tree'), (next) =>
        next.sparks.some((spark) => spark.wordId === 'O_03'),
      );
      expect(state.sparks.some((spark) => spark.wordId === 'O_03')).toBe(true);
      expect(hasWord(state, 'O_03')).toBe(false);
      expect(resolveContextualDiscoveries(state)).toEqual([]);
    },
  );

  it('lets a real danger witness name the threat without repeating the strike puzzle', () => {
    const { state, witness, spark } = witnessedDanger();
    expect(spark).toBeDefined();
    expect(resolveContextualDiscoveries(state)).toEqual(['M_01']);
    expect(state.words.M_01.custodians).toEqual([witness.id]);
    expect(state.words.M_01.learnedRecipe).toEqual(['V_03']);
  });

  it.each([
    'dead',
    'foreign',
    'slave',
    'expired',
    'no-experience',
    'weak-experience',
    'wrong-experience',
    'wrong-recipe',
    'unknown-prerequisite',
    'paused',
  ] as const)('cannot automatically learn from %s', (reason) => {
    const { state, witness, spark } = witnessedDanger();
    if (reason === 'dead') witness.hp = 0;
    if (reason === 'foreign') witness.factionId = 'foreign';
    if (reason === 'slave') witness.caste = 'slave';
    if (reason === 'expired') spark.expiresAt = state.time - 0.1;
    if (reason === 'no-experience') witness.eventMemory = [];
    if (reason === 'weak-experience') witness.eventMemory!.forEach((event) => (event.weight = 1));
    if (reason === 'wrong-experience')
      witness.eventMemory!.forEach((event) => (event.tag = 'ENV_TREE_NODE'));
    if (reason === 'wrong-recipe') spark.recipe = ['V_01'];
    if (reason === 'unknown-prerequisite') state.words.V_03.retention = 0;
    if (reason === 'paused') state.paused = true;
    expect(resolveContextualDiscoveries(state)).toEqual([]);
    expect(hasWord(state, 'M_01')).toBe(false);
  });

  it('requires a new physical experience after the last custodian dies', () => {
    let state = until(work(running(), 'tree'), (next) => hasWord(next, 'O_03'));
    const memory = state.words.O_03,
      teacher = state.units.find((unit) => unit.id === memory.custodians[0])!;
    const firstLearned = state.bornWords!.O_03;
    killUnit(state, teacher, 'V_03');
    state.units.forEach(resetUnit);
    expect(hasWord(state, 'O_03')).toBe(false);
    state = until(state, () => false, 1);
    expect(hasWord(state, 'O_03')).toBe(false);
    const previous = structuredClone(state);
    state = work(state, 'tree');
    state = until(state, (next) => hasWord(next, 'O_03'));
    expect(hasWord(state, 'O_03')).toBe(true);
    expect(state.words.O_03.custodians).not.toContain(teacher.id);
    expect(state.bornWords!.O_03).toBe(firstLearned);
    expect(state.eventTimes[contextualDiscoveryKey('O_03')]).toBeGreaterThan(firstLearned);
    expect(newContextualDiscoveries(previous, state)).toContain('O_03');
  });

  it('keeps philosophical and compound discoveries as real puzzles', () => {
    const state = running(),
      witness = state.units.find((unit) => unit.name === 'Uma')!;
    state.time = 10;
    recordEvent(state, witness, 'ENV_ISOLATION', 100, ['S_02']);
    evaluateDiscoveries(state, witness);
    expect(state.sparks.some((spark) => spark.wordId === 'S_02')).toBe(true);
    expect(resolveContextualDiscoveries(state)).toEqual([]);
    expect(hasWord(state, 'S_02')).toBe(false);
  });

  it('emits one fresh visible and audible discovery without replaying saved history', () => {
    const { state } = witnessedDanger(),
      previous = structuredClone(state),
      audio = new GameAudioEvents();
    audio.observe(previous, true);
    resolveContextualDiscoveries(state);
    expect(newContextualDiscoveries(previous, state)).toEqual(['M_01']);
    expect(newContextualDiscoveries(state, state)).toEqual([]);
    expect(audio.observe(state, true)).toContain('spark');
    expect(audio.observe(state, true)).toEqual([]);
    expect(new GameAudioEvents().observe(state, true)).toEqual([]);
  });
});
