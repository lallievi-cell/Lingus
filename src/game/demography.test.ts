import { describe, expect, it } from 'vitest';
import { HOME, INNATE_WORDS } from './content';
import { createGame, issueCommand, parseGame, serializeGame, tick } from './engine';
import { createInitialState } from './state';
import {
  getLifeStage,
  newbornName,
  pairFertileUnits,
  recordTribeEvent,
  resolveUnitSex,
  TRIBE_EVENT_LIMIT,
} from './demography';

it('keeps a bright child eligible to learn, but out of physical Sage work orders', () => {
  const state = createGame();
  state.started = true;
  state.tier = 2;
  state.units = [state.units[6]];
  Object.assign(state.units[0], { intelligence: 9, age: 2, ...HOME });
  for (const id of ['S_04', 'V_06', 'O_02'])
    state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
  state.resources.stone = 1;
  const next = issueCommand(state, ['S_04', 'V_06', 'O_02']);
  expect(next.stats.commands).toBe(0);
  expect(next.voice).toBe(state.voice);
  expect(next.resources.stone).toBe(1);
  expect(next.units[0].action).toBe('idle');
});

it('keeps children out of recurring physical traditions while allowing their ordinary instincts', () => {
  let state = createGame();
  state.started = true;
  state.tier = 3;
  state.units = [state.units[6]];
  Object.assign(state.units[0], { intelligence: 9, age: 2, ...HOME });
  for (const id of ['C_02', 'V_04', 'O_03'])
    state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
  const tree = state.entities.find((entity) => entity.kind === 'tree')!;
  state = issueCommand(state, ['C_02', 'S_01', 'V_04', 'O_03'], {
    type: 'entity',
    id: tree.id,
    x: tree.x,
    y: tree.y,
  });
  expect(state.traditions).toHaveLength(1);
  state = tick(state, 0.25);
  expect(state.units[0].command).toBeUndefined();
  expect(state.units[0].action).not.toBe('gathering');
  expect(state.resources.wood).toBe(0);
});

it('assigns a stable sex to old saves whose person names overlap object properties', () => {
  for (const name of ['constructor', '__proto__', 'toString']) {
    const state = createGame();
    state.units[0].name = name;
    delete state.units[0].sex;
    const loaded = parseGame(serializeGame(state));
    expect(loaded).not.toBeNull();
    expect(['M', 'F']).toContain(resolveUnitSex(loaded!.units[0]));
  }
});
import { finishSeasonMemory, killUnit, seasonalCore } from './simulation';
import { updateUnits } from './simulation';
import { validSave } from './saveValidation';
import type { GameState, Unit } from './types';

/** These are declared seasonal fixtures, not campaigns from the opening. */
function family(sexes: ('M' | 'F')[] = ['M', 'F']) {
  const state = createGame(1);
  Object.assign(state, { started: true, time: 90, entities: [], cities: [], factions: [] });
  state.units = state.units.slice(0, sexes.length);
  for (const [i, unit] of state.units.entries())
    Object.assign(unit, {
      ...HOME,
      sex: sexes[i],
      hp: 100,
      hunger: 20,
      temp: 100,
      age: 6,
      strength: i === 0 ? 2 : 8,
      intelligence: i === 0 ? 4 : 10,
      sleptThisNight: true,
      action: 'sleeping',
    });
  return state;
}

function discover(state: GameState, wordId: string, custodians: Unit[]) {
  state.words[wordId] = { retention: 50, custodians: custodians.map((u) => u.id), uses: 0 };
  for (const unit of custodians) unit.knows.push(wordId);
}

