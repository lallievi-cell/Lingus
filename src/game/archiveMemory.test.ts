import { describe, expect, it } from 'vitest';
import { emptyInventory, HOME, WORD_ORDER } from './content';
import { createGame, createReadyBuilding, dismissCampfire, issueCommand, tick } from './engine';
import type { City, GameState } from './types';

/** Prepared scribes isolate earned written support. All work, sleep, upkeep,
 * councils and memory settlement after preparation use ordinary engine ticks.
 */
function library(mode: 'guided' | 'classic' = 'classic', time = 0, coins = 100) {
  const state = createGame(6842, mode);
  Object.assign(state, { started: true, time, tier: 3, entities: [], cities: [], factions: [] });
  for (const unit of state.units)
    Object.assign(unit, {
      ...HOME,
      age: 6,
      hp: 100,
      hunger: 0,
      temp: 100,
      intelligence: 9,
      strength: 5,
      caste: 'sage',
      factionId: 'player',
      cityId: undefined,
      action: 'idle',
      progress: 0,
      command: undefined,
      knows: [...WORD_ORDER],
    });
  state.words = Object.fromEntries(
    WORD_ORDER.map((id) => [
      id,
      { retention: 100, custodians: state.units.map((unit) => unit.id), uses: 0 },
    ]),
  );
  for (const kind of ['campfire', 'house', 'storage', 'depot', 'archive'] as const)
    createReadyBuilding(state, kind);
  Object.assign(state.resources, {
    ...emptyInventory(),
    cooked: 100,
    wood: 100,
    stone: 100,
    coin: coins,
  });
  return state;
}
const archive = (state: GameState) =>
  state.buildings.find((building) => building.kind === 'archive')!;
function assign(state: GameState) {
  const building = archive(state);
  return issueCommand(state, ['S_04', 'V_05', 'O_09'], {
    type: 'building',
    id: building.id,
    x: building.x,
    y: building.y,
  });
}
function council(state: GameState, until = 90) {
  let current = state;
  while (current.time < until && !current.gameOver) {
    current = tick(current, Math.min(1, until - current.time));
    if (current.campfirePending && current.time < until) current = dismissCampfire(current);
  }
  expect(current.time).toBe(until);
  expect(current.campfirePending).toBe(true);
  expect(current.gameOver).toBeNull();
  return current;
}

