import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, emptyInventory, HOME } from './content';
import { createGame, tick } from './engine';
import { seasonalImperial } from './imperial';
import { seasonalCore } from './simulation';
import type { Building, BuildingKind, City, GameState } from './types';

function world(time: number) {
  const s = createGame(2000);
  s.started = true;
  s.time = time;
  s.entities = [];
  s.cities = [];
  s.factions = [];
  s.resources = emptyInventory();
  for (const u of s.units) Object.assign(u, { ...HOME, age: 6, hp: 100, hunger: 0, temp: 100 });
  return s;
}
function building(s: GameState, kind: BuildingKind, city?: City): Building {
  const b: Building = {
    id: `${kind}-${s.buildings.length}`,
    kind,
    ...HOME,
    cityId: city?.id,
    hp: BUILDING_SPECS[kind].maxHp,
    active: true,
    completed: true,
    workerIds: [],
  };
  s.buildings.push(b);
  if (city) city.buildingIds.push(b.id);
  return b;
}
function staffedFarm(s: GameState) {
  const farm = building(s, 'farm');
  building(s, 'storage');
  const workers = s.units.slice(0, 3);
  for (const u of workers) {
    u.jobBuildingId = farm.id;
    u.action = 'working';
  }
  farm.workerIds = workers.map((u) => u.id);
  // This isolated settlement fixture represents one completed ordinary shift.
  // The real-time accumulation and sleeping workers are exercised in workers.test.ts.
  farm.seasonWork = {
    [Math.floor(s.time / 90) - 1]: {
      efficiencySeconds: 60,
      workerSeconds: Object.fromEntries(workers.map((u) => [u.id, 60])),
      commandSeconds: Object.fromEntries(workers.map((u) => [u.id, { 'S_01|V_09|O_04': 60 }])),
    },
  };
  s.resources.seed = 10;
  return farm;
}
function city(s: GameState, id = 'province', factionId = 'player'): City {
  const c: City = {
    id,
    name: id,
    ...HOME,
    sectorX: 2,
    sectorY: 2,
    factionId,
    cohorts: { workers: 0, warriors: 0, sages: 0, slaves: 0 },
    resources: emptyInventory(),
    production: emptyInventory(),
    words: [],
    dogmas: [],
    revoltTension: 0,
    housing: 0,
    buildingIds: [],
    vocations: [],
    loyalty: 100,
    assimilation: { active: false, delegateCount: 0 },
  };
  s.cities.push(c);
  return c;
}

