import { describe, expect, it } from 'vitest';
import { HOME } from './content';
import { applyCivilAssault } from './civilLaw';
import { createGame, parseGame, serializeGame } from './engine';
import { updateImperial } from './imperial';
import { killUnit, processWork, seasonalCore, updateAnimals, updateUnits } from './simulation';
import { rememberCombatWound } from './damageAttribution';
import { tribeEventText } from '../components/TribeEvents';
import type { GameState, MapEntity, TribeEvent } from './types';

/** Explicit wound fixtures. Every attacker attribution is produced by a real combat path. */
function world() {
  const s = createGame(6842);
  Object.assign(s, { started: true, time: 65, entities: [], cities: [], factions: [] });
  s.units = s.units.slice(0, 1);
  Object.assign(s.units[0], {
    ...HOME,
    hp: 100,
    hunger: 40,
    temp: 100,
    age: 6,
    action: 'idle',
    progress: 0,
  });
  return s;
}
function animal(s: GameState, kind: 'wolf' | 'alpha' | 'mammoth') {
  const e: MapEntity = { id: `actual-${kind}`, kind, ...HOME, hp: 1000, maxHp: 1000, amount: 2 };
  s.entities.push(e);
  return e;
}
const death = (s: GameState): TribeEvent => s.tribeEvents!.find((event) => event.kind === 'death')!;

