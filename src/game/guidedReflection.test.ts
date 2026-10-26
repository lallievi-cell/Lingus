import { describe, expect, it } from 'vitest';
import { WORDS } from './content';
import { createGame, issueCommand, prepareCampfireCouncil, solveSpark, tick } from './engine';
import { consume, killUnit } from './simulation';
import type { GameState } from './types';

/** Isolated reflection fixtures; food, work and their events are earned below. */
function community(
  options: {
    mode?: 'guided' | 'classic';
    wood?: number;
    fire?: boolean;
    fireState?: 'inactive' | 'incomplete' | 'foreign' | 'destroyed';
    fireOffset?: number;
    remoteCaptive?: boolean;
    remoteObservers?: boolean;
    captiveOffset?: number;
    observerOffset?: number;
    observers?: 0 | 1 | 2;
    captiveHunger?: number;
    formerCaptive?: boolean;
    missingWord?: 'S_02' | 'S_06';
    time?: number;
    pending?: boolean;
  } = {},
) {
  const state = createGame(6842, options.mode ?? 'guided');
  const foreignCity = state.cities[0];
  const foreignFaction = state.factions.find((faction) => faction.id === foreignCity.factionId)!;
  Object.assign(state, {
    started: true,
    tier: 3,
    time: options.time ?? 100,
    campfirePending: options.pending ?? true,
    attention: 0,
    cities: [],
    factions: [],
    entities: [],
    buildings: [],
  });
  const template = state.units[0];
  state.units = [
    {
      ...structuredClone(template),
      id: 'observer',
      name: 'Ena',
      intelligence: 9,
      caste: 'citizen' as const,
    },
    {
      ...structuredClone(template),
      id: 'other-observer',
      name: 'Ori',
      intelligence: 8,
      caste: 'citizen' as const,
    },
    {
      ...structuredClone(template),
      id: 'captive',
      name: 'Taro',
      intelligence: 9,
      caste: options.formerCaptive ? ('citizen' as const) : ('slave' as const),
      emancipated: options.formerCaptive ?? false,
    },
  ]
    .filter((unit, index) => unit.id === 'captive' || index < (options.observers ?? 2))
    .map((unit) => ({
      ...unit,
      x:
        state.home.x +
        (unit.id === 'captive'
          ? (options.captiveOffset ?? (options.remoteCaptive ? 30 : 0))
          : (options.observerOffset ?? (options.remoteObservers ? 30 : 0))),
      y: state.home.y,
      age: 6,
      hunger: unit.id === 'captive' ? (options.captiveHunger ?? 65) : 0,
      hp: 100,
      temp: 100,
      action: 'idle',
      command: undefined,
      eventMemory: [],
      tension: {},
      lastEventAt: {},
      knows: ['S_01', 'V_01', 'V_02', 'V_03'],
    }));
  for (const id of ['S_02', 'S_06', 'O_05']) {
    if (id === options.missingWord) continue;
    state.words[id] = {
      retention: 100,
      uses: 0,
      custodians: state.units.filter((unit) => unit.caste !== 'slave').map((unit) => unit.id),
    };
    for (const unit of state.units.filter((person) => person.caste !== 'slave'))
      unit.knows.push(id);
  }
  Object.assign(state.resources, { wood: options.wood ?? 6, food: 3 });
  if (options.fire !== false)
    state.buildings.push({
      id: 'fire',
      kind: 'campfire',
      x: state.home.x + (options.fireOffset ?? 0),
      y: state.home.y,
      hp: options.fireState === 'destroyed' ? 0 : 100,
      active: options.fireState !== 'inactive',
      completed: options.fireState !== 'incomplete',
      cityId: options.fireState === 'foreign' ? foreignCity.id : undefined,
    });
  if (options.fireState === 'foreign') {
    state.cities.push(foreignCity);
    state.factions.push(foreignFaction);
  }
  if (options.remoteCaptive || options.captiveOffset)
    state.entities.push({
      id: 'remote-berries',
      kind: 'berries',
      x: state.home.x + (options.captiveOffset ?? 30),
      y: state.home.y,
      hp: 1,
      maxHp: 1,
      amount: 3,
    });
  return state;
}
const captive = (state: GameState) => state.units.find((unit) => unit.id === 'captive')!;
function feedCaptive(state: GameState) {
  const person = captive(state);
  const berries = state.entities.find((entity) => entity.id === 'remote-berries');
  expect(consume(state, person, berries)).toBe(true);
  expect(person.lastEventAt?.MEAL).toBe(state.time);
}
const freedomSpark = (state: GameState) => state.sparks.find((spark) => spark.wordId === 'M_05');

