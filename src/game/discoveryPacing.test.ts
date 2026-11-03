import { describe, expect, it } from 'vitest';
import { seasonStart } from './calendar';
import { createGame, hasWord, parseGame, serializeGame, solveSpark, tick } from './engine';
import { promoteDeferredSparks, visibleSparks } from './discoveryPacing';
import { evaluateDiscoveries, recordEvent, simulationStep } from './simulation';
import type { GameState } from './types';

function running(mode: 'guided' | 'classic' = 'guided') {
  const state = createGame(6842, mode);
  state.started = true;
  state.time = 10;
  state.units = [state.units.find((unit) => unit.name === 'Uma')!];
  state.units[0].intelligence = 10;
  state.entities = [];
  state.cities = [];
  state.factions = [];
  return state;
}

function know(state: GameState, ...ids: string[]) {
  for (const id of ids) {
    state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
    state.units[0].knows.push(id);
  }
}

const experienceTags: Record<string, string> = {
  O_03: 'ENV_TREE_NODE',
  O_02: 'ENV_ROCK_NODE',
  O_01: 'ENV_SLEEP_CLUSTER',
  S_02: 'ENV_ISOLATION',
  M_01: 'ENV_ALLY_DAMAGED',
  O_04: 'ENV_HUNT_MEAL',
  O_06: 'ENV_CORPSE',
  V_09: 'ENV_SEED_SPROUT',
  C_01: 'ENV_NIGHTFALL',
};

function earn(state: GameState, ...ids: string[]) {
  const witness = state.units[0];
  for (const id of ids) recordEvent(state, witness, experienceTags[id] ?? 'ENV_CRAFT', 100, [id]);
  evaluateDiscoveries(state, witness);
}

function queuedDanger() {
  const state = running();
  earn(state, 'O_03', 'O_02', 'M_01');
  return { state, spark: state.sparks.find((entry) => entry.wordId === 'M_01')! };
}