describe('actual attackers, not the unit’s historical target', () => {
  it.each(['wolf', 'alpha'] as const)(
    'records a lethal %s attack at its real timestamp',
    (kind) => {
      const s = world();
      const e = animal(s, kind);
      s.units[0].hp = 1;
      s.units[0].targetId = 'unrelated-old-target';
      updateAnimals(s, 0.25);
      expect(s.units[0].action).toBe('dead');
      expect(death(s)).toMatchObject({ cause: 'V_03', combatSource: { kind, id: e.id, time: 65 } });
      expect(tribeEventText(s, death(s)).text).toContain(
        kind === 'wolf' ? 'lupo' : 'predatore alfa',
      );
      expect(parseGame(serializeGame(s))).not.toBeNull();
    },
  );

  it.each(['wolf', 'mammoth'] as const)(
    'settles a lethal hunting counterattack by a %s before home healing can revive it',
    (kind) => {
      const s = world();
      const e = animal(s, kind);
      Object.assign(s.units[0], {
        hp: 1,
        hunger: 0,
        action: 'hunting',
        targetId: e.id,
        command: ['S_01', 'V_03'],
      });
      processWork(s, s.units[0], 1);
      expect(s.units[0].hp).toBe(0);
      expect(s.units[0].action).toBe('dead');
      expect(death(s).combatSource).toEqual({ kind, id: e.id, time: 65 });
      updateUnits(s, 0.25);
      expect(s.units[0].hp).toBe(0);
      expect(s.stats.deaths).toBe(1);
    },
  );

  it('identifies the actual foreign retaliator instead of an old animal wound', () => {
    const s = world(),
      victim = s.units[0];
    const foreign = {
      ...structuredClone(victim),
      id: 'foreign-human',
      name: 'Ramo',
      hp: 100,
      factionId: 'foreign',
      strength: 8,
    };
    s.units.push(foreign);
    rememberCombatWound(s, victim, 1, { kind: 'wolf', id: 'old-wolf' });
    Object.assign(victim, {
      hp: 1,
      action: 'combat',
      targetId: foreign.id,
      command: ['S_01', 'V_03'],
    });
    processWork(s, victim, 1);
    expect(death(s).combatSource).toEqual({ kind: 'human', id: foreign.id, time: 65 });
    expect(tribeEventText(s, death(s)).text).toContain('aggressione umana');
    expect(tribeEventText(s, death(s)).text).not.toContain('Ramo');
    s.words.S_02 = { retention: 100, custodians: [foreign.id], uses: 0 };
    expect(tribeEventText(s, death(s)).text).toContain('aggressione di Ramo');
  });

  it('identifies a lethal civil attacker, retaining all custody and the actual lost subset', () => {
    const s = world(),
      attacker = s.units[0];
    const victim = {
      ...structuredClone(attacker),
      id: 'victim',
      name: 'Ayla',
      sex: 'F' as const,
      hp: 5,
    };
    s.units.push(victim);
    s.words.O_03 = { retention: 50, custodians: [victim.id], uses: 0 };
    s.words.O_02 = { retention: 50, custodians: [victim.id, attacker.id], uses: 0 };
    expect(applyCivilAssault(s, attacker, victim, 10, killUnit)).toBe(5);
    expect(death(s)).toMatchObject({
      combatSource: { kind: 'human', id: attacker.id },
      wordIds: ['O_03', 'O_02'],
      lostWordIds: ['O_03'],
    });
    const text = tribeEventText(s, death(s)).text;
    expect(text).toContain('Custodiva: «Legno», «Pietra»');
    expect(text).toContain('Parole perdute: «Legno»');
    expect(text).toContain('Affidate anche ad altri custodi: «Pietra»');
  });

  it('records the enemy army that actually kills a sage on the frontline', () => {
    const s = world(),
      sage = s.units[0];
    Object.assign(sage, {
      x: HOME.x + 40,
      hp: 1,
      intelligence: 9,
      action: 'frontline',
      targetId: 'own',
    });
    s.dogmas.push({
      id: 'war',
      name: 'Valhalla',
      targetId: 'V_03',
      vectorId: 'O_06',
      description: 'Saggi in prima linea',
      age: 0,
      weight: 10,
    });
    for (const [id, factionId] of [
      ['own', 'player'],
      ['enemy', 'enemy'],
    ])
      s.battalions.push({
        id,
        name: id,
        factionId,
        cityId: '',
        x: sage.x,
        y: sage.y,
        hp: 100,
        maxHp: 100,
        morale: 1,
        action: id === 'own' ? 'attacking' : 'idle',
        catapult: false,
        occupation: 0,
        frontlineSageIds: id === 'own' ? [sage.id] : [],
      });
    updateImperial(s, 0.25);
    expect(sage.action).toBe('dead');
    expect(death(s).combatSource).toEqual({ kind: 'army', id: 'enemy', time: s.time });
    expect(tribeEventText(s, death(s)).text).toContain('scontro con un esercito');
  });

  it.each(['cold', 'hunger', 'old-age'] as const)(
    'does not blame an old wolf for a later %s death',
    (reason) => {
      const s = world(),
        victim = s.units[0];
      animal(s, 'wolf');
      updateAnimals(s, 0.25);
      expect(victim.lastCombatSource?.kind).toBe('wolf');
      s.entities = [];
      s.time += 1;
      if (reason === 'old-age') {
        s.time = 90;
        victim.age = 22;
        seasonalCore(s);
      } else {
        Object.assign(victim, {
          hp: 0.1,
          temp: reason === 'cold' ? 0 : 100,
          hunger: reason === 'hunger' ? 100 : 40,
        });
        updateUnits(s, 0.25);
      }
      expect(victim.action).toBe('dead');
      expect(death(s).cause).toBe(
        reason === 'cold' ? 'C_01' : reason === 'hunger' ? 'ENV_STARVATION' : 'oldAge',
      );
      expect(death(s).combatSource).toBeUndefined();
      expect(tribeEventText(s, death(s)).text).not.toContain('lupo');
    },
  );

  it('keeps legacy combat deaths generic instead of guessing from the target or an older timestamp', () => {
    for (const recorded of [false, true]) {
      const s = world(),
        victim = s.units[0];
      victim.targetId = animal(s, 'mammoth').id;
      if (recorded) rememberCombatWound(s, victim, 1, { kind: 'wolf', id: 'old-wolf' });
      s.time += 0.25;
      killUnit(s, victim, 'V_03');
      expect(death(s).combatSource).toBeUndefined();
      expect(tribeEventText(s, death(s)).text).toContain('durante uno scontro');
      expect(tribeEventText(s, death(s)).text).not.toMatch(/lupo|mammut/);
    }
  });

  it('does not overwrite a real attacker on a zero, negative or invalid wound', () => {
    const s = world(),
      victim = s.units[0];
    rememberCombatWound(s, victim, 1, { kind: 'wolf', id: 'wolf' });
    for (const damage of [0, -1, NaN, Infinity])
      rememberCombatWound(s, victim, damage, { kind: 'human', id: 'not-a-wound' });
    expect(victim.lastCombatSource).toEqual({ kind: 'wolf', id: 'wolf', time: 65 });
  });

  it('keeps old v2 saves valid and rejects malformed or mismatched new attacker metadata', () => {
    expect(parseGame(serializeGame(world()))).not.toBeNull();
    const changes: ((s: GameState) => void)[] = [
      (s) => {
        s.units[0].lastCombatSource = { kind: 'lava', time: 1 } as never;
      },
      (s) => {
        s.units[0].lastCombatSource = { kind: 'wolf', time: -1 };
      },
      (s) => {
        s.units[0].lastCombatSource = { kind: 'human', id: 5, time: 1 } as never;
      },
      (s) => {
        s.tribeEvents = [
          {
            id: 'd',
            kind: 'death',
            unitId: s.units[0].id,
            time: 65,
            cause: 'C_01',
            combatSource: { kind: 'wolf', time: 65 },
          },
        ];
      },
      (s) => {
        s.tribeEvents = [
          {
            id: 'd',
            kind: 'death',
            unitId: s.units[0].id,
            time: 65,
            cause: 'V_03',
            combatSource: { kind: 'wolf', time: 64 },
          },
        ];
      },
    ];
    for (const change of changes) {
      const s = world();
      change(s);
      expect(parseGame(serializeGame(s))).toBeNull();
    }
  });
});
