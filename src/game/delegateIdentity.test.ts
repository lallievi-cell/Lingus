import { describe, expect, it } from 'vitest';
import { emptyInventory, WORD_ORDER } from './content';
import { createGame, dismissCampfire, issueCommand, tick } from './engine';
import { allocateCityWorkers, cityPopulation } from './imperial';
import { validSave } from './saveValidation';
import type { City, GameState } from './types';

/** Prepared named residents isolate the mission's identity and cohort lifecycle. */
function fixture(anonymousSages = 0) {
  const state = createGame(6842);
  Object.assign(state, {
    started: true,
    paused: false,
    tier: 5,
    urbanized: true,
    time: 10,
    entities: [],
    buildings: [],
    caravans: [],
  });
  const host = structuredClone(state.cities[0]);
  Object.assign(host, {
    x: 290,
    y: 250,
    sectorX: 2,
    sectorY: 2,
    capital: false,
    cohorts: { workers: 4, warriors: 0, sages: 1, slaves: 0 },
    resources: { ...emptyInventory(), food: 40 },
    words: ['S_01', 'V_01', 'V_02', 'V_03'],
    buildingIds: [],
    housing: 5,
  });
  const capital: City = {
    ...structuredClone(host),
    id: 'capital',
    name: 'La Capitale',
    x: 250,
    factionId: 'player',
    capital: true,
    cohorts: { workers: 4, warriors: 0, sages: 4 + anonymousSages, slaves: 0 },
    resources: { ...emptyInventory(), food: 60, coin: 1000 },
    housing: 8 + anonymousSages,
    words: [...WORD_ORDER],
  };
  state.cities = [capital, host];
  state.factions = state.factions.filter((faction) => faction.id === host.factionId);
  Object.assign(state.factions[0], { words: [...host.words], relation: 50, hostile: false });
  state.resources = capital.resources;
  const template = state.units[0];
  state.units = Array.from({ length: 8 }, (_, index) => ({
    ...structuredClone(template),
    id: `resident-${index}`,
    name: `Residente ${index}`,
    cityId: capital.id,
    x: 250,
    y: 250,
    age: 6,
    strength: 5,
    intelligence: index < 4 ? 5 : 9,
    caste: index < 4 ? ('citizen' as const) : ('sage' as const),
    hp: 100,
    hunger: 0,
    temp: 100,
    action: 'idle',
    command: undefined,
    knows: [...WORD_ORDER],
    eventMemory: [],
    tension: {},
    cooldowns: {},
  }));
  state.words = Object.fromEntries(
    WORD_ORDER.map((id) => [
      id,
      {
        retention: 100,
        custodians: state.units.map((unit) => unit.id),
        uses: 0,
      },
    ]),
  );
  state.buildings.push({
    id: 'archive',
    kind: 'archive',
    x: 250,
    y: 250,
    cityId: capital.id,
    hp: 100,
    active: true,
    completed: true,
    workerIds: [],
  });
  capital.buildingIds.push('archive');
  allocateCityWorkers(state, capital);
  return state;
}
const capital = (state: GameState) => state.cities.find((city) => city.id === 'capital')!;
const host = (state: GameState) => state.cities.find((city) => city.id !== 'capital')!;
const namedAt = (state: GameState, cityId: string) =>
  state.units.filter((unit) => unit.hp > 0 && unit.cityId === cityId);
function send(state: GameState) {
  const destination = host(state);
  return issueCommand(state, ['S_04', 'V_04', 'O_09', 'S_09'], {
    type: 'city',
    id: destination.id,
    x: destination.x,
    y: destination.y,
  });
}
function advance(state: GameState, seconds: number) {
  const until = state.time + seconds;
  while (state.time < until && !state.gameOver && !state.victory) {
    state = tick(state, Math.min(0.25, until - state.time));
    if (state.campfirePending) state = dismissCampfire(state);
  }
  return state;
}

