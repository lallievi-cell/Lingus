import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, WORD_ORDER } from './content';
import { createGame } from './engine';
import { compileSentence } from './grammar';
import {
  getSyntaxSuggestions,
  phraseRecallIssue,
  RECENT_PHRASE_LIMIT,
  rememberRecentPhrase,
} from './syntaxAssistant';

function lateGame() {
  const state = createGame(6842);
  state.tier = 5;
  for (const id of WORD_ORDER) state.words[id] = { retention: 100, custodians: [], uses: 0 };
  state.buildings.push({
    id: 'palace',
    kind: 'palace',
    x: 250,
    y: 250,
    active: true,
    hp: BUILDING_SPECS.palace.maxHp,
  });
  return state;
}

describe('syntax guidance uses known words and current capacity', () => {
  it('starts with known subjects or conditions, then the correct role after a condition', () => {
    const initial = createGame(6842);
    expect(getSyntaxSuggestions(initial, []).tokenIds).toEqual(['S_01']);
    expect(getSyntaxSuggestions(initial, ['S_01']).tokenIds).toContain('V_03');
    const state = lateGame();
    expect(getSyntaxSuggestions(state, []).tokenIds).toEqual(
      expect.arrayContaining(['S_01', 'C_01', 'C_02']),
    );
    expect(getSyntaxSuggestions(state, ['C_02']).tokenIds.every((id) => id.startsWith('S_'))).toBe(
      true,
    );
    // In the late game Conquistare can form a law even with an ordinary caste.
    expect(getSyntaxSuggestions(state, ['S_01']).lawOnlyTokenIds).toContain('V_13');
    state.words.C_03.retention = 0;
    expect(getSyntaxSuggestions(state, ['S_01']).tokenIds).not.toContain('V_13');
    expect(getSyntaxSuggestions(state, ['S_08']).tokenIds).toContain('V_13');
  });

  it('continues real known building recipes without exposing a forgotten blueprint or overlong construction', () => {
    const state = lateGame();
    expect(getSyntaxSuggestions(state, ['S_01', 'V_08']).tokenIds).toEqual(
      expect.arrayContaining(['O_02', 'O_03', 'O_12', 'O_13']),
    );
    const prefix = ['S_01', 'V_08', 'O_02'];
    expect(getSyntaxSuggestions(state, prefix).tokenIds).toContain('O_09');
    expect(compileSentence(state, [...prefix, 'O_09']).buildingKind).toBe('archive');
    state.words.O_09.retention = 0;
    expect(getSyntaxSuggestions(state, prefix).tokenIds).not.toContain('O_09');
    state.tier = 1;
    expect(getSyntaxSuggestions(state, ['S_01', 'V_08']).tokenIds).toEqual([]);
  });

  it('completes the six-slot law, including a repeated known sanction, without promising it fits a locked slot', () => {
    const state = lateGame();
    const duty = ['S_01', 'V_04', 'O_12', 'O_08'];
    expect(getSyntaxSuggestions(state, duty.slice(0, 3)).tokenIds).toContain('O_08');
    expect(getSyntaxSuggestions(state, duty).tokenIds).toContain('C_03');
    expect(getSyntaxSuggestions(state, [...duty, 'C_03']).tokenIds).toContain('O_12');
    expect(compileSentence(state, [...duty, 'C_03', 'O_12']).kind).toBe('law');
    state.lockedSlot = true;
    expect(getSyntaxSuggestions(state, duty).tokenIds).not.toContain('C_03');
    expect(getSyntaxSuggestions(state, [...duty, 'C_03']).tokenIds).toEqual([]);
  });

  it('avoids a final argument which cannot complete cooking, and leaves full phrases without another suggestion', () => {
    const state = lateGame();
    state.tier = 1;
    expect(getSyntaxSuggestions(state, ['S_01', 'V_07']).tokenIds).toEqual([]);
    state.tier = 2;
    expect(getSyntaxSuggestions(state, ['S_01', 'V_07']).tokenIds).toEqual(
      expect.arrayContaining(['O_04', 'O_05']),
    );
    expect(getSyntaxSuggestions(state, ['S_01', 'V_07', 'O_04']).tokenIds).toEqual(['O_05']);
    expect(getSyntaxSuggestions(state, ['S_01', 'V_07', 'O_04', 'O_05']).tokenIds).toEqual([]);
    expect(getSyntaxSuggestions(state, ['S_01', 'V_09', 'O_03']).tokenIds).toEqual([]);
  });

  it('retains explicit exceptions for emancipation and sacred elder rule', () => {
    const state = lateGame();
    expect(getSyntaxSuggestions(state, ['C_02', 'S_01']).tokenIds).toContain('M_05');
    expect(getSyntaxSuggestions(state, ['S_04', 'C_02']).tokenIds).toContain('M_04');
    expect(compileSentence(state, ['C_02', 'S_01', 'M_05']).valid).toBe(true);
    expect(compileSentence(state, ['S_04', 'C_02', 'M_04']).valid).toBe(true);
  });

  it('keeps valid sacred paths reachable through compatible tokens from the first slot', () => {
    const state = lateGame();
    for (const phrase of [
      ['O_02', 'M_03', 'M_04'],
      ['V_03', 'M_03', 'M_01'],
      ['S_04', 'M_03', 'S_07'],
      ['M_03', 'O_05', 'S_04'],
      ['O_02', 'M_04', 'M_03'],
      ['S_04', 'C_02', 'M_04'],
    ]) {
      const compiled = compileSentence(state, phrase);
      expect(compiled.valid, phrase.join('|')).toBe(true);
      expect(compiled.kind).toBe('dogma');
      for (let slot = 0; slot < phrase.length; slot++)
        expect(getSyntaxSuggestions(state, phrase.slice(0, slot)).tokenIds).toContain(phrase[slot]);
      expect(getSyntaxSuggestions(state, phrase).tokenIds).toEqual([]);
    }
  });

  it('does not recommend sacred continuations with unknown concepts, insufficient slots or conflicting dogmas', () => {
    const state = lateGame();
    state.dogmas.push({
      id: 'private-stone',
      targetId: 'O_02',
      vectorId: 'M_04',
      age: 0,
      weight: 10,
      name: 'Private stone',
      description: '',
    });
    expect(compileSentence(state, ['O_02', 'M_03', 'S_01']).valid).toBe(false);
    expect(getSyntaxSuggestions(state, ['O_02', 'M_03']).tokenIds).not.toContain('S_01');
    state.words.M_03.retention = 0;
    expect(getSyntaxSuggestions(state, []).tokenIds).not.toContain('O_02');
    expect(getSyntaxSuggestions(state, ['S_04']).tokenIds).not.toContain('C_02');
    state.words.M_03.retention = 100;
    state.words.M_04.retention = 0;
    expect(getSyntaxSuggestions(state, ['S_04', 'C_02']).tokenIds).not.toContain('M_04');
    state.tier = 1;
    state.lockedSlot = true;
    expect(getSyntaxSuggestions(state, []).tokenIds).not.toContain('M_03');
  });
});