function workplace(
  options: {
    mode?: 'guided' | 'classic';
    time?: number;
    hunger?: number;
    continuous?: boolean;
    remote?: boolean;
  } = {},
) {
  const state = createGame(6842, options.mode ?? 'guided');
  Object.assign(state, {
    started: true,
    tier: 3,
    time: options.time ?? 10,
    cities: [],
    factions: [],
    entities: [],
    buildings: [],
  });
  state.units = state.units.slice(0, 1);
  Object.assign(state.units[0], {
    ...state.home,
    age: 6,
    hunger: options.hunger ?? 69.8,
    temp: 100,
    hp: 100,
    intelligence: 9,
    strength: 5,
    caste: 'citizen',
    action: 'idle',
    command: undefined,
    eventMemory: [],
    tension: {},
    lastEventAt: {},
  });
  for (const id of ['C_02', 'M_01', 'V_09', 'O_04', 'O_01', 'O_05']) {
    state.words[id] = { retention: 100, uses: 0, custodians: [state.units[0].id] };
    if (!state.units[0].knows.includes(id)) state.units[0].knows.push(id);
  }
  Object.assign(state.resources, { food: 0, meat: 0, cooked: 0, wood: 8, seed: 3 });
  state.buildings.push({
    id: 'farm',
    kind: 'farm',
    x: state.home.x + (options.remote ? 50 : 0),
    y: state.home.y,
    hp: 100,
    active: true,
    completed: true,
    workerIds: [],
  });
  state.buildings.push({
    id: 'fire',
    kind: 'campfire',
    ...state.home,
    hp: 100,
    active: true,
    completed: true,
  });
  const farm = state.buildings[0];
  const tokens = [...(options.continuous === false ? [] : ['C_02']), 'S_01', 'V_09', 'O_04'];
  return issueCommand(state, tokens, { type: 'building', id: farm.id, x: farm.x, y: farm.y });
}
function advance(state: GameState, seconds: number) {
  const until = state.time + seconds;
  while (state.time < until && !state.gameOver && !state.campfirePending)
    state = tick(state, Math.min(0.25, until - state.time));
  return state;
}
const disobedience = (state: GameState) =>
  state.units[0].eventMemory?.filter((event) => event.tag === 'ENV_DISOBEDIENCE') ?? [];

