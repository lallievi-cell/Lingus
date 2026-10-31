import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, emptyInventory, HOME } from './content';
import { createGame } from './engine';
import { getSeasonReadiness } from './seasonReadiness';
import { seasonalCore } from './simulation';
import type { Building, BuildingKind, GameState } from './types';

function fixture(time = 80) {
  const s = createGame(6842, 'guided');
  // Prepared 90-second scenes preserve the legacy Guided save rules.
  delete s.openingBalanceVersion;
  delete s.openingCouncilsCompleted;
  s.time = time;
  s.factions = [];
  s.cities = [];
  s.entities = [];
  s.buildings = [];
  s.units = s.units.slice(0, 1);
  s.resources = emptyInventory();
  Object.assign(s.units[0], { ...HOME, age: 6, hunger: 0, hp: 100, temp: 100 });
  return s;
}
function build(s: GameState, kind: BuildingKind, extra: Partial<Building> = {}) {
  const b: Building = {
    id: `${kind}-${s.buildings.length}`,
    kind,
    ...HOME,
    hp: BUILDING_SPECS[kind].maxHp,
    active: true,
    completed: true,
    ...extra,
  };
  s.buildings.push(b);
  return b;
}
function settle(s: GameState) {
  const next = structuredClone(s);
  next.time = (Math.floor(s.time / 90) + 1) * 90;
  seasonalCore(next);
  return next;
}

describe('next-season readiness reserves real costs without inventing production', () => {
  it('uses the season ending at the boundary for annual upkeep', () => {
    const spring = fixture(89);
    build(spring, 'farm');
    build(spring, 'pen', { livestock: 2 });
    expect(getSeasonReadiness(spring).upkeep.map((u) => u.building.kind)).toEqual(['farm']);
    const winter = fixture(359);
    build(winter, 'farm');
    build(winter, 'pen', { livestock: 2 });
    expect(getSeasonReadiness(winter).upkeep.map((u) => u.building.kind)).toEqual(['pen']);
  });
  it('never treats meat as feed or as safe food', () => {
    const s = fixture(359);
    build(s, 'pen', { livestock: 2 });
    s.resources.meat = 30;
    const report = getSeasonReadiness(s);
    expect(report.missingUpkeep[0].missing).toEqual({ food: 5 });
    expect(report.food[0].safeNutrition).toBe(0);
    expect(settle(s).buildings[0].active).toBe(false);
  });
  it('matches real wood and stone maintenance, reserving shared resources only once', () => {
    const s = fixture();
    build(s, 'hut');
    build(s, 'palisade');
    build(s, 'house');
    build(s, 'house');
    s.resources.wood = 2;
    s.resources.stone = 1;
    const report = getSeasonReadiness(s),
      after = settle(s);
    expect(report.upkeep.map((u) => u.payable)).toEqual(after.buildings.map((b) => b.active));
    expect(report.missingUpkeep.map((u) => u.building.kind)).toEqual(['palisade', 'house']);
  });
  it('shares nearby actual ground fuel and excludes inaccessible piles', () => {
    const s = fixture();
    build(s, 'campfire');
    build(s, 'campfire');
    s.entities = [
      { id: 'near', kind: 'ground', resource: 'wood', ...HOME, amount: 3, hp: 1, maxHp: 1 },
      { id: 'far', kind: 'ground', resource: 'wood', x: 300, y: 250, amount: 20, hp: 1, maxHp: 1 },
    ];
    expect(getSeasonReadiness(s).upkeep.map((u) => u.payable)).toEqual([true, false]);
    expect(settle(s).buildings.map((b) => b.active)).toEqual([true, false]);
    expect(s.entities[0].amount).toBe(3);
  });
  it('matches summer spoilage with storage and pottery, after vegetable upkeep', () => {
    const s = fixture(170);
    build(s, 'storage');
    build(s, 'temple');
    s.resources.food = 100;
    s.resources.cooked = 40;
    s.resources.pottery = 1;
    const before = structuredClone(s),
      report = getSeasonReadiness(s),
      after = settle(s);
    expect(report.food[0].safeNutrition).toBeCloseTo(
      after.resources.food * 25 + after.resources.cooked * 60,
    );
    expect(s).toEqual(before);
  });
  it('ignores unfinished and foreign structures when reserving player upkeep', () => {
    const s = fixture();
    build(s, 'house', { completed: false });
    build(s, 'house', { cityId: 'foreign' });
    build(s, 'house', { hp: 0 });
    expect(getSeasonReadiness(s).upkeep).toEqual([]);
  });
  it('uses each province’s material stocks while drawing coin upkeep from the shared treasury', () => {
    const s = fixture();
    const provincial = {
      ...createGame(6842).cities[0],
      id: 'province',
      name: 'Valle',
      factionId: 'player',
      capital: false,
      resources: emptyInventory(),
      cohorts: { workers: 4, warriors: 0, sages: 0, slaves: 0 },
    };
    provincial.resources.coin = 100;
    s.cities.push(provincial);
    s.resources.stone = 1;
    s.resources.coin = 15;
    build(s, 'house', { cityId: provincial.id });
    build(s, 'house');
    build(s, 'archive', { cityId: provincial.id });
    build(s, 'archive', { cityId: provincial.id });
    const report = getSeasonReadiness(s),
      after = settle(s);
    expect(report.upkeep.map((u) => u.payable)).toEqual([false, true, true, false]);
    expect(report.upkeep.map((u) => u.payable)).toEqual(after.buildings.map((b) => b.active));
    expect(after.resources.coin).toBe(5);
    expect(after.cities[0].resources.coin).toBe(100);
    expect(report.food.find((entry) => entry.id === provincial.id)?.population).toBe(4);
  });
  it('keeps Classic winter heat literal and does not credit an unpaid house', () => {
    const s = fixture(260);
    s.playMode = 'classic';
    build(s, 'campfire');
    s.resources.wood = 2;
    expect(getSeasonReadiness(s).coldExposed).toBe(1);
    build(s, 'house');
    expect(getSeasonReadiness(s).coldExposed).toBe(1);
    s.resources.stone = 1;
    expect(getSeasonReadiness(s).coldExposed).toBe(0);
  });
  it('credits the actual paid Guided warm core, but not its cold outer band', () => {
    const s = fixture(260);
    const fire = build(s, 'campfire');
    s.resources.wood = 2;
    expect(getSeasonReadiness(s).coldExposed).toBe(0);
    fire.x = HOME.x + 14;
    expect(getSeasonReadiness(s).coldExposed).toBe(1);
    fire.x = HOME.x;
    s.resources.wood = 0;
    expect(getSeasonReadiness(s).coldExposed).toBe(1);
  });
  it('does not credit future pen output or autumn harvest to the pantry', () => {
    const s = fixture(260);
    build(s, 'pen', { livestock: 10 });
    const farm = build(s, 'farm');
    farm.seasonWork = { 2: { efficiencySeconds: 60, workerSeconds: {} } };
    expect(getSeasonReadiness(s).food[0].safeNutrition).toBe(0);
    expect(settle(s).resources.food).toBeGreaterThan(0);
  });
});
