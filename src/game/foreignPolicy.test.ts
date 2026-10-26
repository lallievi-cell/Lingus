import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, emptyInventory } from './content';
import { createGame, parseGame, serializeGame } from './engine';
import { registerTradition, updateImperial } from './imperial';
import { updateUnits } from './simulation';
import { validSave } from './saveValidation';
import {
  areFactionsHostile,
  availableForeignWarriors,
  completeForeignExpansion,
  dispatchForeignPolicy,
  FOREIGN_POLICY_ASSUMPTIONS as A,
  resolveForeignUltimatum,
  takeForeignForgeWork,
  updateForeignPolicy,
} from './foreignPolicy';
import type { GameState } from './types';

function fixture() {
  const state = createGame(6842);
  Object.assign(state, { tier: 3, time: 720, started: true, paused: false });
  const faction = state.factions[0],
    city = state.cities[0];
  faction.relation = -70;
  faction.hostile = true;
  Object.assign(city, {
    x: 200,
    y: 250,
    sectorX: 1,
    sectorY: 2,
    resources: { ...emptyInventory(), food: 100, wood: 60, stone: 60 },
  });
  state.factions = [faction];
  state.cities = [city];
  state.entities = [];
  state.buildings = [];
  state.resources.food = 20;
  return { state, faction, city };
}
function advance(state: GameState, seconds: number, units = false) {
  for (let step = 0; step < seconds * 4; step++) {
    state.time += 0.25;
    if (units) updateUnits(state, 0.25);
    updateForeignPolicy(state, 0.25);
  }
}
const population = (state: GameState) =>
  state.cities.reduce(
    (sum, city) => sum + Object.values(city.cohorts).reduce((n, c) => n + c, 0),
    0,
  ) +
  state.units.filter(
    (u) =>
      u.hp > 0 &&
      state.foreignPolicy?.raids.some(
        (raid) => raid.phase !== 'ended' && raid.memberIds.includes(u.id),
      ) &&
      u.factionId !== 'player',
  ).length +
  state.battalions.reduce((sum, b) => sum + b.hp / 100, 0) +
  state.caravans
    .filter((c) => !c.arrived && c.hp > 0 && c.factionId !== 'player')
    .reduce((sum, c) => sum + c.population, 0);
const food = (state: GameState) =>
  state.resources.food +
  state.cities.reduce((sum, c) => sum + c.resources.food, 0) +
  (state.foreignPolicy?.raids.reduce((sum, r) => sum + r.resources.food, 0) ?? 0) +
  state.entities
    .filter((e) => e.kind === 'ground' && e.resource === 'food')
    .reduce((sum, e) => sum + e.amount, 0);