describe('Guided reflection from a real shared captive meal', () => {
  it('spends actual fuel for the normal freedom intuition without freeing anyone or creating a slave custodian', () => {
    let state = community();
    const food = state.resources.food;
    feedCaptive(state);
    expect(state.resources.food).toBe(food - 1);
    state = prepareCampfireCouncil(state);
    expect(state.resources.wood).toBe(4);
    expect(state.attention).toBe(10);
    const spark = freedomSpark(state)!;
    expect(spark).toBeDefined();
    expect(spark.recipe).toEqual(WORDS.M_05.recipe);
    expect(spark.eventLabel).toBe(
      'Condividere il pasto rivela che anche il prigioniero è un individuo.',
    );
    expect(spark.unitId).not.toBe('captive');
    expect(state.words.M_05).toBeUndefined();
    expect(state.emancipated).toBe(false);
    expect(captive(state).caste).toBe('slave');
    state = solveSpark(state, spark.id, spark.recipe);
    expect(state.words.M_05.retention).toBe(50);
    expect(state.words.M_05.custodians).toEqual([spark.unitId]);
    expect(state.words.M_05.custodians).not.toContain('captive');
    expect(state.emancipated).toBe(false);
    expect(captive(state).caste).toBe('slave');
  });

  it.each(['absent', 'remote', 'dead', 'no-observer', 'no-fire', 'no-wood', 'classic'] as const)(
    'does not manufacture the experience when the meal is %s',
    (scenario) => {
      let state = community({
        mode: scenario === 'classic' ? 'classic' : 'guided',
        remoteCaptive: scenario === 'remote',
        remoteObservers: scenario === 'no-observer',
        fire: scenario !== 'no-fire',
        wood: scenario === 'no-wood' ? 1 : 6,
      });
      if (scenario !== 'absent') feedCaptive(state);
      if (scenario === 'dead') killUnit(state, captive(state), 'oldAge');
      const wood = state.resources.wood;
      state = prepareCampfireCouncil(state);
      expect(freedomSpark(state)).toBeUndefined();
      expect(state.words.M_05).toBeUndefined();
      expect(
        state.units
          .flatMap((unit) => unit.eventMemory ?? [])
          .some((event) => event.tag === 'ENV_SHARED_CAPTIVE_MEAL'),
      ).toBe(false);
      if (['no-fire', 'no-wood', 'classic'].includes(scenario)) {
        expect(state.resources.wood).toBe(wood);
        expect(state.attention).toBe(0);
      }
    },
  );

  it.each(['inactive', 'incomplete', 'foreign', 'destroyed'] as const)(
    'requires a real usable player hearth rather than an %s fire',
    (fireState) => {
      let state = community({ fireState });
      feedCaptive(state);
      state = prepareCampfireCouncil(state);
      expect(freedomSpark(state)).toBeUndefined();
      expect(state.resources.wood).toBe(6);
      expect(state.attention).toBe(0);
    },
  );

  it.each(['remote-hearth', 'captive-outside-hearth', 'observers-outside-hearth'] as const)(
    'requires actual shared proximity to both the home and the hearth: %s',
    (scenario) => {
      let state = community({
        fireOffset: scenario === 'remote-hearth' ? 30 : 14,
        captiveOffset: scenario === 'captive-outside-hearth' ? -14 : 0,
        observerOffset: scenario === 'observers-outside-hearth' ? -14 : 0,
      });
      feedCaptive(state);
      state = prepareCampfireCouncil(state);
      expect(freedomSpark(state)).toBeUndefined();
      expect(state.words.M_05).toBeUndefined();
      expect(state.resources.wood).toBe(4);
      expect(state.attention).toBe(10);
    },
  );

  it.each(['S_02', 'S_06'] as const)(
    'does not replace the missing %s prerequisite with a free word',
    (missingWord) => {
      let state = community({ missingWord });
      feedCaptive(state);
      state = prepareCampfireCouncil(state);
      expect(freedomSpark(state)).toBeUndefined();
      expect(state.words.M_05).toBeUndefined();
    },
  );

  it('requires a separate witness even when the person eating is already emancipated', () => {
    let state = community({ observers: 0, formerCaptive: true });
    feedCaptive(state);
    state = prepareCampfireCouncil(state);
    expect(freedomSpark(state)).toBeUndefined();
    expect(captive(state).eventMemory).not.toContainEqual(
      expect.objectContaining({ tag: 'ENV_SHARED_CAPTIVE_MEAL' }),
    );
  });

  it('requires actual satiation as well as an actual meal', () => {
    let state = community({ captiveHunger: 90 });
    feedCaptive(state);
    expect(captive(state).hunger).toBe(65);
    state = prepareCampfireCouncil(state);
    expect(freedomSpark(state)).toBeUndefined();
  });

  it('requires a recent actual meal even when the person remains satiated at the next council', () => {
    let state = community({ time: 116, pending: false });
    feedCaptive(state);
    expect(consume(state, captive(state))).toBe(true);
    expect(consume(state, captive(state))).toBe(true);
    expect(captive(state).hunger).toBe(0);
    state = advance(state, 64);
    expect(state.time).toBe(180);
    expect(state.campfirePending).toBe(true);
    expect(captive(state).hunger).toBeLessThan(60);
    expect(state.time - captive(state).lastEventAt!.MEAL).toBe(64);
    state = prepareCampfireCouncil(state);
    expect(freedomSpark(state)).toBeUndefined();
  });

  it('also permits reflection on the real meal of a former emancipated captive', () => {
    let state = community({ formerCaptive: true });
    feedCaptive(state);
    state = prepareCampfireCouncil(state);
    expect(freedomSpark(state)?.recipe).toEqual(WORDS.M_05.recipe);
    expect(captive(state).emancipated).toBe(true);
  });

  it('can rediscover freedom after its last custodian dies, using a surviving actual witness and a second paid council extension', () => {
    let state = community();
    feedCaptive(state);
    state = prepareCampfireCouncil(state);
    const first = freedomSpark(state)!;
    state = solveSpark(state, first.id, first.recipe);
    killUnit(state, state.units.find((unit) => unit.id === first.unitId)!, 'oldAge');
    expect(state.words.M_05.retention).toBe(0);
    expect(state.words.M_05.custodians).toEqual([]);
    state = prepareCampfireCouncil(state);
    const second = freedomSpark(state)!;
    expect(second).toBeDefined();
    expect(second.unitId).not.toBe(first.unitId);
    expect(second.unitId).not.toBe('captive');
    expect(second.recipe).toEqual(WORDS.M_05.recipe);
    expect(state.resources.wood).toBe(2);
    state = solveSpark(state, second.id, second.recipe);
    expect(state.words.M_05.custodians).toEqual([second.unitId]);
    expect(state.emancipated).toBe(false);
    expect(captive(state).caste).toBe('slave');
  });
});