describe('visible life stages and real family identities', () => {
  it('preserves the classic seed and gives guided Uma two preparation seasons', () => {
    const classic = createInitialState(6842),
      guided = createInitialState(6842, 'guided');
    expect(classic.units.map(resolveUnitSex)).toEqual(['M', 'F', 'F', 'M', 'F', 'F', 'M']);
    expect(classic.units.find((u) => u.name === 'Uma')!.age).toBe(14);
    expect(guided.units.find((u) => u.name === 'Uma')!.age).toBe(12);
    expect(guided.playMode).toBe('guided');
    expect(classic.playMode).toBe('classic');
    expect(guided.units.filter((u) => u.name !== 'Uma')).toEqual(
      classic.units.filter((u) => u.name !== 'Uma'),
    );
  });

  it('resolves legacy identities without consuming randomness or changing old saves', () => {
    const state = createGame(6842),
      expected = state.units.map(resolveUnitSex),
      seed = state.seed;
    for (const unit of state.units) delete unit.sex;
    expect(state.units.map(resolveUnitSex)).toEqual(expected);
    const legacy = { ...state.units[0], id: 'old-newborn-57', name: 'Voce 3' };
    expect(resolveUnitSex(legacy)).toBe(resolveUnitSex(structuredClone(legacy)));
    expect(legacy.sex).toBeUndefined();
    expect(state.seed).toBe(seed);
    expect(parseGame(serializeGame(state))).not.toBeNull();
  });

  it.each([
    [0, 'newborn'],
    [0.9, 'newborn'],
    [1, 'child'],
    [3, 'child'],
    [4, 'adult'],
    [13, 'adult'],
    [14, 'elder'],
  ] as const)('shows a visible life stage at age %s', (age, stage) => {
    expect(getLifeStage({ ...createGame().units[0], age })).toBe(stage);
  });

  it('pairs opposite sexes once each and leaves surplus adults unpaired', () => {
    const state = family(['F', 'M', 'F', 'F']);
    const pairs = pairFertileUnits(state.units);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].map(resolveUnitSex)).toEqual(['M', 'F']);
    expect(new Set(pairs.flat().map((u) => u.id)).size).toBe(2);
  });

  it('cannot create a birth from an all-male or all-female group', () => {
    for (const sex of ['M', 'F'] as const) {
      const state = family([sex, sex]);
      seasonalCore(state);
      expect(state.stats.births).toBe(0);
      expect(state.tribeEvents?.some((e) => e.kind === 'birth')).toBe(false);
    }
  });

  it('records a real newborn, both parent identities, inheritance and a unique personal name', () => {
    const state = family();
    seasonalCore(state);
    expect(state.stats.births).toBe(1);
    const newborn = state.units.find((u) => u.age === 0)!;
    expect(newborn.parentIds).toEqual(state.units.slice(0, 2).map((u) => u.id));
    expect([4, 6]).toContain(newborn.strength);
    expect([6, 8]).toContain(newborn.intelligence);
    expect(['M', 'F']).toContain(newborn.sex);
    expect(newborn.name).not.toMatch(/^Voce/);
    expect(newborn.bornAt).toBe(90);
    expect(newborn.knows).toEqual(INNATE_WORDS);
    expect(state.tribeEvents?.find((e) => e.kind === 'birth')).toMatchObject({
      unitId: newborn.id,
      time: 90,
      parentIds: newborn.parentIds,
    });
    expect(newbornName(state, newborn.sex!)).not.toBe(newborn.name);
    expect(parseGame(serializeGame(state))).not.toBeNull();
  });

  it('still requires rested parents at home rather than only a male/female count', () => {
    for (const reason of ['no-rest', 'hunger', 'away', 'elder'] as const) {
      const state = family(),
        mother = state.units[1];
      if (reason === 'no-rest') mother.sleptThisNight = false;
      if (reason === 'hunger') mother.hunger = 51;
      if (reason === 'away') mother.x += 11;
      if (reason === 'elder') mother.age = 14;
      seasonalCore(state);
      expect(state.stats.births).toBe(0);
    }
  });
});

