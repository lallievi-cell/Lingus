import { describe, expect, it } from 'vitest';
import { createGame, parseGame, serializeGame } from './engine';

describe('saved work outcomes and queued insights', () => {
  it('preserves a factual stop and accepts older saves without outcome metadata', () => {
    const state = createGame(6842, 'guided');
    expect(parseGame(serializeGame(state))).not.toBeNull();
    state.units[0].lastTaskResult = {
      time: state.time,
      tokens: ['S_01', 'V_01'],
      reason: 'rest',
      suspended: false,
      target: { type: 'point', ...state.home },
    };
    expect(parseGame(serializeGame(state))?.units[0].lastTaskResult).toEqual(
      state.units[0].lastTaskResult,
    );
    state.units[0].lastTaskResult.time = state.time + 1;
    expect(parseGame(serializeGame(state))).toBeNull();
  });
  it('rejects malformed outcome reasons and queue metadata without replacing a valid story', () => {
    const state = createGame(6842, 'guided');
    const raw = JSON.parse(serializeGame(state));
    raw.units[0].lastTaskResult = {
      time: 0,
      tokens: ['S_01', 'V_01'],
      reason: 'invented',
      suspended: false,
    };
    expect(parseGame(JSON.stringify(raw))).toBeNull();
    delete raw.units[0].lastTaskResult;
    raw.sparks = [
      {
        id: 'queued',
        wordId: 'O_02',
        unitId: state.units[0].id,
        eventLabel: 'Esperienza reale',
        recipe: ['V_03'],
        hint: 'Pietra',
        expiresAt: 0,
        deferred: true,
        earnedAt: 0,
      },
    ];
    expect(parseGame(JSON.stringify(raw))).not.toBeNull();
    raw.sparks[0].earnedAt = state.time + 1;
    expect(parseGame(JSON.stringify(raw))).toBeNull();
  });
});