describe('Guided reflection on an actually interrupted permanent building job', () => {
  it('records a normal Altrimenti intuition only after real work is interrupted by daytime hunger', () => {
    let state = workplace();
    expect(state.traditions).toHaveLength(1);
    state = advance(state, 8);
    const person = state.units[0];
    const farm = state.buildings.find((building) => building.id === 'farm')!;
    expect(farm.seasonWork?.['0']?.workerSeconds[person.id]).toBeGreaterThanOrEqual(5);
    expect(person.hunger).toBeGreaterThanOrEqual(75);
    expect(person.jobBuildingId).toBeUndefined();
    expect(person.suspendedJob?.buildingId).toBe('farm');
    expect(person.command).toBeUndefined();
    expect(disobedience(state)).toHaveLength(1);
    const spark = state.sparks.find((entry) => entry.wordId === 'C_03')!;
    expect(spark).toBeDefined();
    expect(spark.recipe).toEqual(WORDS.C_03.recipe);
    expect(state.words.C_03).toBeUndefined();
    state = solveSpark(state, spark.id, spark.recipe);
    expect(state.words.C_03.custodians).toEqual([person.id]);
    expect(state.laws).toEqual([]);
  });

  it.each(['short-work', 'still-travelling', 'direct-order', 'classic'] as const)(
    'does not treat %s as a worked permanent duty being violated',
    (scenario) => {
      const state = advance(
        workplace({
          mode: scenario === 'classic' ? 'classic' : 'guided',
          hunger: scenario === 'short-work' ? 74.5 : 69.8,
          remote: scenario === 'still-travelling',
          continuous: scenario !== 'direct-order',
        }),
        8,
      );
      expect(state.units[0].hunger).toBeGreaterThanOrEqual(75);
      expect(disobedience(state)).toEqual([]);
      expect(state.sparks.some((spark) => spark.wordId === 'C_03')).toBe(false);
    },
  );

  it('keeps ordinary nighttime rest separate even after a real shift longer than five seconds', () => {
    const state = advance(workplace({ time: 54, hunger: 20 }), 10);
    const person = state.units[0];
    expect(state.buildings[0].seasonWork?.['0']?.workerSeconds[person.id]).toBeGreaterThanOrEqual(
      5,
    );
    expect(person.jobBuildingId).toBeUndefined();
    expect(person.suspendedJob?.buildingId).toBe('farm');
    expect(person.sleptThisNight).toBe(true);
    expect(disobedience(state)).toEqual([]);
    expect(state.sparks.some((spark) => spark.wordId === 'C_03')).toBe(false);
  });
});