describe('named Sages and the same counted delegate', () => {
  it('departs a real resident, releases the actual source job and transfers only after travelling', () => {
    let state = fixture();
    const population = state.cities.reduce((sum, city) => sum + cityPopulation(city), 0);
    expect(state.buildings[0].lastEfficiency).toBe(1);
    state = send(state);
    expect(state.stats.commands).toBe(1);
    const id = state.caravans[0].delegateUnitId!;
    const person = state.units.find((unit) => unit.id === id)!;
    expect(id).toBeDefined();
    expect(person.cityId).toBeUndefined();
    expect(person.action).toBe('delegating');
    expect(namedAt(state, capital(state).id)).toHaveLength(cityPopulation(capital(state)));
    expect(capital(state).cohorts.sages).toBe(3);
    expect(state.buildings[0].lastEfficiency).toBe(0.75);
    expect(state.buildings[0].workerIds).not.toContain(id);
    expect(state.words.O_09.custodians).toContain(id);
    state = advance(state, 2);
    expect(state.caravans[0].arrived).not.toBe(true);
    expect(state.units.find((unit) => unit.id === id)!.x).toBe(state.caravans[0].x);
    expect(state.caravans[0].x).toBeGreaterThan(250);
    expect(host(state).cohorts.sages).toBe(1);
    state = advance(state, 10);
    expect(state.caravans[0].arrived).toBe(true);
    expect(state.units.find((unit) => unit.id === id)!).toMatchObject({
      cityId: host(state).id,
      x: 290,
      y: 250,
    });
    expect(host(state).cohorts.sages).toBe(2);
    expect(namedAt(state, host(state).id)).toHaveLength(1);
    expect(state.cities.reduce((sum, city) => sum + cityPopulation(city), 0)).toBe(population);
    expect(validSave(state)).toBe(true);
  });

  it('feeds the arrived named teacher from the actual host store without charging the capital', () => {
    let state = advance(send(fixture()), 12);
    const person = state.units.find((unit) => unit.id === state.caravans[0].delegateUnitId)!;
    person.hunger = 65;
    const ownFood = state.resources.food;
    const hostFood = host(state).resources.food;
    state = advance(state, 0.25);
    expect(host(state).resources.food).toBe(hostFood - 1);
    expect(state.resources.food).toBe(ownFood);
    expect(state.units.find((unit) => unit.id === person.id)!.hunger).toBeCloseTo(40.2);
  });

  it('does not extend host-store access to an unrelated player identity without a real mission', () => {
    let state = fixture();
    const visitor = {
      ...structuredClone(state.units[0]),
      id: 'unrelated-visitor',
      cityId: host(state).id,
      x: host(state).x,
      y: host(state).y,
      hunger: 65,
    };
    state.units.push(visitor);
    host(state).cohorts.workers++;
    state = advance(send(state), 12);
    const teacher = state.units.find((unit) => unit.id === state.caravans[0].delegateUnitId)!;
    teacher.hunger = 65;
    const hostFood = host(state).resources.food;
    state = advance(state, 0.25);
    expect(host(state).resources.food).toBe(hostFood - 1);
    expect(state.units.find((unit) => unit.id === visitor.id)!.hunger).toBe(65);
    expect(state.units.find((unit) => unit.id === teacher.id)!.hunger).toBeCloseTo(40.2);
  });

  it('returns the same identity physically after refusal and restores its cohort exactly once', () => {
    let state = advance(send(fixture()), 2);
    const id = state.caravans[0].delegateUnitId!;
    state.factions[0].hostile = true;
    state.factions[0].relation = -100;
    for (let step = 0; step < 40 && !state.caravans[0].returning; step++)
      state = advance(state, 0.25);
    expect(state.caravans[0].returning).toBe(true);
    expect(state.caravans[0].arrived).not.toBe(true);
    expect(capital(state).cohorts.sages).toBe(3);
    expect(state.units.find((unit) => unit.id === id)!.cityId).toBeUndefined();
    state = advance(state, 10);
    expect(state.caravans[0].arrived).toBe(true);
    expect(state.caravans[0].delegateUnitId).toBeUndefined();
    expect(state.units.find((unit) => unit.id === id)!).toMatchObject({
      cityId: 'capital',
      x: 250,
      y: 250,
    });
    expect(capital(state).cohorts.sages).toBe(4);
    expect(namedAt(state, 'capital')).toHaveLength(8);
    expect(host(state).cohorts.sages).toBe(1);
    state = advance(state, 8);
    expect(capital(state).cohorts.sages).toBe(4);
  });

  it('settles a real transit death without deducting the origin Sage a second time', () => {
    let state = advance(send(fixture()), 2);
    const person = state.units.find((unit) => unit.id === state.caravans[0].delegateUnitId)!;
    Object.assign(person, { hp: 0.1, hunger: 100 });
    state.words.O_13.custodians = [person.id];
    state = advance(state, 0.25);
    expect(state.units.find((unit) => unit.id === person.id)!.action).toBe('dead');
    expect(state.caravans[0]).toMatchObject({
      population: 0,
      hp: 0,
      arrived: true,
      delegateCount: 0,
    });
    expect(capital(state).cohorts.sages).toBe(3);
    expect(host(state).cohorts.sages).toBe(1);
    expect(state.stats.deaths).toBe(1);
    expect(state.words.O_13.retention).toBe(0);
    state = advance(state, 12);
    expect(state.stats.deaths).toBe(1);
    expect(capital(state).cohorts.sages).toBe(3);
  });

  it('charges an arrived teacher death to the host and stops its cultural delegation once', () => {
    let state = advance(send(fixture()), 12);
    const person = state.units.find((unit) => unit.id === state.caravans[0].delegateUnitId)!;
    Object.assign(person, { hp: 0.1, hunger: 100 });
    expect(host(state).assimilation.delegateCount).toBe(1);
    state = advance(state, 0.25);
    expect(state.units.find((unit) => unit.id === person.id)!.action).toBe('dead');
    expect(capital(state).cohorts.sages).toBe(3);
    expect(host(state).cohorts.sages).toBe(1);
    expect(host(state).assimilation).toEqual({ delegateCount: 0, active: false });
    expect(state.stats.deaths).toBe(1);
    state = advance(state, 8);
    expect(host(state).cohorts.sages).toBe(1);
    expect(state.stats.deaths).toBe(1);
  });

  it('kills an identity in a destroyed travelling caravan once at its actual position', () => {
    let state = advance(send(fixture()), 2);
    const id = state.caravans[0].delegateUnitId!;
    const point = { x: state.caravans[0].x, y: state.caravans[0].y };
    state.caravans[0].hp = 0;
    state = advance(state, 0.25);
    expect(state.units.find((unit) => unit.id === id)!).toMatchObject({
      hp: 0,
      action: 'dead',
      ...point,
    });
    expect(
      state.entities.some(
        (entity) => entity.kind === 'corpse' && entity.x === point.x && entity.y === point.y,
      ),
    ).toBe(true);
    expect(state.caravans[0].population).toBe(0);
    expect(capital(state).cohorts.sages).toBe(3);
    expect(state.stats.deaths).toBe(1);
    state = advance(state, 12);
    expect(state.stats.deaths).toBe(1);
    expect(host(state).cohorts.sages).toBe(1);
  });

  it('preserves the anonymous-cohort path without inventing a named person', () => {
    let state = send(fixture(1));
    expect(state.caravans[0].delegateUnitId).toBeUndefined();
    expect(state.units).toHaveLength(8);
    expect(capital(state).cohorts.sages).toBe(4);
    expect(state.buildings[0].lastEfficiency).toBe(1);
    state = advance(state, 12);
    expect(host(state).cohorts.sages).toBe(2);
    expect(namedAt(state, host(state).id)).toHaveLength(0);
    expect(state.units).toHaveLength(8);
  });

  it('cannot send a free duplicate when every named Sage is the King or already on the frontline', () => {
    let state = fixture();
    for (const person of state.units.filter((unit) => unit.caste === 'sage'))
      person.action = 'frontline';
    state.units[4].isKing = true;
    state.units[4].action = 'idle';
    const voice = state.voice;
    state = send(state);
    expect(state.stats.commands).toBe(0);
    expect(state.voice).toBe(voice);
    expect(capital(state).cohorts.sages).toBe(4);
    expect(state.caravans).toEqual([]);
  });

  it('rejects malformed or multiply attached identities while keeping the additive field optional', () => {
    const state = send(fixture());
    expect(validSave(state)).toBe(true);
    for (const invalid of [42, 'missing-person']) {
      const broken = structuredClone(state);
      (broken.caravans[0] as unknown as { delegateUnitId: unknown }).delegateUnitId = invalid;
      expect(validSave(broken)).toBe(false);
    }
    const duplicate = structuredClone(state);
    duplicate.caravans.push({ ...structuredClone(duplicate.caravans[0]), id: 'another-caravan' });
    expect(validSave(duplicate)).toBe(false);
    const legacy = structuredClone(state);
    delete legacy.caravans[0].delegateUnitId;
    expect(validSave(legacy)).toBe(true);
  });
});
