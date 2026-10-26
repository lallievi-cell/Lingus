import { describe, expect, it } from 'vitest';
import { emptyInventory, WORD_ORDER } from './content';
import { createGame, dismissCampfire, issueCommand, tick } from './engine';
import { cityPopulation, updateImperial } from './imperial';
import { killUnit } from './simulation';
import type { City, GameState, Unit } from './types';

/** Prepared urban capture isolates the same person's travel, census and death.
 * No faction population or player resident is created after the real capture.
 */
function fixture(mode: 'guided' | 'classic' = 'classic') {
  const state = createGame(6842, mode);
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
  const foreign = state.cities[0];
  Object.assign(foreign, {
    x: 290,
    y: 250,
    sectorX: 2,
    sectorY: 2,
    cohorts: { workers: 4, warriors: 1, sages: 0, slaves: 0 },
    garrisonHp: 100,
  });
  const capital: City = {
    ...structuredClone(foreign),
    id: 'capital',
    name: 'La Capitale',
    x: 250,
    factionId: 'player',
    capital: true,
    cohorts: { workers: 4, warriors: 1, sages: 0, slaves: 0 },
    resources: { ...emptyInventory(), food: 60 },
    words: [...WORD_ORDER],
    housing: 10,
    buildingIds: [],
    vocations: [],
    dogmas: [],
    assimilation: { delegateCount: 0, active: false },
  };
  state.cities = [capital, foreign];
  state.factions = state.factions.filter((faction) => faction.id === foreign.factionId);
  Object.assign(state.factions[0], { relation: 0, hostile: false });
  state.resources = capital.resources;
  const attacker = state.units[0];
  Object.assign(attacker, {
    x: 290,
    y: 250,
    hp: 100,
    hunger: 0,
    temp: 100,
    age: 6,
    caste: 'warrior',
    factionId: 'player',
    cityId: capital.id,
    isKing: true,
  });
  state.kingId = attacker.id;
  state.government = 'monarchy';
  const captive: Unit = {
    ...structuredClone(attacker),
    id: 'foreign-captive',
    name: 'Il prigioniero',
    hp: 1,
    caste: 'warrior',
    factionId: foreign.factionId,
    cityId: foreign.id,
    action: 'idle',
    progress: 0,
    command: undefined,
  };
  state.units = [attacker, captive];
  state.words = Object.fromEntries(
    WORD_ORDER.map((id) => [id, { retention: 100, custodians: [attacker.id], uses: 0 }]),
  );
  // Prevent an unrelated prepared cultural victory.
  state.words.O_14.retention = 99;
  return state;
}
const capital = (state: GameState) => state.cities.find((city) => city.id === 'capital')!;
const captive = (state: GameState) => state.units.find((unit) => unit.id === 'foreign-captive')!;
function capture(state: GameState) {
  const person = captive(state);
  let current = issueCommand(
    state,
    ['S_01', 'V_03', 'S_05', 'V_05'],
    { type: 'unit', id: person.id, x: person.x, y: person.y },
    undefined,
    { type: 'point', x: person.x, y: person.y },
  );
  current = advance(current, 3);
  expect(captive(current).caste).toBe('slave');
  expect(captive(current).cityId).toBeUndefined();
  return current;
}
function homeward(state: GameState) {
  return issueCommand(state, ['S_06', 'V_01', 'O_01']);
}
function advance(state: GameState, seconds: number) {
  const until = state.time + seconds;
  let current = state;
  while (current.time < until && !current.gameOver && !current.victory) {
    current = tick(current, Math.min(0.25, until - current.time));
    if (current.campfirePending) current = dismissCampfire(current);
  }
  return current;
}

