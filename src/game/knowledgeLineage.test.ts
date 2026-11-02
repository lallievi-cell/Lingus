import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KnowledgeLineage } from '../components/KnowledgeLineage';
import { getKnowledgeLineage, lineagePersonLabel } from './knowledgeLineage';
import { recordKnowledgeDiscovery, recordKnowledgeTeaching } from './knowledgeHistory';
import { createInitialState } from './state';
import type { GameState } from './types';

function learned(state: GameState, wordId = 'O_05', custodianIds = ['unit-5']) {
  state.words[wordId] = { retention: 70, custodians: custodianIds, uses: 1 };
  for (const unit of state.units) if (custodianIds.includes(unit.id)) unit.knows.push(wordId);
}

describe('the real people and kinship behind living knowledge', () => {
  it('does not invent a lineage for innate or unknown words', () => {
    const state = createInitialState();
    expect(getKnowledgeLineage(state)).toEqual([]);
    expect(getKnowledgeLineage(state, 'made-up')).toEqual([]);
    learned(state);
    expect(getKnowledgeLineage(state, 'O_05')).toHaveLength(1);
    expect(getKnowledgeLineage(state, 'S_01')).toEqual([]);
  });

  it('uses recorded custody rather than assuming everyone who knows is a custodian', () => {
    const state = createInitialState();
    learned(state);
    state.units[0].knows.push('O_05');
    expect(getKnowledgeLineage(state)[0].custodians.map((person) => person.id)).toEqual(['unit-5']);
    expect(getKnowledgeLineage(state)[0].soleCustodian?.label).toBe('Un’anziana');
  });

  it('deduplicates custodians and excludes dead, foreign and missing people', () => {
    const state = createInitialState();
    learned(state, 'O_05', ['unit-5', 'unit-5', 'unit-0', 'unit-1', 'missing']);
    state.units[0].hp = 0;
    state.units[1].factionId = 'foreign';
    expect(getKnowledgeLineage(state)[0].custodians.map((person) => person.id)).toEqual(['unit-5']);
  });

  it('does not display a word with zero retention as living knowledge', () => {
    const state = createInitialState();
    learned(state);
    state.words.O_05.retention = 0;
    expect(getKnowledgeLineage(state)).toEqual([]);
  });

  it('prioritizes critical last custodians and preserves exact reasons in the existing status model', () => {
    const state = createInitialState();
    learned(state, 'O_05', ['unit-5']);
    learned(state, 'V_06', ['unit-0']);
    learned(state, 'O_03', ['unit-1', 'unit-2']);
    state.units[0].temp = 10;
    const entries = getKnowledgeLineage(state);
    expect(entries.map((entry) => entry.wordId)).toEqual(['V_06', 'O_05', 'O_03']);
    expect(entries.map((entry) => entry.risk)).toEqual(['critical', 'ageing', 'safe']);
  });

  it('uses actual parent IDs and never infers a family from names or ages', () => {
    const state = createInitialState();
    learned(state);
    state.units[6].parentIds = ['unit-5', 'missing'];
    const entry = getKnowledgeLineage(state)[0];
    expect(entry.families).toHaveLength(1);
    expect(entry.families[0]).toMatchObject({
      parent: { id: 'unit-5' },
      child: { id: 'unit-6' },
      sharedWord: false,
    });
    expect(entry.futureLearners.map((person) => person.id)).toEqual(['unit-6']);
  });

  it('marks knowledge shared by a parent and child without inventing the teacher', () => {
    const state = createInitialState();
    learned(state, 'O_05', ['unit-5', 'unit-6']);
    state.units[6].parentIds = ['unit-5', 'unit-0'];
    const entry = getKnowledgeLineage(state)[0];
    expect(entry.families[0].sharedWord).toBe(true);
    expect(entry.futureLearners).toEqual([]);
    expect(entry.soleCustodian).toBeUndefined();
    expect(entry).not.toHaveProperty('firstDiscoverer');
    expect(entry).not.toHaveProperty('teacher');
  });

  it('hides names before Io and reveals names only while Io is known', () => {
    const state = createInitialState();
    expect(lineagePersonLabel(state, state.units[5])).toBe('Un’anziana');
    learned(state, 'S_02', ['unit-0']);
    expect(lineagePersonLabel(state, state.units[5])).toBe('Uma');
    state.words.S_02.retention = 0;
    expect(lineagePersonLabel(state, state.units[5])).toBe('Un’anziana');
  });

  it('retains only genuine relevant chronology, filtering future and foreign events', () => {
    const state = createInitialState();
    state.time = 100;
    learned(state);
    state.units[6].parentIds = ['unit-5', 'unit-0'];
    state.tribeEvents = [
      { id: 'birth', kind: 'birth', time: 90, unitId: 'unit-6', parentIds: ['unit-5', 'unit-0'] },
      { id: 'lost', kind: 'word-lost', time: 50, wordId: 'O_05' },
      { id: 'unrelated', kind: 'word-lost', time: 60, wordId: 'O_03' },
      { id: 'future', kind: 'death', time: 110, unitId: 'unit-0', wordIds: ['O_05'] },
      { id: 'death', kind: 'death', time: 30, unitId: 'unit-0', wordIds: ['O_05'] },
    ];
    const history = getKnowledgeLineage(state)[0].history;
    expect(history.map((event) => event.id)).toEqual(['birth', 'lost', 'death']);
    expect(history[0].text).toContain('Un figlio');
    expect(
      history.every((event) => !event.text.includes('Uma') && !event.text.includes('Ilo')),
    ).toBe(true);
  });

  it('does not turn the date a word entered the lexicon into a claim of authorship', () => {
    const state = createInitialState();
    state.time = 100;
    learned(state);
    state.bornWords = { O_05: 15 };
    const before = JSON.stringify(state);
    expect(getKnowledgeLineage(state)[0].enteredAt).toBe(15);
    expect(getKnowledgeLineage(state)[0].firstCustodian).toBeUndefined();
    expect(getKnowledgeLineage(state)[0].transmissions).toEqual([]);
    expect(JSON.stringify(state)).toBe(before);
    state.bornWords.O_05 = 150;
    expect(getKnowledgeLineage(state)[0].enteredAt).toBeUndefined();
  });

  it('names the actual first custodian and actual lessons only when recorded', () => {
    const state = createInitialState();
    state.time = 10;
    learned(state);
    state.bornWords = { O_05: 10 };
    recordKnowledgeDiscovery(state, 'O_05', 'unit-5');
    state.time = 20;
    learned(state, 'O_05', ['unit-5', 'unit-6']);
    recordKnowledgeTeaching(state, 'O_05', 'unit-5', 'unit-6');
    let entry = getKnowledgeLineage(state, 'O_05')[0];
    expect(entry.firstCustodian).toMatchObject({ id: 'unit-5', label: 'Un’anziana' });
    expect(entry.transmissions[0]).toMatchObject({
      teacher: { id: 'unit-5' },
      pupil: { id: 'unit-6' },
    });
    expect(entry.transmissions[0].text).not.toContain('Uma');
    learned(state, 'S_02', ['unit-0']);
    entry = getKnowledgeLineage(state, 'O_05')[0];
    expect(entry.firstCustodian?.label).toBe('Uma');
    expect(entry.transmissions[0].text).toBe('Uma ha insegnato «Fuoco» a Ilo.');
  });

  it('retains a historical voice after death without offering a map target for that person', () => {
    const state = createInitialState();
    state.time = 10;
    learned(state);
    state.bornWords = { O_05: 10 };
    recordKnowledgeDiscovery(state, 'O_05', 'unit-5');
    learned(state, 'O_05', ['unit-5', 'unit-6']);
    recordKnowledgeTeaching(state, 'O_05', 'unit-5', 'unit-6');
    state.units[5].hp = 0;
    state.words.O_05.custodians = ['unit-6'];
    const entry = getKnowledgeLineage(state, 'O_05')[0];
    expect(entry.firstCustodian?.alive).toBe(false);
    expect(entry.transmissions[0].teacher.alive).toBe(false);
    expect(entry.custodians.map((person) => person.id)).toEqual(['unit-6']);
    const markup = renderToStaticMarkup(
      createElement(KnowledgeLineage, { state, wordId: 'O_05', onFocusUnit: () => {} }),
    );
    expect(markup).toContain('Nella memoria');
    expect(markup).toContain('lineage-person is-static');
  });

  it('does not rename a later rediscoverer as the original when a bounded buffer lost the first event', () => {
    const state = createInitialState();
    state.time = 20;
    learned(state, 'O_05', ['unit-0']);
    state.bornWords = { O_05: 10 };
    recordKnowledgeDiscovery(state, 'O_05', 'unit-0');
    expect(getKnowledgeLineage(state, 'O_05')[0].firstCustodian).toBeUndefined();
    expect(getKnowledgeLineage(state, 'O_05')[0].history[0].text).toContain('ha compreso');
  });

  it('keeps parent-child relationships separate from a lesson given by somebody else', () => {
    const state = createInitialState();
    state.time = 20;
    learned(state, 'O_05', ['unit-0', 'unit-1', 'unit-6']);
    state.units[6].parentIds = ['unit-0', 'unit-2'];
    recordKnowledgeTeaching(state, 'O_05', 'unit-1', 'unit-6');
    const entry = getKnowledgeLineage(state, 'O_05')[0];
    expect(entry.families.map((family) => family.parent.id)).toEqual(['unit-0']);
    expect(entry.transmissions[0].teacher.id).toBe('unit-1');
  });

  it('uses the actual lesson preconditions rather than enabling an impossible lesson', () => {
    const state = createInitialState();
    learned(state);
    expect(getKnowledgeLineage(state)[0].canTeach).toBe(false);
    state.attention = 10;
    state.buildings.push({ id: 'fire', kind: 'campfire', x: 250, y: 250, hp: 100, active: true });
    expect(getKnowledgeLineage(state)[0].canTeach).toBe(true);
    state.attention = 0;
    expect(getKnowledgeLineage(state)[0].canTeach).toBe(false);
  });

  it('starts collapsed, exposes no counts or personal names before their words, and offers real target controls', () => {
    const state = createInitialState();
    learned(state, 'O_05', ['unit-5', 'unit-6']);
    const markup = renderToStaticMarkup(
      createElement(KnowledgeLineage, { state, onFocusUnit: () => {} }),
    );
    expect(markup).toContain('Le voci del sapere');
    expect(markup).toContain('Sapere condiviso');
    expect(markup).not.toContain('2 custodi');
    expect(markup).not.toContain('Uma');
    expect(markup).not.toContain('Ilo');
    expect(markup).not.toContain('<details open');
    expect(markup).toContain('lineage-person');
    learned(state, 'O_08', ['unit-0']);
    expect(renderToStaticMarkup(createElement(KnowledgeLineage, { state }))).toContain('2 custodi');
  });
});
