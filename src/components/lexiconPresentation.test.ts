import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import { getLexiconEntries } from './lexiconPresentation';

describe('the compact lexicon presents real knowledge and living custody', () => {
  it('never reports a custody risk for an innate word', () => {
    const state = createGame(6842, 'guided');
    state.units[0].age = 18;
    state.units[0].hp = 20;
    for (const memory of Object.values(state.words)) memory.custodians = [state.units[0].id];
    expect(getLexiconEntries(state, { view: 'risk' })).toEqual([]);
    expect(getLexiconEntries(state).every((entry) => entry.status === 'Innata')).toBe(true);
  });

  it('recognizes a sole living custodian even when a save still lists a dead second voice', () => {
    const state = createGame(6842, 'guided');
    state.words.O_05 = {
      retention: 100,
      uses: 0,
      custodians: [state.units[0].id, state.units[1].id],
    };
    state.units[1].hp = 0;
    const before = structuredClone(state);
    const entry = getLexiconEntries(state, { view: 'risk' }).find((word) => word.id === 'O_05');
    expect(entry?.status).toBe('Una sola voce');
    expect(entry?.custodianIds).toEqual([state.units[0].id]);
    expect(state).toEqual(before);
  });

  it('distinguishes forgotten words from meanings the tribe has never learned', () => {
    const state = createGame(6842, 'guided');
    state.words.O_05 = { retention: 0, uses: 0, custodians: [] };
    const lost = getLexiconEntries(state, { view: 'lost' });
    expect(lost).toHaveLength(1);
    expect(lost[0]).toMatchObject({ id: 'O_05', label: 'Fuoco', status: 'Perduta' });
    expect(getLexiconEntries(state).some((entry) => entry.id === 'O_05')).toBe(false);
    expect(
      getLexiconEntries(state, { view: 'all' }).find((entry) => entry.id === 'O_09'),
    ).toMatchObject({ label: 'Un’idea da scoprire', status: 'Da scoprire' });
  });

  it('does not reveal an undiscovered name through search and keeps known meanings searchable', () => {
    const state = createGame(6842, 'guided');
    expect(
      getLexiconEntries(state, { view: 'all', search: 'fuoco' }).some(
        (entry) => entry.id === 'O_05',
      ),
    ).toBe(false);
    state.words.O_05 = { retention: 80, uses: 0, custodians: [state.units[0].id] };
    expect(getLexiconEntries(state, { search: ' FUOCO ' }).map((entry) => entry.id)).toContain(
      'O_05',
    );
  });

  it('surfaces fragile living meanings before stable ones while keeping type filters exact', () => {
    const state = createGame(6842, 'guided');
    state.words.O_05 = {
      retention: 20,
      uses: 0,
      custodians: [state.units[0].id, state.units[1].id],
    };
    state.words.O_02 = {
      retention: 100,
      uses: 0,
      custodians: [state.units[0].id, state.units[1].id],
    };
    const entries = getLexiconEntries(state, { kind: 'O' });
    expect(entries.map((entry) => entry.id)).toEqual(['O_05', 'O_02']);
    expect(entries[0].status).toBe('In pericolo');
    expect(getLexiconEntries(state, { kind: 'V' }).every((entry) => entry.kind === 'V')).toBe(true);
  });
});