describe('urban field captives remain the same counted person', () => {
  it.each(['classic', 'guided'] as const)(
    'counts pressure outside the city without changing the %s coefficient',
    (mode) => {
      const state = capture(fixture(mode));
      const population = cityPopulation(capital(state));
      const pressure = state.revoltTension;
      const position = { x: captive(state).x, y: captive(state).y };
      state.time += 60;
      updateImperial(state, 60);
      expect(state.revoltTension - pressure).toBeCloseTo(0.5);
      expect(capital(state).revoltTension).toBe(0);
      expect(cityPopulation(capital(state))).toBe(population);
      expect(captive(state).cityId).toBeUndefined();
      expect({ x: captive(state).x, y: captive(state).y }).toEqual(position);
    },
  );

  it('adds existing city slaves and the field captive without double counting either', () => {
    const initial = fixture();
    capital(initial).cohorts.slaves = 2;
    const state = capture(initial);
    const pressure = state.revoltTension;
    const localPressure = capital(state).revoltTension;
    state.time += 60;
    updateImperial(state, 60);
    expect(state.revoltTension - pressure).toBeCloseTo(1.5);
    expect(capital(state).revoltTension - localPressure).toBeCloseTo(1);
    expect(capital(state).cohorts.slaves).toBe(2);
    expect(captive(state).cityId).toBeUndefined();
  });

  it('enters a real own city only after walking home and never duplicates the cohort', () => {
    let state = capture(fixture());
    const population = cityPopulation(capital(state));
    state = homeward(state);
    expect(captive(state).cityId).toBeUndefined();
    state = advance(state, 2);
    expect(captive(state).x).toBeLessThan(290);
    expect(captive(state).x).toBeGreaterThan(260);
    expect(capital(state).cohorts.slaves).toBe(0);
    state = advance(state, 10);
    expect(captive(state).cityId).toBe('capital');
    expect(Math.hypot(captive(state).x - 250, captive(state).y - 250)).toBeLessThanOrEqual(10);
    expect(capital(state).cohorts.slaves).toBe(1);
    expect(cityPopulation(capital(state))).toBe(population + 1);
    const pressure = state.revoltTension;
    state.time += 60;
    updateImperial(state, 60);
    expect(state.revoltTension - pressure).toBeCloseTo(0.5);
    expect(capital(state).cohorts.slaves).toBe(1);
    expect(state.units).toHaveLength(2);
  });

  it('does not charge a city cohort for a field death and cannot enrol the corpse', () => {
    const state = capture(fixture());
    const population = cityPopulation(capital(state));
    killUnit(state, captive(state), 'V_03');
    const deaths = state.stats.deaths;
    const pressure = state.revoltTension;
    state.time += 60;
    updateImperial(state, 60);
    expect(cityPopulation(capital(state))).toBe(population);
    expect(capital(state).cohorts.slaves).toBe(0);
    expect(captive(state).cityId).toBeUndefined();
    expect(state.revoltTension).toBe(pressure);
    killUnit(state, captive(state), 'V_03');
    expect(state.stats.deaths).toBe(deaths);
  });

  it('removes a settled captive from the actual cohort exactly once on death', () => {
    let state = capture(fixture());
    const population = cityPopulation(capital(state));
    state = advance(homeward(state), 12);
    expect(capital(state).cohorts.slaves).toBe(1);
    killUnit(state, captive(state), 'V_03');
    killUnit(state, captive(state), 'V_03');
    updateImperial(state, 1);
    expect(capital(state).cohorts.slaves).toBe(0);
    expect(cityPopulation(capital(state))).toBe(population);
    expect(state.stats.deaths).toBe(1);
  });

  it('can free the real field captive and count a worker only when they reach home', () => {
    let state = capture(fixture());
    const population = cityPopulation(capital(state));
    state = homeward(state);
    state = issueCommand(state, ['C_02', 'S_01', 'M_05']);
    expect(captive(state).caste).toBe('citizen');
    expect(captive(state).emancipated).toBe(true);
    expect(captive(state).cityId).toBeUndefined();
    expect(cityPopulation(capital(state))).toBe(population);
    state = advance(state, 12);
    expect(captive(state).cityId).toBe('capital');
    expect(capital(state).cohorts.workers).toBe(5);
    expect(capital(state).cohorts.slaves).toBe(0);
    expect(cityPopulation(capital(state))).toBe(population + 1);
    updateImperial(state, 1);
    expect(capital(state).cohorts.workers).toBe(5);
    killUnit(state, captive(state), 'V_03');
    expect(capital(state).cohorts.workers).toBe(4);
  });

  it('does not enrol an emancipated Sage who is physically departing as a delegate', () => {
    let state = fixture();
    state.units = state.units.slice(0, 1);
    Object.assign(state.units[0], {
      ...state.home,
      caste: 'sage',
      intelligence: 9,
      strength: 5,
      emancipated: true,
      isKing: false,
    });
    state.kingId = null;
    state.government = 'tribe';
    capital(state).cohorts = { workers: 1, warriors: 0, sages: 1, slaves: 0 };
    state.factions[0].relation = 50;
    const destination = state.cities.find((city) => city.factionId !== 'player')!;
    state = issueCommand(state, ['S_04', 'V_04', 'O_09', 'S_09'], {
      type: 'city',
      id: destination.id,
      x: destination.x,
      y: destination.y,
    });
    expect(state.caravans).toHaveLength(1);
    expect(state.caravans[0].delegateUnitId).toBe(state.units[0].id);
    expect(state.units[0].cityId).toBeUndefined();
    state = advance(state, 1);
    expect(state.units[0].cityId).toBeUndefined();
    expect(state.gameOver).toBeNull();
    expect(cityPopulation(capital(state))).toBe(1);
    expect(capital(state).cohorts.workers).toBe(1);
    expect(state.units[0].action).toBe('delegating');
  });
});
