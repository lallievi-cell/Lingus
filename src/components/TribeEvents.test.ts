import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import type { TribeEvent } from '../game/types';
import {
  acknowledgedTribeEventIds,
  distinctTribeEvents,
  forgottenWordHint,
  tribeEventText,
} from './TribeEvents';

describe('notices explain real life events without losing unread information', () => {
  it('shows observable birth and parents before names, then proper names after Io', () => {
    const s = createGame();
    s.units.push({
      ...s.units[0],
      id: 'newborn',
      name: 'Sora',
      sex: 'F',
      age: 0,
      parentIds: ['unit-0', 'unit-1'],
    });
    const event: TribeEvent = {
      id: 'birth',
      time: 90,
      kind: 'birth',
      unitId: 'newborn',
      parentIds: ['unit-0', 'unit-1'],
    };
    const anonymous = tribeEventText(s, event).text;
    expect(anonymous).toContain('è nata');
    expect(anonymous).toContain('Genitori: un uomo adulto e una donna adulta');
    expect(anonymous).not.toMatch(/Sora|Korg|Ayla/);
    s.words.S_02 = { retention: 100, custodians: ['unit-0'], uses: 0 };
    expect(tribeEventText(s, event).text).toContain('Sora è nata');
    expect(tribeEventText(s, event).text).toContain('Korg e Ayla');
  });
  it('explains death, the actual cause and which words were lost', () => {
    const s = createGame();
    const death: TribeEvent = {
      id: 'death',
      time: 90,
      kind: 'death',
      unitId: 'unit-5',
      cause: 'C_01',
      wordIds: ['O_03', 'O_02'],
      lostWordIds: ['O_03'],
    };
    const message = tribeEventText(s, death);
    expect(message.text).toContain('Un’anziana è morta per il freddo');
    expect(message.text).toContain('«Legno»');
    expect(message.text).toContain('Custodiva: «Legno», «Pietra»');
    expect(message.text).toContain('Parole perdute: «Legno»');
    expect(message.text).toContain('Affidate anche ad altri custodi: «Pietra»');
    expect(message.text).not.toContain('Uma');
  });
  it('keeps additional event pages unread while acknowledging words already explained by a death', () => {
    const events: TribeEvent[] = [
      { id: 'd', time: 90, kind: 'death', unitId: 'unit-5', lostWordIds: ['O_03'] },
      {
        id: 'w',
        time: 90,
        kind: 'word-lost',
        unitId: 'unit-5',
        wordId: 'O_03',
        cause: 'custodian-death',
      },
      { id: 'b1', time: 90, kind: 'birth', unitId: 'child-1' },
      { id: 'b2', time: 90, kind: 'birth', unitId: 'child-2' },
      { id: 'later-page', time: 89, kind: 'word-lost', wordId: 'O_02', cause: 'forgetting' },
    ];
    expect(distinctTribeEvents(events).map((event) => event.id)).toEqual([
      'd',
      'b1',
      'b2',
      'later-page',
    ]);
    expect(acknowledgedTribeEventIds(events)).toEqual(['d', 'w', 'b1', 'b2']);
  });
  it('distinguishes forgetting from custodian death and tolerates older histories without a person', () => {
    const s = createGame();
    s.tribeEvents = [{ id: 'w', time: 90, kind: 'word-lost', wordId: 'O_03', cause: 'forgetting' }];
    expect(forgottenWordHint(s, 'O_03')).toContain('cambio di stagione');
    expect(forgottenWordHint(s, 'O_03')).not.toContain('morto');
    expect(
      tribeEventText(s, { id: 'b', kind: 'birth', time: 90, unitId: 'missing' }).text,
    ).toContain('Una nuova voce è nata');
  });
});