describe('settlement uses the season just ended', () => {
  it.each([
    [90, 50],
    [180, 25],
    [270, 50],
    [360, 50],
  ])('closes food spoilage at t=%s using the elapsed season', (at, expected) => {
    const s = world(at);
    s.resources.food = 100;
    seasonalCore(s);
    expect(s.resources.food).toBe(expected);
  });
  it('the public tick crossing spring into summer does not apply summer spoilage early', () => {
    const s = world(89.9);
    s.resources.food = 100;
    const next = tick(s, 0.1);
    expect(next.time).toBeCloseTo(90);
    expect(next.resources.food).toBe(50);
    expect(next.stats.seasonsSurvived).toBe(1);
  });
  it('a staffed field harvests after autumn, not when autumn starts', () => {
    const before = world(180);
    staffedFarm(before);
    seasonalCore(before);
    expect(before.resources.food).toBe(0);
    const after = world(270);
    staffedFarm(after);
    seasonalCore(after);
    expect(after.resources.food).toBe(50);
    const empty = world(270);
    building(empty, 'farm');
    building(empty, 'storage');
    seasonalCore(empty);
    expect(empty.resources.food).toBe(0);
  });
  it('attributes a village harvest to the elapsed autumn when the frame overshoots270seconds', () => {
    const s = world(270.03);
    const farm = staffedFarm(s);
    const worker = s.units.find((u) => u.id === farm.workerIds![0])!;
    worker.command = ['S_01', 'V_09', 'O_04'];
    seasonalCore(s);
    expect(s.eventTimes[`legal-work:2:${worker.id}:V_09:O_04`]).toBeCloseTo(50 / 3);
    expect(s.eventTimes[`legal-work:3:${worker.id}:V_09:O_04`]).toBeUndefined();
  });
  it.each([
    [90, 7.2],
    [180, 7],
    [270, 8],
    [360, 8],
  ])('a field pays its spring seed at t=%s before ordinary seed spoilage', (at, expected) => {
    const s = world(at);
    building(s, 'farm');
    s.resources.seed = 10;
    seasonalCore(s);
    expect(s.resources.seed).toBeCloseTo(expected);
  });
  it.each([
    [270, 10],
    [360, 7.5],
  ])('a livestock pen settles winter vegetable upkeep at t=%s', (at, expected) => {
    const s = world(at);
    building(s, 'pen');
    s.resources.food = 20;
    seasonalCore(s);
    expect(s.resources.food).toBe(expected);
  });
  it.each([
    [90, 50],
    [180, 25],
    [270, 50],
    [360, 50],
  ])('a province also settles food spoilage of the elapsed season at t=%s', (at, expected) => {
    const s = world(at),
      capital = city(s, 'capital');
    capital.capital = true;
    const c = city(s);
    c.resources.food = 100;
    seasonalImperial(s);
    expect(c.resources.food).toBe(expected);
  });
  it.each([
    [90, 80, 92],
    [180, 70, 88],
  ])(
    'only food receives storage, pottery and summer spoilage modifiers at t=%s',
    (at, food, seed) => {
      const s = world(at);
      city(s, 'capital').capital = true;
      const c = city(s);
      building(s, 'storage', c);
      Object.assign(c.resources, { food: 100, seed: 100, wood: 100, pelt: 100, pottery: 1 });
      seasonalImperial(s);
      expect(c.resources.food).toBeCloseTo(food);
      expect(c.resources.seed).toBeCloseTo(seed);
      expect(c.resources.wood).toBe(95);
      expect(c.resources.pelt).toBe(90);
    },
  );
  it('urban field production is assigned to the autumn that just ended', () => {
    const start = world(180),
      end = world(270);
    for (const s of [start, end]) {
      city(s, 'capital').capital = true;
      const c = city(s);
      c.cohorts.workers = 3;
      // The three citizens exist in the city, so nutrition is processed by their
      // individual simulation rather than debited a second time as a cohort.
      for (const u of s.units.slice(0, 3)) u.cityId = c.id;
      building(s, 'farm', c);
      building(s, 'storage', c);
      seasonalImperial(s);
    }
    expect(start.cities[1].production.food).toBe(0);
    expect(start.cities[1].resources.food).toBe(0);
    expect(end.cities[1].production.food).toBe(50);
    expect(end.cities[1].resources.food).toBe(50);
  });
  it('judges actual provincial harvest duties in the elapsed season even after a frame overshoot', () => {
    const s = world(270.03);
    s.urbanized = true;
    city(s, 'capital').capital = true;
    const province = city(s);
    province.cohorts.workers = 3;
    province.revoltTension = 50;
    for (const u of s.units.slice(0, 3)) u.cityId = province.id;
    building(s, 'farm', province);
    building(s, 'storage', province);
    const tokens = ['S_09', 'V_09', 'O_04', 'C_02', 'C_03', 'M_04'];
    s.laws.push({
      id: 'agrarian',
      name: 'Riforma agraria',
      tokens,
      subjectId: tokens[0],
      verbId: tokens[1],
      objectId: tokens[2],
      modifierId: tokens[3],
      sanctionId: tokens[5],
      prohibitive: false,
      age: 0,
    });
    seasonalImperial(s);
    // The agrarian reform also explicitly raises agricultural yield by35%.
    expect(province.production.food).toBe(67.5);
    expect(s.eventTimes[`legal-work:2:${province.id}:V_09:O_04`]).toBe(67.5);
    expect(province.revoltTension).toBe(30);
  });
  it.each([
    [0, 50],
    [20, 62],
  ])(
    'existing food%s spoils before a fresh autumn harvest in village and province',
    (stored, expected) => {
      const village = world(270);
      staffedFarm(village);
      village.resources.food = stored;
      seasonalCore(village);
      const province = world(270);
      city(province, 'capital').capital = true;
      const c = city(province);
      c.cohorts.workers = 3;
      c.resources.food = stored;
      for (const u of province.units.slice(0, 3)) u.cityId = c.id;
      building(province, 'farm', c);
      building(province, 'storage', c);
      seasonalImperial(province);
      expect(village.resources.food).toBe(expected);
      expect(c.resources.food).toBe(expected);
    },
  );
  it.each([
    [90, 9],
    [360, 10],
  ])('foreign fields pay the spring-only seed at the same settlement boundary t=%s', (at, seed) => {
    const s = world(at),
      c = city(s, 'foreign', 'outsiders');
    building(s, 'farm', c);
    c.resources.seed = 10;
    seasonalImperial(s);
    // Foreign provinces apply ordinary 20%% seed spoilage after maintenance.
    expect(c.resources.seed).toBeCloseTo(seed * 0.8);
  });
  it.each([
    [270, 80],
    [360, 70],
    [270.03, 80],
    [360.03, 70],
  ])('winter corvee settles its cohesion cost at t=%s', (at, cohesion) => {
    const s = world(at);
    s.units = [];
    s.cohesion = 80;
    const tokens = ['S_01', 'V_08', 'O_02', 'M_02', 'C_03', 'V_03'];
    s.laws.push({
      id: 'corvee',
      name: 'Corvée',
      tokens,
      subjectId: tokens[0],
      verbId: tokens[1],
      objectId: tokens[2],
      modifierId: tokens[3],
      sanctionId: tokens[5],
      prohibitive: false,
      age: 0,
    });
    seasonalImperial(s);
    expect(s.cohesion).toBe(cohesion);
  });
  it.each([
    [90, 17],
    [360, 20],
  ])('foreign seasonal foraging uses the season that ended at t=%s', (at, berries) => {
    const s = world(at),
      c = city(s, 'foreign', 'outsiders');
    c.cohorts.workers = 1;
    s.factions.push({
      id: 'outsiders',
      name: 'Altri',
      cityId: c.id,
      words: ['S_01', 'V_01', 'V_02', 'V_03'],
      dogmas: [],
      relation: 0,
      hostile: false,
    });
    s.entities.push({ id: 'berries', kind: 'berries', ...HOME, amount: 20, hp: 1, maxHp: 1 });
    seasonalImperial(s);
    expect(s.entities[0].amount).toBe(berries);
  });
});

describe('the new season starts its own weather and spring regeneration', () => {
  it('summer drought is rolled when summer starts, not when it ends', () => {
    const s = world(90);
    s.units = [];
    seasonalCore(s);
    expect(s.disasters.drought).toBe(true);
    expect(s.disasters.blizzard).toBe(false);
  });
  it('winter blizzard is rolled at the start of winter', () => {
    const s = world(270);
    s.units = [];
    seasonalCore(s);
    expect(s.disasters.blizzard).toBe(true);
  });
  it('spring regeneration still occurs when spring starts', () => {
    const s = world(90);
    s.units = [];
    s.entities.push({
      id: 'berries',
      kind: 'berries',
      ...HOME,
      amount: 1,
      maxAmount: 20,
      hp: 1,
      maxHp: 1,
    });
    seasonalCore(s);
    expect(s.entities[0].amount).toBe(1);
    s.time = 360;
    seasonalCore(s);
    expect(s.entities[0].amount).toBe(16);
    expect(s.disasters.drought).toBe(false);
  });
});