describe('proactive foreign pressure', () => {
  it('leaves the first eras and grace period unchanged and never attacks peaceful factions', () => {
    const { state, faction } = fixture();
    state.tier = 2;
    const before = structuredClone(state);
    dispatchForeignPolicy(state);
    expect(state).toEqual(before);
    state.tier = 3;
    state.time = 719;
    dispatchForeignPolicy(state);
    expect(state.foreignPolicy).toBeUndefined();
    state.time = 720;
    faction.relation = 20;
    faction.hostile = false;
    dispatchForeignPolicy(state);
    expect(state.foreignPolicy?.raids ?? []).toEqual([]);
    expect(state.foreignPolicy?.ultimata ?? []).toEqual([]);
    expect(areFactionsHostile(state, 'player', faction.id)).toBe(false);
  });

  it('mobilizes real spare workers, reserves existing visitors, and delivers stolen goods only after return', () => {
    const { state, faction, city } = fixture();
    state.units.push({
      ...state.units[0],
      id: 'existing-envoy',
      factionId: faction.id,
      cityId: city.id,
      caste: 'warrior',
    });
    expect(availableForeignWarriors(state, city)).toBe(1);
    const initialPopulation = population(state),
      seed = state.seed;
    dispatchForeignPolicy(state);
    const raid = state.foreignPolicy!.raids[0];
    expect(raid.memberIds).toHaveLength(3);
    expect(city.cohorts.workers).toBe(6);
    expect(city.cohorts.warriors).toBe(1);
    expect(population(state)).toBe(initialPopulation);
    expect(state.seed).toBe(seed);
    const afterProvisions = food(state),
      foreignFood = city.resources.food;
    for (let i = 0; i < 200 && raid.phase === 'approaching'; i++) advance(state, 0.25);
    expect(raid.phase).toBe('returning');
    expect(raid.resources.food).toBe(6);
    expect(state.resources.food).toBe(14);
    expect(city.resources.food).toBe(foreignFood);
    expect(food(state)).toBe(afterProvisions);
    advance(state, 30);
    expect(raid.phase).toBe('ended');
    expect(city.resources.food).toBe(foreignFood + 6);
    expect(food(state)).toBe(afterProvisions);
    expect(population(state)).toBe(initialPopulation);
    const recovered = city.resources.food;
    advance(state, 5);
    expect(city.resources.food).toBe(recovered);
    expect(validSave(state)).toBe(true);
  });

  it('cannot steal through a completed active palisade or launch repeatedly during its cooldown', () => {
    const { state } = fixture();
    state.buildings.push({
      id: 'fence',
      kind: 'palisade',
      ...state.home,
      hp: 400,
      active: true,
      completed: true,
    });
    dispatchForeignPolicy(state);
    const raid = state.foreignPolicy!.raids[0];
    advance(state, 40);
    expect(raid.phase).toBe('ended');
    expect(state.resources.food).toBe(20);
    expect(raid.resources.food).toBe(0);
    dispatchForeignPolicy(state);
    expect(state.foreignPolicy!.raids).toHaveLength(1);
  });

  it('keeps existing garrison wounds through training, departure, and the real return of wounded survivors', () => {
    const { state, city, faction } = fixture();
    city.garrisonHp = 80;
    dispatchForeignPolicy(state);
    const raid = state.foreignPolicy!.raids[0];
    const members = state.units.filter((unit) => raid.memberIds.includes(unit.id));
    // Two wounded warriors plus one newly trained worker retain their actual 180 HP.
    expect(city.cohorts.warriors).toBe(0);
    expect(city.garrisonHp).toBe(0);
    expect(members.reduce((sum, unit) => sum + unit.hp, 0)).toBe(180);
    members[0].hp -= 10;
    faction.peaceUntil = state.time + 100;
    advance(state, 1);
    expect(raid.phase).toBe('ended');
    expect(city.cohorts.warriors).toBe(3);
    expect(city.garrisonHp).toBe(170);
    advance(state, 1);
    expect(city.garrisonHp).toBe(170);
  });

  it('uses the real night-watch tradition and actual paid equipment against raiders', () => {
    let { state } = fixture();
    state.time = 780;
    for (const id of ['C_01', 'S_03', 'V_05', 'O_01'])
      state.words[id] = { retention: 100, custodians: state.units.map((u) => u.id), uses: 0 };
    state.resources.metalArms = 5;
    state = registerTradition(state, ['C_01', 'S_03', 'V_05', 'O_01'], {
      type: 'point',
      ...state.home,
    });
    expect(state.traditions).toHaveLength(1);
    dispatchForeignPolicy(state);
    advance(state, 25, true);
    const raid = state.foreignPolicy!.raids[0];
    expect(raid.phase).toMatch(/returning|ended/);
    expect(raid.resources.food).toBe(0);
    expect(state.resources.metalArms).toBeLessThan(5);
    expect(state.units.some((u) => raid.memberIds.includes(u.id) && u.hp < 100)).toBe(true);
    expect(state.buildings.some((b) => b.kind === 'campfire')).toBe(false);
  });

  it('drops carried loot physically when the party is killed rather than crediting its distant city', () => {
    const { state, city } = fixture();
    dispatchForeignPolicy(state);
    const raid = state.foreignPolicy!.raids[0];
    for (let i = 0; i < 200 && raid.phase === 'approaching'; i++) advance(state, 0.25);
    const beforeFood = food(state),
      foreignFood = city.resources.food;
    const bodies = state.units.filter((u) => raid.memberIds.includes(u.id));
    for (const u of bodies) {
      u.hp = 0;
      u.action = 'dead';
    }
    advance(state, 0.25);
    expect(raid.phase).toBe('ended');
    expect(city.resources.food).toBe(foreignFood);
    const loot = state.entities.filter((e) => e.kind === 'ground' && e.resource === 'food');
    expect(loot.reduce((n, e) => n + e.amount, 0)).toBe(6);
    expect(loot[0].x).toBe(bodies[0].x);
    expect(food(state)).toBe(beforeFood);
    const count = loot.length;
    advance(state, 1);
    expect(state.entities.filter((e) => e.kind === 'ground').length).toBe(count);
  });

  it('respects a new peace agreement and a lost home without duplicating surviving warriors', () => {
    const { state, faction, city } = fixture();
    dispatchForeignPolicy(state);
    const raid = state.foreignPolicy!.raids[0];
    advance(state, 4);
    faction.peaceUntil = state.time + 90;
    advance(state, 10);
    expect(raid.phase).toBe('ended');
    expect(state.resources.food).toBe(20);
    expect(city.cohorts.warriors).toBe(3);
    const second = fixture();
    dispatchForeignPolicy(second.state);
    second.city.factionId = 'player';
    advance(second.state, 1);
    expect(second.state.foreignPolicy!.raids[0].phase).toBe('ended');
    expect(second.city.cohorts.warriors).toBe(0);
    expect(
      second.state.units.filter(
        (u) => second.state.foreignPolicy!.raids[0].memberIds.includes(u.id) && u.hp > 0,
      ),
    ).toHaveLength(3);
  });

  it('offers explicit non-doctrinal answers, ships a real gift, and cannot charge twice', () => {
    const { state, faction, city } = fixture();
    faction.relation = -40;
    faction.hostile = false;
    dispatchForeignPolicy(state);
    const ultimatum = state.foreignPolicy!.ultimata[0];
    const before = structuredClone(state.dogmas),
      cityFood = city.resources.food;
    const paid = resolveForeignUltimatum(state, ultimatum.id, 'pay');
    expect(state.resources.food).toBe(20);
    expect(paid.resources.food).toBe(12);
    expect(paid.cities[0].resources.food).toBe(cityFood);
    expect(paid.caravans[0]).toMatchObject({ kind: 'trade', gift: true, resources: { food: 8 } });
    expect(paid.foreignPolicy!.ultimata[0].status).toBe('dispatched');
    expect(paid.dogmas).toEqual(before);
    expect(areFactionsHostile(paid, 'player', faction.id)).toBe(false);
    expect(resolveForeignUltimatum(paid, ultimatum.id, 'pay')).toBe(paid);
    for (let i = 0; i < 60; i++) {
      paid.time += 0.25;
      updateImperial(paid, 0.25);
      updateForeignPolicy(paid, 0.25);
    }
    expect(paid.foreignPolicy!.ultimata[0].status).toBe('paid');
    expect(paid.cities[0].resources.food).toBe(cityFood + 8);
  });

  it('expires a request only once and cancels abandoned-origin requests', () => {
    const { state, faction } = fixture();
    faction.relation = -40;
    faction.hostile = false;
    dispatchForeignPolicy(state);
    const ultimatum = state.foreignPolicy!.ultimata[0];
    advance(state, A.ultimatumResponseSeconds);
    expect(ultimatum.status).toBe('expired');
    expect(faction.relation).toBe(-60);
    advance(state, 10);
    expect(faction.relation).toBe(-60);
    const other = fixture();
    other.faction.relation = -40;
    dispatchForeignPolicy(other.state);
    other.city.factionId = 'player';
    advance(other.state, 0.25);
    expect(other.state.foreignPolicy!.ultimata[0].status).toBe('cancelled');
    expect(
      resolveForeignUltimatum(other.state, other.state.foreignPolicy!.ultimata[0].id, 'pay'),
    ).toBe(other.state);
  });

  it('does not end an existing war when a demand is refused and reports lost gifts only once', () => {
    const hostile = fixture();
    hostile.faction.relation = -10;
    hostile.faction.hostile = true;
    dispatchForeignPolicy(hostile.state);
    const rejected = resolveForeignUltimatum(
      hostile.state,
      hostile.state.foreignPolicy!.ultimata[0].id,
      'refuse',
    );
    expect(rejected.factions[0].relation).toBe(-30);
    expect(rejected.factions[0].hostile).toBe(true);
    const { state, faction } = fixture();
    faction.relation = -40;
    faction.hostile = false;
    dispatchForeignPolicy(state);
    const sent = resolveForeignUltimatum(state, state.foreignPolicy!.ultimata[0].id, 'pay');
    sent.caravans[0].hp = 0;
    advance(sent, 0.25);
    expect(sent.foreignPolicy!.ultimata[0].status).toBe('expired');
    expect(sent.resources.food).toBe(12);
    const messages = sent.logs.filter((entry) => entry.text.includes('il convoglio è perduto'));
    expect(messages).toHaveLength(1);
    advance(sent, 1);
    expect(sent.logs.filter((entry) => entry.text.includes('il convoglio è perduto'))).toHaveLength(
      1,
    );
  });

  it('uses paid travelling colonists and never founds an enemy colony for the player', () => {
    const { state, city, faction } = fixture();
    Object.assign(state, { tier: 4, urbanized: true });
    faction.relation = 20;
    faction.hostile = false;
    faction.words.push('V_08', 'O_10');
    Object.assign(city, {
      x: 50,
      y: 50,
      sectorX: 0,
      sectorY: 0,
      cohorts: { workers: 38, warriors: 2, sages: 2, slaves: 0 },
      resources: { ...emptyInventory(), food: 50, wood: 50, stone: 50 },
    });
    dispatchForeignPolicy(state);
    const caravan = state.caravans[0];
    expect(caravan).toMatchObject({
      kind: 'colonists',
      factionId: faction.id,
      population: 30,
      resources: { food: 50, wood: 50, stone: 50 },
    });
    expect(city.cohorts.workers).toBe(8);
    expect(state.cities).toHaveLength(1);
    expect(city.resources.food).toBe(0);
    for (let i = 0; i < 110; i++) {
      state.time += 0.25;
      updateImperial(state, 0.25);
    }
    expect(caravan.arrived).toBe(true);
    expect(state.cities).toHaveLength(2);
    expect(state.cities[1].factionId).toBe(faction.id);
    expect(state.cities[1].cohorts.workers).toBe(30);
    expect(state.cities[1].resources).toMatchObject({ food: 50, wood: 50, stone: 50 });
    expect(caravan.resources.food).toBe(0);
    expect(caravan.population).toBe(0);
    expect(completeForeignExpansion(state, caravan)).toBe(true);
    expect(state.cities).toHaveLength(2);
  });

  it('models foreign-against-foreign war independently and forges actual arms before paid mobilization', () => {
    const { state, city, faction } = fixture();
    Object.assign(state, { tier: 4, urbanized: true });
    faction.relation = 20;
    faction.hostile = false;
    faction.words.push('V_12');
    city.cohorts.workers = 30;
    city.resources.food = 100;
    city.resources.ingot = 20;
    const enemy = structuredClone(city),
      rival = structuredClone(faction);
    enemy.id = 'rival-city';
    enemy.factionId = 'rival';
    enemy.x = 300;
    enemy.sectorX = 3;
    rival.id = 'rival';
    rival.cityId = enemy.id;
    rival.name = 'Rivale';
    const dogma = {
      id: 'left-dogma',
      targetId: 'O_04',
      vectorId: 'M_01',
      name: 'Tabù',
      description: '',
      age: 1,
      weight: 1,
    };
    faction.dogmas = [dogma];
    rival.dogmas = [{ ...dogma, id: 'right-dogma', vectorId: 'C_02' }];
    city.dogmas = faction.dogmas;
    enemy.dogmas = rival.dogmas;
    state.factions.push(rival);
    state.cities.push(enemy);
    state.buildings.push({
      id: 'forge',
      kind: 'foundry',
      cityId: city.id,
      x: city.x,
      y: city.y,
      hp: BUILDING_SPECS.foundry.maxHp,
      active: true,
      completed: true,
      lastEfficiency: 1,
    });
    dispatchForeignPolicy(state);
    expect(areFactionsHostile(state, faction.id, rival.id)).toBe(true);
    expect(areFactionsHostile(state, 'player', faction.id)).toBe(false);
    expect(state.battalions).toHaveLength(0);
    advance(state, 100);
    expect(city.resources.ingot).toBe(0);
    expect(city.resources.metalArms).toBe(20);
    expect(takeForeignForgeWork(state, 'forge')).toBe(100);
    expect(takeForeignForgeWork(state, 'forge')).toBe(0);
    const people = population(state);
    dispatchForeignPolicy(state);
    expect(state.battalions).toHaveLength(1);
    expect(state.battalions[0]).toMatchObject({
      factionId: faction.id,
      targetId: enemy.id,
      hp: 2000,
      metalWeapons: 20,
    });
    expect(city.resources.metalArms).toBe(0);
    expect(population(state)).toBe(people);
  });

  it('preserves pooled garrison injuries when an actual professional army departs', () => {
    const { state, city, faction } = fixture();
    Object.assign(state, { tier: 4, urbanized: true });
    faction.relation = 20;
    faction.hostile = false;
    city.cohorts = { workers: 4, warriors: 20, sages: 2, slaves: 0 };
    city.garrisonHp = 1250;
    city.resources.metalArms = 20;
    const rival = structuredClone(faction),
      enemy = structuredClone(city);
    rival.id = 'rival';
    rival.cityId = 'rival-city';
    enemy.id = rival.cityId;
    enemy.factionId = rival.id;
    enemy.resources.metalArms = 0;
    state.factions.push(rival);
    state.cities.push(enemy);
    state.foreignPolicy = {
      raids: [],
      ultimata: [],
      relations: [{ leftId: faction.id, rightId: rival.id, relation: -60, atWar: true }],
    };
    dispatchForeignPolicy(state);
    expect(state.battalions).toHaveLength(1);
    expect(state.battalions[0]).toMatchObject({ hp: 1250, maxHp: 2000, metalWeapons: 20 });
    expect(city.cohorts.warriors).toBe(0);
    expect(city.garrisonHp).toBe(0);
  });

  it('does not reuse a visiting worker as part of a paid colonial expedition', () => {
    const { state, city, faction } = fixture();
    Object.assign(state, { tier: 4, urbanized: true });
    faction.relation = 20;
    faction.hostile = false;
    faction.words.push('V_08', 'O_10');
    city.cohorts.workers = 38;
    state.units.push({
      ...structuredClone(state.units[0]),
      id: 'visiting-worker',
      cityId: city.id,
      factionId: faction.id,
      caste: 'citizen',
    });
    dispatchForeignPolicy(state);
    expect(state.caravans.filter((caravan) => caravan.kind === 'colonists')).toHaveLength(0);
    expect(city.cohorts.workers).toBe(38);
  });

  it('keeps a surviving colony politically active after the original capital is conquered', () => {
    const { state, city, faction } = fixture();
    const colony = structuredClone(city);
    colony.id = 'surviving-colony';
    colony.x = 200;
    colony.y = 220;
    city.factionId = 'player';
    faction.subjugated = true;
    state.cities.push(colony);
    dispatchForeignPolicy(state);
    expect(faction.cityId).toBe(colony.id);
    expect(faction.subjugated).toBe(false);
    expect(state.foreignPolicy!.raids[0].originCityId).toBe(colony.id);
    expect(state.foreignPolicy!.ultimata[0].cityId).toBe(colony.id);
    expect(city.cohorts.warriors).toBe(2);
  });

  it('keeps stranded settlers and their cargo in the world, and drops cargo once after real destruction', () => {
    const { state, city, faction } = fixture();
    Object.assign(state, { tier: 4, urbanized: true });
    faction.relation = 20;
    faction.hostile = false;
    faction.words.push('V_08', 'O_10');
    Object.assign(city, {
      x: 50,
      y: 50,
      sectorX: 0,
      sectorY: 0,
      cohorts: { workers: 38, warriors: 2, sages: 2, slaves: 0 },
      resources: { ...emptyInventory(), food: 50, wood: 50, stone: 50 },
    });
    dispatchForeignPolicy(state);
    const caravan = state.caravans[0];
    const occupier = {
      ...structuredClone(city),
      id: 'occupied-site',
      factionId: 'rival',
      x: caravan.target.x,
      y: caravan.target.y,
      sectorX: Math.floor(caravan.target.x / 100),
      sectorY: Math.floor(caravan.target.y / 100),
    };
    city.factionId = 'player';
    state.cities.push(occupier);
    for (let i = 0; i < 110; i++) {
      state.time += 0.25;
      updateImperial(state, 0.25);
      updateForeignPolicy(state, 0.25);
    }
    expect(caravan.arrived).not.toBe(true);
    expect(caravan.customsRefused).toBe(true);
    expect(caravan.population).toBe(30);
    expect(caravan.resources).toMatchObject({ food: 50, wood: 50, stone: 50 });
    caravan.hp = 0;
    advance(state, 0.25);
    expect(caravan.arrived).toBe(true);
    expect(caravan.population).toBe(0);
    expect(
      state.entities.filter((e) => e.kind === 'ground').reduce((sum, e) => sum + e.amount, 0),
    ).toBe(150);
    const count = state.entities.length;
    advance(state, 0.25);
    expect(state.entities).toHaveLength(count);
  });

  it('pays for real housing when crowded instead of permanently capping foreign growth at twenty', () => {
    const { state, city, faction } = fixture();
    faction.relation = 20;
    faction.hostile = false;
    faction.words.push('V_08', 'O_02', 'O_01');
    city.cohorts.workers = 16;
    const oldHousing = city.housing,
      oldWood = city.resources.wood,
      oldStone = city.resources.stone;
    dispatchForeignPolicy(state);
    const house = state.buildings.find((b) => b.kind === 'house');
    expect(house).toMatchObject({
      cityId: city.id,
      completed: true,
      hp: BUILDING_SPECS.house.maxHp,
    });
    expect(city.housing).toBe(oldHousing + 12);
    expect(city.resources.wood).toBe(oldWood - 10);
    expect(city.resources.stone).toBe(oldStone - 20);
    dispatchForeignPolicy(state);
    expect(state.buildings.filter((b) => b.kind === 'house')).toHaveLength(1);
  });

  it('preserves old saves and validates bounded new pressure data before importing', () => {
    const old = createGame(6842);
    expect(parseGame(serializeGame(old))?.foreignPolicy).toBeUndefined();
    const { state } = fixture();
    dispatchForeignPolicy(state);
    expect(validSave(state)).toBe(true);
    expect(parseGame(serializeGame(state))?.foreignPolicy).toEqual(state.foreignPolicy);
    const broken = structuredClone(state);
    broken.foreignPolicy!.raids[0].resources.food = Infinity;
    expect(validSave(broken)).toBe(false);
    broken.foreignPolicy = structuredClone(state.foreignPolicy);
    broken.foreignPolicy!.ultimata[0].amount = -1;
    expect(validSave(broken)).toBe(false);
    broken.foreignPolicy = structuredClone(state.foreignPolicy);
    broken.foreignPolicy!.raids = Array.from({ length: 13 }, (_, index) => ({
      ...structuredClone(state.foreignPolicy!.raids[0]),
      id: `raid-${index}`,
    }));
    expect(validSave(broken)).toBe(false);
  });

  it('keeps live delivery warnings when trimming history and bounds returned raid representations', () => {
    const first = fixture();
    first.faction.relation = -40;
    first.faction.hostile = false;
    dispatchForeignPolicy(first.state);
    const sent = resolveForeignUltimatum(
      first.state,
      first.state.foreignPolicy!.ultimata[0].id,
      'pay',
    );
    const delivery = sent.foreignPolicy!.ultimata[0];
    sent.foreignPolicy!.ultimata.push(
      ...Array.from({ length: 15 }, (_, index) => ({
        ...structuredClone(delivery),
        id: `old-demand-${index}`,
        status: 'expired' as const,
      })),
    );
    const rival = structuredClone(sent.factions[0]),
      rivalCity = structuredClone(sent.cities[0]);
    rival.id = 'rival';
    rival.cityId = 'rival-city';
    rival.peaceUntil = 0;
    rivalCity.id = rival.cityId;
    rivalCity.factionId = rival.id;
    sent.factions.push(rival);
    sent.cities.push(rivalCity);
    sent.time += 90;
    dispatchForeignPolicy(sent);
    expect(sent.foreignPolicy!.ultimata).toHaveLength(16);
    expect(sent.foreignPolicy!.ultimata[0]).toBe(delivery);
    expect(sent.foreignPolicy!.ultimata.some((entry) => entry.factionId === rival.id)).toBe(true);

    const repeated = fixture();
    const initialPopulation = population(repeated.state);
    for (let mission = 0; mission < 15; mission++) {
      dispatchForeignPolicy(repeated.state);
      advance(repeated.state, 40);
      repeated.state.time += A.raidIntervalSeconds;
    }
    expect(repeated.state.foreignPolicy!.raids).toHaveLength(A.maximumRaids);
    expect(
      repeated.state.units.filter((unit) => unit.factionId === repeated.faction.id),
    ).toHaveLength(A.maximumRaids * A.raidMembers);
    expect(population(repeated.state)).toBe(initialPopulation);
    expect(validSave(repeated.state)).toBe(true);
  });
});