describe('written memory settles actual completed archive shifts', () => {
  it.each(['classic', 'guided'] as const)(
    'preserves a full %s shift after the scribes return to sleep',
    (mode) => {
      let state = assign(library(mode));
      while (state.time < 60) state = tick(state, Math.min(1, 60 - state.time));
      expect(
        state.units.filter((unit) => unit.suspendedJob?.buildingId === archive(state).id),
      ).toHaveLength(4);
      // A real return order ends the job reservation, not the copies already made.
      state = issueCommand(state, ['S_04', 'V_01', 'O_01']);
      state = council(state);
      expect(state.stats.commands).toBe(2);
      expect(archive(state).seasonWork?.['0'].efficiencySeconds).toBeCloseTo(60);
      expect(archive(state).workerIds).toEqual([]);
      const closed = dismissCampfire(state);
      expect(closed.words.O_05.support).toBe(1);
      expect(closed.words.O_05.retention).toBe(100);
      expect(closed.resources.coin).toBe(90);
    },
  );

  it.each(['classic', 'guided'] as const)('settles only the real half %s shift', (mode) => {
    const state = council(assign(library(mode, 30)));
    expect(archive(state).seasonWork?.['0'].efficiencySeconds).toBeCloseTo(30);
    const closed = dismissCampfire(state);
    expect(closed.words.O_05.support).toBeCloseTo(0.5);
    expect(closed.words.O_05.retention).toBeCloseTo(91);
  });

  it.each(['classic', 'guided'] as const)(
    'grants no instant %s protection from assigning scribes during the council',
    (mode) => {
      let state = council(library(mode));
      expect(archive(state).seasonWork).toBeUndefined();
      state = assign(state);
      expect(archive(state).workerIds).toHaveLength(4);
      expect(state.stats.commands).toBe(1);
      const closed = dismissCampfire(state);
      expect(closed.words.O_05.support).toBe(0);
      expect(closed.words.O_05.retention).toBe(82);
    },
  );

  it.each(['classic', 'guided'] as const)(
    'keeps copies from a paid-in-work %s shift when upkeep fails, then earns nothing next season',
    (mode) => {
      let state = council(assign(library(mode, 0, 0)));
      expect(archive(state).active).toBe(false);
      expect(archive(state).hp).toBe(280);
      expect(archive(state).seasonWork?.['0'].efficiencySeconds).toBeCloseTo(60);
      state = dismissCampfire(state);
      expect(state.words.O_05.support).toBe(1);
      expect(state.words.O_05.retention).toBe(100);
      state = council(state, 180);
      expect(archive(state).active).toBe(false);
      expect(archive(state).seasonWork?.['1']).toBeUndefined();
      state = dismissCampfire(state);
      expect(state.words.O_05.support).toBe(0);
      expect(state.words.O_05.retention).toBe(82);
      expect(state.resources.coin).toBe(0);
    },
  );

  it('does not borrow a genuinely staffed foreign archive for player memory', () => {
    let state = library();
    const building = archive(state);
    building.cityId = 'foreign-library';
    const city: City = {
      ...createGame().cities[0],
      id: 'foreign-library',
      factionId: 'foreign',
      x: 350,
      y: 250,
      sectorX: 3,
      sectorY: 2,
      cohorts: { workers: 0, warriors: 0, sages: 4, slaves: 0 },
      resources: { ...emptyInventory(), food: 40, coin: 100 },
      buildingIds: [building.id],
      words: [...WORD_ORDER],
      capital: false,
    };
    building.x = city.x;
    building.y = city.y;
    state.cities = [city];
    state.factions = [
      {
        id: 'foreign',
        name: 'Gli scribi lontani',
        cityId: city.id,
        words: [...WORD_ORDER],
        dogmas: [],
        relation: 50,
        hostile: false,
      },
    ];
    state = assign(state);
    expect(state.stats.commands).toBe(0);
    state = council(state);
    expect(archive(state).lastEfficiency).toBe(1);
    state = dismissCampfire(state);
    expect(state.words.O_05.support).toBe(0);
    expect(state.words.O_05.retention).toBe(82);
  });

  it('retains the existing active urban efficiency calculation', () => {
    let state = library();
    state.urbanized = true;
    const city: City = {
      ...createGame().cities[0],
      id: 'capital',
      factionId: 'player',
      ...HOME,
      sectorX: 2,
      sectorY: 2,
      cohorts: { workers: 0, warriors: 0, sages: 7, slaves: 0 },
      resources: state.resources,
      buildingIds: state.buildings.map((building) => building.id),
      words: [...WORD_ORDER],
      housing: 7,
      capital: true,
    };
    state.cities = [city];
    for (const unit of state.units) unit.cityId = city.id;
    for (const building of state.buildings) building.cityId = city.id;
    state = council(state);
    expect(archive(state).seasonWork).toBeUndefined();
    expect(archive(state).lastEfficiency).toBe(1);
    state = dismissCampfire(state);
    expect(state.words.O_05.support).toBe(1);
    expect(state.words.O_05.retention).toBe(100);
  });

  it('keeps the fixed-word Stele support without an archive shift', () => {
    let state = library();
    state.buildings = state.buildings.filter((building) => building.kind !== 'archive');
    const stele = createReadyBuilding(state, 'stele');
    stele.fixedWordId = 'O_05';
    state = dismissCampfire(council(state));
    expect(state.words.O_05.support).toBe(0.95);
    expect(state.words.O_05.retention).toBeCloseTo(99.1);
    expect(state.words.M_05.support).toBe(0);
    expect(state.words.M_05.retention).toBe(70);
  });
});