describe('Guided discovery presentation follows genuinely earned experiences', () => {
  it('does not produce a queued or visible word from elapsed time alone', () => {
    const state = running();
    state.time = seasonStart(state, 9);
    evaluateDiscoveries(state, state.units[0]);
    promoteDeferredSparks(state);
    expect(state.sparks).toEqual([]);
    expect(hasWord(state, 'O_03')).toBe(false);
  });

  it('prioritizes the survival chain and preserves every other earned intuition', () => {
    const state = running();
    earn(state, 'S_02', 'O_01', 'O_02', 'O_03', 'M_01');
    expect(visibleSparks(state).map((spark) => spark.wordId)).toEqual(['O_02', 'O_03']);
    expect(state.sparks.filter((spark) => spark.deferred).map((spark) => spark.wordId)).toEqual([
      'S_02',
      'O_01',
      'M_01',
    ]);
    expect(state.sparks.every((spark) => spark.earnedAt === 10)).toBe(true);
    expect(state.logs.filter((entry) => entry.tone === 'discovery')).toHaveLength(2);
    evaluateDiscoveries(state, state.units[0]);
    expect(state.sparks).toHaveLength(5);
  });

  it('keeps the earned witness and recipe after event decay and starts expiry on promotion', () => {
    const { state, spark } = queuedDanger();
    visibleSparks(state).forEach((entry) => (entry.expiresAt = 1000));
    state.time = 80;
    recordEvent(state, state.units[0], 'ENV_CRAFT', 0, []);
    simulationStep(state, 0);
    expect(state.units[0].eventMemory?.some((event) => event.wordIds.includes('M_01'))).toBe(false);
    expect(state.sparks.find((entry) => entry.id === spark.id)?.deferred).toBe(true);
    state.sparks = state.sparks.filter((entry) => entry.deferred);
    promoteDeferredSparks(state);
    expect(spark).toMatchObject({ deferred: false, earnedAt: 10, expiresAt: 125 });
    expect(spark.recipe).toEqual(['V_03']);
    expect(spark.unitId).toBe(state.units[0].id);
    expect(hasWord(state, 'M_01')).toBe(false);
    expect(hasWord(solveSpark(state, spark.id, spark.recipe), 'M_01')).toBe(true);
  });

  it('spaces optional meanings by simulation seconds while survival bypasses that delay', () => {
    const state = running();
    know(state, 'S_02', 'V_05', 'M_02');
    earn(state, 'M_01', 'O_06', 'V_09');
    expect(visibleSparks(state).map((spark) => spark.wordId)).toEqual(['M_01']);
    state.time = 34.99;
    promoteDeferredSparks(state);
    expect(visibleSparks(state)).toHaveLength(1);
    earn(state, 'O_03');
    expect(visibleSparks(state).map((spark) => spark.wordId)).toEqual(['M_01', 'O_03']);
    state.sparks = state.sparks.filter((spark) => spark.wordId !== 'O_03');
    state.time = 35;
    promoteDeferredSparks(state);
    expect(visibleSparks(state).map((spark) => spark.wordId)).toEqual(['M_01', 'O_06']);
    expect(state.sparks.find((spark) => spark.wordId === 'V_09')?.deferred).toBe(true);
  });

  it('keeps food, conservation and shelter available during optional spacing', () => {
    const state = running();
    know(state, 'O_01', 'O_03', 'V_04', 'M_02');
    earn(state, 'M_01');
    earn(state, 'O_04', 'V_05', 'V_08');
    expect(visibleSparks(state).map((spark) => spark.wordId)).toEqual(['M_01', 'O_04']);
    state.sparks = state.sparks.filter((spark) => spark.deferred);
    promoteDeferredSparks(state);
    expect(visibleSparks(state).map((spark) => spark.wordId)).toEqual(['V_05', 'V_08']);
    expect(state.time).toBe(10);
  });

  it('removes the early optional delay at season eight and drains at most two at a time', () => {
    const state = running();
    know(state, 'S_02', 'V_05', 'M_02');
    state.time = seasonStart(state, 8) - 1;
    earn(state, 'M_01', 'O_06', 'V_09');
    expect(visibleSparks(state)).toHaveLength(1);
    state.time = seasonStart(state, 8);
    promoteDeferredSparks(state);
    expect(visibleSparks(state)).toHaveLength(2);
    expect(state.sparks.filter((spark) => spark.deferred)).toHaveLength(1);
    state.sparks = state.sparks.filter((spark) => spark.deferred);
    promoteDeferredSparks(state);
    expect(visibleSparks(state).map((spark) => spark.wordId)).toEqual(['V_09']);
  });

  it('lets a genuinely earned rediscovery bypass new-word spacing while respecting two slots', () => {
    let state = running();
    earn(state, 'M_01');
    const first = visibleSparks(state)[0];
    state = solveSpark(state, first.id, first.recipe);
    expect(state.bornWords?.M_01).toBe(10);
    state.words.M_01.retention = 0;
    state.units[0].eventMemory = [];
    know(state, 'S_02');
    earn(state, 'O_03', 'O_02', 'O_06', 'M_01');
    expect(visibleSparks(state)).toHaveLength(2);
    const rediscovery = state.sparks.find((spark) => spark.wordId === 'M_01')!;
    expect(rediscovery.deferred).toBe(true);
    state.sparks = state.sparks.filter((spark) => spark.deferred);
    promoteDeferredSparks(state);
    expect(rediscovery.deferred).toBe(false);
    expect(visibleSparks(state).map((spark) => spark.wordId)).toEqual(['M_01']);
    expect(hasWord(state, 'M_01')).toBe(false);
    state = solveSpark(state, rediscovery.id, rediscovery.recipe);
    expect(hasWord(state, 'M_01')).toBe(true);
    expect(state.bornWords?.M_01).toBe(10);
  });

  it.each(['dead', 'foreign', 'slave', 'known', 'bad-recipe', 'missing-earned-at'] as const)(
    'rejects a queued intuition whose original witness or evidence is %s',
    (reason) => {
      const { state, spark } = queuedDanger();
      state.sparks = [spark];
      if (reason === 'dead') state.units[0].hp = 0;
      if (reason === 'foreign') state.units[0].factionId = 'foreign';
      if (reason === 'slave') state.units[0].caste = 'slave';
      if (reason === 'known') know(state, 'M_01');
      if (reason === 'bad-recipe') spark.recipe = ['S_01'];
      if (reason === 'missing-earned-at') delete spark.earnedAt;
      promoteDeferredSparks(state);
      expect(state.sparks).toEqual([]);
      expect(state.stats.discoveries).toBe(0);
    },
  );

  it('waits for the earned recipe and both cooldowns without losing the intuition', () => {
    const { state, spark } = queuedDanger();
    state.sparks = [spark];
    state.words.V_03.retention = 0;
    promoteDeferredSparks(state);
    expect(spark.deferred).toBe(true);
    state.words.V_03.retention = 100;
    state.units[0].cooldowns!.M_01 = 20;
    state.cooldowns.M_01 = 30;
    state.time = 20;
    promoteDeferredSparks(state);
    expect(spark.deferred).toBe(true);
    state.time = 30;
    promoteDeferredSparks(state);
    expect(spark.deferred).toBe(false);
  });

  it('cannot solve a queued intuition or earn again through another witness cooldown', () => {
    const { state, spark } = queuedDanger();
    expect(hasWord(solveSpark(state, spark.id, spark.recipe), 'M_01')).toBe(false);
    state.sparks = [];
    state.cooldowns.M_01 = 25;
    earn(state, 'M_01');
    expect(state.sparks.some((entry) => entry.wordId === 'M_01')).toBe(false);
    state.time = 25;
    earn(state, 'M_01');
    expect(state.sparks.filter((entry) => entry.wordId === 'M_01')).toHaveLength(1);
  });

  it('preserves queued evidence and the optional interval across a save round trip', () => {
    const state = running();
    know(state, 'S_02');
    earn(state, 'M_01', 'O_06');
    const loaded = parseGame(serializeGame(state))!;
    expect(loaded).not.toBeNull();
    expect(loaded.sparks).toEqual(state.sparks);
    loaded.time = 34;
    promoteDeferredSparks(loaded);
    expect(visibleSparks(loaded)).toHaveLength(1);
    loaded.time = 35;
    promoteDeferredSparks(loaded);
    expect(visibleSparks(loaded)).toHaveLength(2);
  });

  it('keeps Classic presentation and old visible Guided save entries unchanged', () => {
    const classic = running('classic');
    earn(classic, 'S_02', 'O_01', 'O_02', 'O_03', 'M_01');
    expect(visibleSparks(classic)).toHaveLength(5);
    expect(classic.sparks.every((spark) => spark.deferred === undefined)).toBe(true);
    expect(classic.sparks.every((spark) => spark.expiresAt === 55)).toBe(true);
    classic.playMode = 'guided';
    const legacy = structuredClone(classic.sparks);
    promoteDeferredSparks(classic);
    expect(classic.sparks).toEqual(legacy);
  });

  it('promotes a waiting optional intuition through the ordinary public tick', () => {
    let state = running();
    know(state, 'S_02');
    earn(state, 'M_01', 'O_06');
    state = solveSpark(state, visibleSparks(state)[0].id, ['V_03']);
    state.time = 35;
    state = tick(state, 0.25);
    expect(state.sparks.find((spark) => spark.wordId === 'O_06')?.deferred).toBe(false);
    expect(hasWord(state, 'O_06')).toBe(false);
  });
});