describe('contextual palette preserves complete grammatical paths', () => {
  function expectReachable(state: ReturnType<typeof lateGame>, phrase: string[]) {
    for (let slot = 0; slot < phrase.length; slot++) {
      const prefix = phrase.slice(0, slot);
      expect(
        getSyntaxSuggestions(state, prefix).tokenIds,
        `${prefix.join(' · ')} → ${phrase[slot]}`,
      ).toContain(phrase[slot]);
    }
    expect(getSyntaxSuggestions(state, phrase).isComplete, phrase.join(' · ')).toBe(true);
  }

  it('keeps every known building recipe reachable with ordinary and permanent subjects', () => {
    const state = lateGame();
    for (const [kind, spec] of Object.entries(BUILDING_SPECS)) {
      if (kind === 'campfire') continue;
      expectReachable(state, ['S_01', ...spec.recipe]);
      expectReachable(state, ['C_02', 'S_01', ...spec.recipe]);
    }
    expectReachable(state, ['S_01', 'V_05', 'O_05']);
  });

  it('preserves ordinary actions, destination modifiers, cooking permutations and imperial modes', () => {
    const state = lateGame();
    for (const phrase of [
      ['S_01', 'V_01'],
      ['S_01', 'V_02'],
      ['S_01', 'V_03'],
      ['S_01', 'V_04', 'O_03', 'O_01'],
      ['S_01', 'V_06', 'O_02', 'O_03'],
      ['S_01', 'V_07', 'O_04', 'O_05'],
      ['S_01', 'V_07', 'O_05', 'O_02'],
      ['S_01', 'V_09', 'O_03'],
      ['S_01', 'V_10', 'O_04', 'M_01', 'S_08'],
      ['S_01', 'V_11', 'O_03', 'S_05'],
      ['S_09', 'V_12', 'O_07', 'O_08'],
      ['S_09', 'V_12', 'O_07', 'V_03'],
      ['S_08', 'V_13', 'O_10'],
      ['S_04', 'V_14', 'S_07', 'M_05'],
      ['S_04', 'V_14', 'M_03', 'O_02'],
    ])
      expectReachable(state, phrase);
  });

  it('keeps source legal exceptions reachable even when the prefix is an invalid direct order', () => {
    const state = lateGame();
    for (const phrase of [
      ['S_02', 'V_14', 'M_03', 'M_01', 'C_03', 'O_05'],
      ['S_03', 'V_13', 'O_10', 'S_05', 'C_03', 'M_04'],
      ['S_01', 'V_01', 'C_01', 'M_01', 'C_03', 'V_03'],
      ['S_06', 'V_08', 'O_02', 'C_02', 'C_03', 'M_05'],
      ['S_01', 'V_05', 'O_09', 'M_02', 'C_03', 'O_12'],
      ['S_02', 'V_03', 'S_02', 'M_01', 'C_03', 'V_03'],
    ]) {
      expect(compileSentence(state, phrase).kind).toBe('law');
      expectReachable(state, phrase);
    }
    expect(getSyntaxSuggestions(state, ['S_02', 'V_14']).nextLabel).toContain('legge');
  });

  it('keeps all compiler-accepted legal objects and measures available, including action concepts', () => {
    const state = lateGame();
    const prefix = ['S_02', 'V_14'];
    const objectChoices = getSyntaxSuggestions(state, prefix);
    for (const object of WORD_ORDER.filter((id) => id !== 'C_03')) {
      const measureChoices = getSyntaxSuggestions(state, [...prefix, object]);
      for (const measure of ['V_03', 'V_05', 'C_01', 'C_02', 'M_01', 'S_08']) {
        const law = [...prefix, object, measure, 'C_03', 'O_06'];
        expect(compileSentence(state, law).kind, law.join(' · ')).toBe('law');
        expect(objectChoices.tokenIds).toContain(object);
        expect(measureChoices.tokenIds).toContain(measure);
      }
    }
    expect(objectChoices.lawOnlyTokenIds).toContain('V_05');
    state.words.C_03.retention = 0;
    expect(getSyntaxSuggestions(state, prefix).tokenIds).not.toContain('V_05');
  });

  it('separates grammatical completeness from missing materials, buildings, targets and voice', () => {
    const state = lateGame();
    state.buildings = [];
    state.voice = 0;
    for (const key of Object.keys(state.resources))
      state.resources[key as keyof typeof state.resources] = 0;
    const before = structuredClone(state);
    expectReachable(state, ['S_01', 'V_07', 'O_04', 'O_05']);
    expectReachable(state, ['S_04', 'V_14', 'S_07', 'M_05']);
    expectReachable(state, ['S_01', 'V_05', 'O_09', 'M_02', 'C_03', 'O_12']);
    expect(compileSentence(state, ['S_01', 'V_07', 'O_04', 'O_05']).valid).toBe(false);
    expect(state).toEqual(before);
  });

  it('offers only continuations that can finish using the current early vocabulary and capacity', () => {
    const state = createGame(6842);
    expectReachable(state, ['S_01', 'V_01']);
    expect(getSyntaxSuggestions(state, ['S_01', 'V_01'])).toMatchObject({
      isComplete: true,
      hasContinuations: false,
      nextLabel: 'Frase pronta',
    });
    state.tier = 1;
    for (const id of ['V_06', 'O_02', 'O_03'])
      state.words[id] = { retention: 100, custodians: [], uses: 0 };
    expect(getSyntaxSuggestions(state, ['S_01', 'V_06']).tokenIds).toEqual(['O_02']);
    state.words.O_02.retention = 0;
    expect(getSyntaxSuggestions(state, ['S_01']).tokenIds).not.toContain('V_06');
  });

  it('does not fill spare slots with redundant ingredients or repeat ordinary arguments', () => {
    const state = lateGame();
    state.words.C_03.retention = 0;
    for (const phrase of [
      ['S_01', 'V_07', 'O_04', 'O_05'],
      ['S_01', 'V_09', 'O_03'],
      ['S_01', 'V_08', 'O_02', 'O_01'],
      ['S_01', 'V_06', 'O_02', 'O_03'],
      ['S_01', 'V_05', 'O_05'],
    ])
      expect(getSyntaxSuggestions(state, phrase)).toMatchObject({ isComplete: true, tokenIds: [] });
    expect(getSyntaxSuggestions(state, ['S_01', 'V_04', 'O_03']).tokenIds).not.toContain('O_03');
  });

  it('invalidates grammatical caches on loss, capacity or sacred conflict and protects cached arrays', () => {
    const state = lateGame();
    const before = getSyntaxSuggestions(state, ['S_01', 'V_08', 'O_02']);
    before.tokenIds.length = 0;
    expect(getSyntaxSuggestions(state, ['S_01', 'V_08', 'O_02']).tokenIds).toContain('O_09');
    state.words.O_09.retention = 0;
    expect(getSyntaxSuggestions(state, ['S_01', 'V_08', 'O_02']).tokenIds).not.toContain('O_09');
    state.lockedSlot = true;
    expect(getSyntaxSuggestions(state, ['S_01', 'V_04', 'O_03', 'M_02']).tokenIds).not.toContain(
      'C_03',
    );
  });
});

describe('recalling recent acknowledged phrases', () => {
  it('keeps eight distinct orders, promotes repeats and never mutates or silently truncates a phrase', () => {
    const state = lateGame();
    const input = ['S_01', 'V_04', 'O_03'];
    let history: string[][] = [];
    for (const id of ['O_02', 'O_03', 'O_04', 'O_07', 'O_12', 'O_06', 'O_01', 'O_05', 'O_09'])
      history = rememberRecentPhrase(history, ['S_01', 'V_04', id]);
    expect(history).toHaveLength(RECENT_PHRASE_LIMIT);
    const before = structuredClone(history);
    const next = rememberRecentPhrase(history, input);
    expect(history).toEqual(before);
    expect(next[0]).toEqual(input);
    expect(next.filter((phrase) => phrase.join('|') === input.join('|'))).toHaveLength(1);
    input.push('O_01');
    expect(next[0]).toHaveLength(3);
    expect(phraseRecallIssue(state, next[0])).toBeUndefined();
    state.words.O_03.retention = 0;
    expect(phraseRecallIssue(state, next[0])).toMatch(/perduta/);
    state.words.O_03.retention = 100;
    state.tier = 0;
    expect(phraseRecallIssue(state, next[0])).toMatch(/spazi/);
  });
});
