import { describe, expect, it } from 'vitest';
import { createGame, parseGame, serializeGame, tick } from './engine';
import { validSave } from './saveValidation';

describe('nested imported worlds', () => {
  it('preserves all four foreign cultures and the physical map when round-tripped', () => {
    const game = createGame(6842);
    expect(parseGame(serializeGame(game))).toEqual({ ...game, paused: true });
  });
  it('keeps an ordinary game reloadable at every irregular browser tick, including idle timer expiry', () => {
    let game = { ...createGame(6842), started: true };
    for (let step = 0; step < 90; step++) {
      game = tick(game, 0.173);
      expect(validSave(game), `save validity at ${game.time}s`).toBe(true);
      expect(parseGame(serializeGame(game))).toEqual({ ...game, paused: true });
    }
  });
  it('recovers only the known expired idle timer in an older save without changing the world', () => {
    const game = createGame(6842);
    game.started = true;
    game.units[0].progress = -0.1477906860969982;
    expect(validSave(game)).toBe(false);
    const recovered = parseGame(serializeGame(game));
    const expected = structuredClone(game);
    expected.paused = true;
    expected.units[0].progress = 0;
    expect(recovered).toEqual(expected);
    expect(game.units[0].progress).toBeLessThan(0);
  });
  it('continues rejecting negative work progress, out-of-range timers and unrelated corruption', () => {
    for (const change of [
      (game: ReturnType<typeof createGame>) => {
        game.units[0].action = 'gathering';
      },
      (game: ReturnType<typeof createGame>) => {
        game.units[0].command = ['S_01', 'V_03'];
      },
      (game: ReturnType<typeof createGame>) => {
        game.units[0].progress = -0.251;
      },
      (game: ReturnType<typeof createGame>) => {
        game.resources.wood = -1;
      },
    ]) {
      const game = createGame(6842);
      game.units[0].progress = -0.1;
      change(game);
      expect(parseGame(serializeGame(game))).toBeNull();
    }
  });
  it.each([
    [
      'foreign word catalogue',
      (s: ReturnType<typeof createGame>) => {
        s.factions[0].words = ['UNKNOWN'];
      },
    ],
    [
      'city production',
      (s: ReturnType<typeof createGame>) => {
        s.cities[0].production = null as never;
      },
    ],
    [
      'cohort count',
      (s: ReturnType<typeof createGame>) => {
        delete (s.cities[0].cohorts as Partial<(typeof s.cities)[0]['cohorts']>).sages;
      },
    ],
    [
      'city dogma',
      (s: ReturnType<typeof createGame>) => {
        s.cities[0].dogmas = [null as never];
      },
    ],
    [
      'event buffer',
      (s: ReturnType<typeof createGame>) => {
        s.units[0].eventMemory = [null as never];
      },
    ],
    [
      'duplicate person',
      (s: ReturnType<typeof createGame>) => {
        s.units[1].id = s.units[0].id;
      },
    ],
    [
      'world sector',
      (s: ReturnType<typeof createGame>) => {
        s.sectors.pop();
      },
    ],
    [
      'victory state',
      (s: ReturnType<typeof createGame>) => {
        s.victory = 'instant-win' as never;
      },
    ],
    [
      'law structure',
      (s: ReturnType<typeof createGame>) => {
        s.laws = [{ id: 'law', tokens: ['S_01', 'V_04', 'O_02', 'O_08', 'C_03', 'O_06'] } as never];
      },
    ],
    [
      'caravan destination',
      (s: ReturnType<typeof createGame>) => {
        s.caravans = [{ id: 'caravan', target: null } as never];
      },
    ],
  ] as const)('rejects a broken %s before loading it', (_, breakState) => {
    const s = createGame();
    breakState(s);
    expect(parseGame(serializeGame(s))).toBeNull();
  });
  it('rejects non-records without throwing', () => {
    for (const value of [null, undefined, 5, [], 'world']) expect(validSave(value)).toBe(false);
  });
});
