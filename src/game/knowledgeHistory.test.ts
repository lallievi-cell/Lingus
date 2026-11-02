import { describe, expect, it } from 'vitest';
import {
  createGame,
  createReadyBuilding,
  parseGame,
  serializeGame,
  solveSpark,
  teachWord,
} from './engine';
import { WORDS } from './content';
import { getLessonPreview } from './teaching';
import {
  KNOWLEDGE_HISTORY_LIMIT,
  recordKnowledgeDiscovery,
  recordKnowledgeTeaching,
  validKnowledgeHistory,
} from './knowledgeHistory';
import type { GameState, KnowledgeHistoryEvent } from './types';

function prepared() {
  const state = createGame(6842, 'classic');
  state.time = 100;
  state.words.O_05 = { retention: 70, custodians: ['unit-5'], uses: 0 };
  state.units[5].knows.push('O_05');
  state.bornWords = { O_05: 100 };
  return state;
}

function recorded() {
  const state = prepared();
  recordKnowledgeDiscovery(state, 'O_05', 'unit-5');
  return state;
}

describe('bounded, actual discovery and lesson history', () => {
  it('does not manufacture history for legacy saves or even merely known words', () => {
    const state = prepared();
    expect(validKnowledgeHistory(undefined, state)).toBe(true);
    const loaded = parseGame(serializeGame(state));
    expect(loaded).not.toBeNull();
    expect(loaded).not.toHaveProperty('knowledgeHistory');
    expect(state).not.toHaveProperty('knowledgeHistory');
  });

  it('records the real discoverer with a deterministic identity and no simulation side effects', () => {
    const state = prepared();
    const before = structuredClone(state);
    recordKnowledgeDiscovery(state, 'O_05', 'unit-5');
    expect(state.knowledgeHistory).toHaveLength(1);
    expect(state.knowledgeHistory![0]).toMatchObject({
      kind: 'discovery',
      wordId: 'O_05',
      time: 100,
      teacherId: 'unit-5',
    });
    expect(state.knowledgeHistory![0]).not.toHaveProperty('pupilId');
    const clone = structuredClone(before);
    recordKnowledgeDiscovery(clone, 'O_05', 'unit-5');
    expect(clone.knowledgeHistory).toEqual(state.knowledgeHistory);
    const { knowledgeHistory: _, ...rest } = state;
    expect(rest).toEqual(before);
  });

  it('deduplicates one recorded event even when the same callback is invoked twice', () => {
    const state = recorded();
    recordKnowledgeDiscovery(state, 'O_05', 'unit-5');
    expect(state.knowledgeHistory).toHaveLength(1);
  });

  it('records the actual public discovery, including a later rediscovery, without rewriting its origin', () => {
    let state = createGame(6842, 'classic');
    const spark = (unitId: string) => ({
      id: `spark-${state.time}`,
      wordId: 'O_02',
      unitId,
      eventLabel: WORDS.O_02.event,
      hint: WORDS.O_02.hint,
      recipe: WORDS.O_02.recipe,
      expiresAt: state.time + 45,
    });
    state.time = 10;
    state.sparks = [spark('unit-5')];
    const unsolved = structuredClone(state);
    expect(solveSpark(state, state.sparks[0].id, []).knowledgeHistory).toBeUndefined();
    state = solveSpark(state, state.sparks[0].id, WORDS.O_02.recipe);
    expect(state.knowledgeHistory).toHaveLength(1);
    expect(state.knowledgeHistory![0]).toMatchObject({
      kind: 'discovery',
      wordId: 'O_02',
      teacherId: 'unit-5',
      time: 10,
    });
    expect(unsolved).not.toHaveProperty('knowledgeHistory');
    state.words.O_02.retention = 0;
    state.words.O_02.custodians = [];
    state.units[5].knows = state.units[5].knows.filter((wordId) => wordId !== 'O_02');
    state.time = 20;
    state.sparks = [spark('unit-0')];
    state = solveSpark(state, state.sparks[0].id, WORDS.O_02.recipe);
    expect(state.bornWords?.O_02).toBe(10);
    expect(state.knowledgeHistory?.map((entry) => [entry.teacherId, entry.time])).toEqual([
      ['unit-0', 20],
      ['unit-5', 10],
    ]);
    expect(parseGame(serializeGame(state))?.knowledgeHistory).toEqual(state.knowledgeHistory);
  });

  it('records the actual teacher and pupil of a real paid lesson without spending again', () => {
    const initial = prepared();
    initial.attention = 20;
    createReadyBuilding(initial, 'campfire');
    const preview = getLessonPreview(initial, 'O_05');
    expect(preview.allowed).toBe(true);
    const state = teachWord(initial, 'O_05');
    const before = structuredClone(state);
    // Assert the public API wrote the event before invoking the idempotent helper.
    expect(state.knowledgeHistory?.find((entry) => entry.kind === 'teaching')).toMatchObject({
      wordId: 'O_05',
      teacherId: preview.teacher!.id,
      pupilId: preview.pupil!.id,
      time: initial.time,
    });
    recordKnowledgeTeaching(state, 'O_05', preview.teacher!.id, preview.pupil!.id);
    expect(state.knowledgeHistory).toEqual(before.knowledgeHistory);
    expect(state.attention).toBe(initial.attention - 10);
    expect(state.seed).toBe(before.seed);
    expect(state.revision).toBe(before.revision);
    expect(state.resources).toEqual(before.resources);
    expect(state.stats).toEqual(before.stats);
    expect(state.stats.taught).toBe(initial.stats.taught + 1);
  });

  it('never records an unpaid, failed or unassigned pupil as a completed lesson', () => {
    const state = prepared();
    state.attention = 0;
    expect(teachWord(state, 'O_05')).toBe(state);
    recordKnowledgeTeaching(state, 'O_05', 'unit-5', 'unit-6');
    expect(state.knowledgeHistory).toBeUndefined();
    recordKnowledgeTeaching(state, 'O_05', 'unit-5', 'unit-5');
    expect(state.knowledgeHistory).toBeUndefined();
  });

  it.each([
    [
      'dead',
      (state: GameState) => {
        state.units[5].hp = 0;
      },
    ],
    [
      'foreign',
      (state: GameState) => {
        state.units[5].factionId = 'foreign';
      },
    ],
    [
      'enslaved',
      (state: GameState) => {
        state.units[5].caste = 'slave';
      },
    ],
    [
      'not a custodian',
      (state: GameState) => {
        state.words.O_05.custodians = [];
      },
    ],
    [
      'not known',
      (state: GameState) => {
        state.units[5].knows = [];
      },
    ],
    [
      'forgotten',
      (state: GameState) => {
        state.words.O_05.retention = 0;
      },
    ],
  ] as const)('does not invent a discovery for a %s actor', (_, change) => {
    const state = prepared();
    change(state);
    recordKnowledgeDiscovery(state, 'O_05', 'unit-5');
    expect(state.knowledgeHistory).toBeUndefined();
  });

  it('keeps at most two hundred actual records without borrowing RNG or revision IDs', () => {
    const state = prepared();
    const { seed, revision } = state;
    for (let step = 0; step < KNOWLEDGE_HISTORY_LIMIT + 2; step++) {
      state.time = step + 1;
      recordKnowledgeDiscovery(state, 'O_05', 'unit-5');
    }
    expect(state.knowledgeHistory).toHaveLength(KNOWLEDGE_HISTORY_LIMIT);
    expect(state.knowledgeHistory![0].time).toBe(202);
    expect(state.knowledgeHistory!.at(-1)!.time).toBe(3);
    expect(new Set(state.knowledgeHistory!.map((event) => event.id)).size).toBe(
      KNOWLEDGE_HISTORY_LIMIT,
    );
    expect(state.seed).toBe(seed);
    expect(state.revision).toBe(revision);
  });

  it('preserves historical actors after death or loss of their word', () => {
    const state = recorded();
    state.units[5].hp = 0;
    state.words.O_05.retention = 0;
    state.words.O_05.custodians = [];
    expect(parseGame(serializeGame(state))?.knowledgeHistory).toEqual(state.knowledgeHistory);
  });

  it.each([
    [
      'unknown kind',
      (entry: KnowledgeHistoryEvent) => {
        entry.kind = 'invented' as never;
      },
    ],
    [
      'unknown word',
      (entry: KnowledgeHistoryEvent) => {
        entry.wordId = 'UNKNOWN';
      },
    ],
    [
      'missing actor',
      (entry: KnowledgeHistoryEvent) => {
        entry.teacherId = 'nobody';
      },
    ],
    [
      'future time',
      (entry: KnowledgeHistoryEvent) => {
        entry.time = 101;
      },
    ],
    [
      'negative time',
      (entry: KnowledgeHistoryEvent) => {
        entry.time = -1;
      },
    ],
    [
      'forged id',
      (entry: KnowledgeHistoryEvent) => {
        entry.id = 'forged';
      },
    ],
    [
      'pupil on discovery',
      (entry: KnowledgeHistoryEvent) => {
        entry.pupilId = 'unit-6';
      },
    ],
    [
      'teacher without pupil',
      (entry: KnowledgeHistoryEvent) => {
        entry.kind = 'teaching';
      },
    ],
  ] as const)('rejects an imported history with %s rather than repairing it', (_, change) => {
    const state = recorded();
    change(state.knowledgeHistory![0]);
    expect(parseGame(serializeGame(state))).toBeNull();
  });

  it('rejects missing records, duplicate identities, overlong buffers and absent current word records', () => {
    const state = recorded();
    const entry = state.knowledgeHistory![0];
    state.knowledgeHistory = [entry, entry];
    expect(parseGame(serializeGame(state))).toBeNull();
    state.knowledgeHistory = Array(KNOWLEDGE_HISTORY_LIMIT + 1).fill(entry);
    expect(parseGame(serializeGame(state))).toBeNull();
    state.knowledgeHistory = [null as never];
    expect(parseGame(serializeGame(state))).toBeNull();
    state.knowledgeHistory = [entry];
    delete state.words.O_05;
    expect(parseGame(serializeGame(state))).toBeNull();
  });
});