describe('persistent tribe events and actual word loss', () => {
  it('records a death with its cause and distinguishes carried knowledge from actual lost words', () => {
    const state = family(),
      [father, mother] = state.units;
    discover(state, 'O_03', [father]);
    discover(state, 'O_02', [father, mother]);
    state.time = 35;
    killUnit(state, father, 'cold');
    expect(father.deathAt).toBe(35);
    expect(state.tribeEvents?.[0]).toMatchObject({
      kind: 'death',
      unitId: father.id,
      time: 35,
      cause: 'cold',
      wordIds: ['O_03', 'O_02'],
      lostWordIds: ['O_03'],
    });
    expect(state.tribeEvents?.filter((e) => e.kind === 'word-lost')).toMatchObject([
      { wordId: 'O_03', unitId: father.id, cause: 'custodian-death' },
    ]);
    expect(state.words.O_03.retention).toBe(0);
    expect(state.words.O_02.retention).toBe(25);
    expect(parseGame(serializeGame(state))).not.toBeNull();
    const history = structuredClone(state.tribeEvents);
    killUnit(state, father, 'cold');
    expect(state.tribeEvents).toEqual(history);
  });

  it('records forgetting only on the remembered-to-lost transition', () => {
    const state = family();
    discover(state, 'O_03', [state.units[0]]);
    state.words.O_03.retention = 1;
    finishSeasonMemory(state);
    expect(state.tribeEvents).toMatchObject([
      { kind: 'word-lost', wordId: 'O_03', cause: 'forgetting' },
    ]);
    const count = state.tribeEvents!.length;
    finishSeasonMemory(state);
    expect(state.tribeEvents).toHaveLength(count);
  });

  it('does not present a foreign death as a death inside the player tribe', () => {
    const state = family();
    state.units[0].factionId = 'foreign';
    killUnit(state, state.units[0], 'V_03');
    expect(state.tribeEvents).toEqual([]);
  });

  it('identifies a fatal plague wound without changing its damage or inventing a combat cause', () => {
    const state = family(),
      victim = state.units[0];
    state.time = 1;
    Object.assign(victim, { hp: 0.1, hunger: 40, plagueUntil: 30 });
    updateUnits(state, 0.25);
    expect(victim.hp).toBe(0);
    expect(state.tribeEvents?.find((event) => event.kind === 'death')).toMatchObject({
      unitId: victim.id,
      cause: 'STAT_PLAGUE',
    });
  });

  it('bounds and round-trips the history with newest events first', () => {
    const state = family();
    for (let i = 0; i < TRIBE_EVENT_LIMIT + 5; i++) {
      state.time = i;
      recordTribeEvent(state, { kind: 'word-lost', wordId: 'O_03', cause: 'forgetting' });
    }
    expect(state.tribeEvents).toHaveLength(TRIBE_EVENT_LIMIT);
    expect(state.tribeEvents![0].time).toBe(TRIBE_EVENT_LIMIT + 4);
    expect(parseGame(serializeGame(state))?.tribeEvents).toEqual(state.tribeEvents);
  });

  it('keeps old saves valid and rejects corrupted lifecycle metadata', () => {
    const legacy = createGame();
    delete legacy.tribeEvents;
    delete legacy.playMode;
    for (const u of legacy.units) {
      delete u.sex;
      delete u.parentIds;
    }
    expect(validSave(legacy)).toBe(true);
    for (const corrupt of [
      (s: GameState) => {
        s.units[0].sex = 'X' as never;
      },
      (s: GameState) => {
        s.units[0].parentIds = ['same', 'same'];
      },
      (s: GameState) => {
        s.units[0].bornAt = -1;
      },
      (s: GameState) => {
        s.playMode = 'instant' as never;
      },
      (s: GameState) => {
        s.tribeEvents = [{ id: 'bad', time: 0, kind: 'birth' }];
      },
      (s: GameState) => {
        s.tribeEvents = [{ id: 'bad', time: 0, kind: 'word-lost', wordId: 'UNKNOWN' }];
      },
    ]) {
      const state = createGame();
      corrupt(state);
      expect(parseGame(serializeGame(state))).toBeNull();
    }
  });
});
