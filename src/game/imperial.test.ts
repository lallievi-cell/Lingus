import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, emptyInventory, HOME, WORD_ORDER } from './content';
import { createInitialState } from './state';
import { issueCommand } from './engine';
import {
  allocateCityWorkers,
  applySanction,
  cityPopulation,
  condenseCities,
  evaluateVictory,
  enforceActionLaws,
  handleImperialCommand,
  inscribeLaw,
  playerPopulation,
  registerTradition,
  seasonalImperial,
  updateImperial,
} from './imperial';
import { recordLawWork } from './imperialLawPolicy';
import type { Battalion, BuildingKind, City, Dogma, GameState, Law } from './types';

function fixture() {
  const s = createInitialState(5678);
  s.started = true;
  for (const id of WORD_ORDER)
    s.words[id] = { retention: 100, custodians: [s.units[0].id], uses: 0 };
  s.tier = 5;
  return s;
}
function city(s: GameState, id = 'capital', x = 250, y = 250): City {
  const c: City = {
    id,
    name: id,
    x,
    y,
    sectorX: Math.floor(x / 100),
    sectorY: Math.floor(y / 100),
    factionId: 'player',
    cohorts: { workers: 0, warriors: 0, sages: 0, slaves: 0 },
    resources: emptyInventory(),
    words: [...WORD_ORDER],
    dogmas: [],
    revoltTension: 0,
    housing: 0,
    buildingIds: [],
    vocations: [],
    loyalty: 100,
    assimilation: { delegateCount: 0, active: false },
    production: emptyInventory(),
    capital: id === 'capital',
    garrisonHp: 0,
  };
  s.cities.push(c);
  if (c.capital) c.resources = s.resources;
  return c;
}
function building(s: GameState, c: City, kind: BuildingKind) {
  const b = {
    id: `${kind}-${c.id}`,
    kind,
    x: c.x,
    y: c.y,
    hp: BUILDING_SPECS[kind].maxHp,
    active: true,
    completed: true,
    workerIds: [],
    cityId: c.id,
    lastEfficiency: 1,
  };
  s.buildings.push(b);
  c.buildingIds.push(b.id);
  return b;
}
function army(s: GameState, c: City, id = 'army'): Battalion {
  const b: Battalion = {
    id,
    name: id,
    x: c.x,
    y: c.y,
    cityId: c.id,
    factionId: c.factionId,
    hp: 2000,
    maxHp: 2000,
    morale: 1,
    action: 'idle',
    catapult: false,
    occupation: 0,
    metalWeapons: 20,
  };
  s.battalions.push(b);
  return b;
}
function law(sanctionId = 'O_06', id = 'law'): Law {
  return {
    id,
    tokens: ['S_01', 'V_04', 'O_03', 'M_02', 'C_03', sanctionId],
    name: id,
    subjectId: 'S_01',
    verbId: 'V_04',
    objectId: 'O_03',
    modifierId: 'M_02',
    sanctionId,
    prohibitive: false,
    age: 0,
  };
}
function dogma(targetId: string, vectorId: string): Dogma {
  return {
    id: `dogma-${targetId}`,
    name: 'Test doctrine',
    targetId,
    vectorId,
    age: 0,
    weight: 10,
    description: 'Fixture',
  };
}
function isolate(s: GameState) {
  s.cities = [];
  s.factions = [];
  s.entities = [];
  return s;
}

describe('urban demographics and physical logistics', () => {
  it('learns to exchange from a paid physical gift before Scambiare is known', () => {
    let s = isolate(fixture());
    delete s.words.V_11;
    const enemy = city(s, 'foreign', 350, 250);
    enemy.factionId = 'foreign';
    s.resources.food = 1;
    s = issueCommand(s, ['S_01', 'V_04', 'S_05', 'M_04'], {
      type: 'city',
      id: enemy.id,
      x: enemy.x,
      y: enemy.y,
    });
    expect(s.stats.commands).toBe(1);
    expect(s.resources.food).toBe(0);
    expect(s.caravans[0].gift).toBe(true);
    expect(s.sparks.some((p) => p.wordId === 'V_11')).toBe(false);
    updateImperial(s, 16);
    expect(s.sparks.some((p) => p.wordId === 'V_11')).toBe(false);
    updateImperial(s, 1);
    expect(s.cities[0].resources.food).toBe(1);
    expect(s.sparks.some((p) => p.wordId === 'V_11')).toBe(true);
    expect(s.words.V_11).toBeUndefined();
  });
  it('refuses a gift without charging voice if no physical goods exist', () => {
    let s = isolate(fixture());
    delete s.words.V_11;
    const enemy = city(s, 'foreign', 350, 250);
    enemy.factionId = 'foreign';
    s = issueCommand(s, ['S_01', 'V_04', 'S_05', 'M_04'], {
      type: 'city',
      id: enemy.id,
      x: enemy.x,
      y: enemy.y,
    });
    expect(s.caravans).toHaveLength(0);
    expect(s.voice).toBe(3);
    expect(s.stats.commands).toBe(0);
  });
  it('holds provincial revenue in escrow and credits only delivered tax after corruption', () => {
    const s = isolate(fixture());
    city(s);
    const p = city(s, 'province', 350, 250);
    p.cohorts.workers = 3;
    p.resources.food = 200;
    p.resources.wood = 500;
    building(s, p, 'storage');
    building(s, p, 'depot');
    building(s, p, 'market');
    const tax = law('S_06');
    tax.tokens = ['S_09', 'V_04', 'O_11', 'O_12', 'C_03', 'S_06'];
    tax.subjectId = 'S_09';
    tax.objectId = 'O_11';
    tax.modifierId = 'O_12';
    s.laws = [tax];
    seasonalImperial(s);
    expect(s.resources.coin).toBe(0);
    // Existing food spoils before the market; 500wood loses5% and sells the
    // 75unit surplus above400. Its25% tax travels physically: 18.75coins.
    expect(p.production.coin).toBeCloseTo(75);
    expect(p.resources.coin).toBeCloseTo(56.25);
    expect(s.caravans[0].resources.coin).toBeCloseTo(18.75);
    updateImperial(s, 17);
    expect(s.resources.coin).toBeCloseTo(18.75 * (1 - 0.15 * 0.7));
    expect(p.resources.coin).toBeCloseTo(56.25);
  });
  it('teaches exactlytwo provincial words each season and updates that original faction language', () => {
    const s = fixture(),
      p = s.cities[0],
      f = s.factions[0];
    p.factionId = 'player';
    p.words = WORD_ORDER.slice(0, 34);
    f.words = [...p.words];
    p.assimilation = { delegateCount: 1, active: true };
    p.cohorts = { workers: 0, warriors: 0, sages: 0, slaves: 0 };
    city(s);
    seasonalImperial(s);
    expect(p.words).toHaveLength(36);
    expect(f.words).toEqual(p.words);
    expect(f.intelligibility).toBe(80);
  });
  it('condenses exactly150 living people once, preserving population and their four castes', () => {
    const s = fixture(),
      base = s.units[0];
    s.units = Array.from({ length: 150 }, (_, i) => ({
      ...structuredClone(base),
      id: `person-${i}`,
      strength: i < 20 ? 8 : 4,
      intelligence: i >= 20 && i < 30 ? 8 : 4,
      caste: i >= 140 ? ('slave' as const) : ('citizen' as const),
    }));
    condenseCities(s);
    condenseCities(s);
    const c = s.cities.find((c) => c.capital)!;
    expect(s.urbanized).toBe(true);
    expect(c.cohorts).toEqual({ workers: 110, warriors: 20, sages: 10, slaves: 10 });
    expect(cityPopulation(c)).toBe(150);
    expect(playerPopulation(s)).toBe(150);
    expect(s.cities.filter((c) => c.capital)).toHaveLength(1);
    expect(c.resources).toBe(s.resources);
  });
  it('constructs four houses for exactly80stone40wood and48places in the selected city', () => {
    const s = isolate(fixture()),
      cap = city(s),
      province = city(s, 'province', 350, 250);
    province.cohorts.workers = 1;
    province.resources.stone = 80;
    province.resources.wood = 40;
    const result = handleImperialCommand(
      s,
      ['S_09', 'V_08', 'O_02', 'O_01'],
      { type: 'city', id: cap.id, ...HOME },
      province.id,
    );
    expect(result.valid).toBe(true);
    expect(province.resources.stone).toBe(0);
    expect(province.resources.wood).toBe(0);
    expect(province.housing).toBe(48);
    expect(s.buildings.filter((b) => b.cityId === province.id && b.kind === 'house')).toHaveLength(
      4,
    );
  });
  it('recruits twenty soldiers without counting them again as city residents', () => {
    const s = isolate(fixture()),
      c = city(s);
    s.urbanized = true;
    c.cohorts.warriors = 20;
    s.resources.metalArms = 20;
    expect(handleImperialCommand(s, ['S_09', 'V_12', 'S_08'], undefined, c.id).valid).toBe(true);
    expect(c.cohorts.warriors).toBe(0);
    expect(s.resources.metalArms).toBe(0);
    expect(s.battalions[0].hp).toBe(2000);
    expect(playerPopulation(s)).toBe(20);
  });
  it('keeps the chosen army when a destination replaces the map selection', () => {
    const s = isolate(fixture()),
      c = city(s),
      a = army(s, c, 'first'),
      b = army(s, c, 'chosen');
    expect(
      handleImperialCommand(s, ['S_08', 'V_01'], { type: 'point', x: 450, y: 450 }, b.id).valid,
    ).toBe(true);
    expect(a.action).toBe('idle');
    expect(b.action).toBe('moving');
    expect([b.tx, b.ty]).toEqual([450, 450]);
  });
  it('removes colonists and actual supplies at departure and founds only on arrival', () => {
    const s = isolate(fixture()),
      c = city(s);
    s.urbanized = true;
    c.cohorts.workers = 30;
    s.resources.wood = 50;
    s.resources.stone = 50;
    s.resources.food = 50;
    expect(
      handleImperialCommand(s, ['S_01', 'V_08', 'O_01', 'O_10'], { type: 'point', x: 350, y: 250 })
        .valid,
    ).toBe(true);
    expect(c.cohorts.workers).toBe(0);
    expect(s.resources.food).toBe(0);
    expect(s.cities).toHaveLength(1);
    expect(playerPopulation(s)).toBe(30);
    updateImperial(s, 16);
    expect(s.cities).toHaveLength(1);
    updateImperial(s, 1);
    const colony = s.cities.find((c) => !c.capital)!;
    expect(colony.cohorts.workers).toBe(30);
    expect(colony.resources.food).toBe(50);
    expect(colony.words).toEqual(WORD_ORDER);
    expect(colony.revoltTension).toBe(0);
    expect(playerPopulation(s)).toBe(30);
  });
  it('pays army food locally and money only from the global treasury', () => {
    const s = isolate(fixture());
    city(s);
    const p = city(s, 'province', 350, 250);
    p.resources.food = 40;
    p.resources.coin = 999;
    s.resources.coin = 10;
    const b = army(s, p);
    seasonalImperial(s);
    expect(s.resources.coin).toBe(0);
    expect(p.resources.coin).toBe(999);
    expect(b.hp).toBe(2000);
    expect(b.morale).toBe(1);
    expect(p.resources.food).toBeCloseTo(0);
  });
  it('does not spend provincial monetary escrow when the imperial treasury is empty', () => {
    const s = isolate(fixture());
    city(s);
    const p = city(s, 'province', 350, 250);
    p.resources.food = 100;
    p.resources.coin = 999;
    const b = army(s, p);
    seasonalImperial(s);
    expect(p.resources.coin).toBe(999);
    expect(b.hp).toBe(1750);
    expect(b.morale).toBeCloseTo(0.7);
    expect(s.stats.deaths).toBe(2);
  });
  it('uses thirtyfood before currency is discovered', () => {
    const s = isolate(fixture()),
      c = city(s);
    delete s.words.O_12;
    s.resources.food = 30;
    const b = army(s, c);
    seasonalImperial(s);
    expect(s.resources.food).toBe(0);
    expect(b.hp).toBe(2000);
    expect(b.morale).toBe(1);
  });
  it('applies the border doctrine upkeep discount only while inside owned territory', () => {
    const s = isolate(fixture()),
      c = city(s);
    s.dogmas.push(dogma('O_10', 'V_05'));
    s.resources.food = 14;
    s.resources.coin = 7;
    const b = army(s, c);
    seasonalImperial(s);
    expect(b.hp).toBe(2000);
    expect(s.resources.food).toBeCloseTo(0);
    expect(s.resources.coin).toBeCloseTo(0);
    s.resources.food = 14;
    s.resources.coin = 7;
    b.x = 450;
    b.y = 450;
    seasonalImperial(s);
    expect(b.hp).toBe(1750);
  });
  it('allocates scarce sages once across buildings and grants actual slave work efficiency', () => {
    const s = isolate(fixture()),
      c = city(s);
    c.cohorts.sages = 4;
    c.cohorts.slaves = 3;
    const archive = building(s, c, 'archive'),
      school = building(s, c, 'school'),
      farm = building(s, c, 'farm');
    allocateCityWorkers(s, c);
    expect(archive.lastEfficiency).toBe(1);
    expect(school.lastEfficiency).toBe(0);
    expect(farm.lastEfficiency).toBeCloseTo(1.2);
  });
  it('allows two distinct city vocations without charging per-tick voice', () => {
    const s = isolate(fixture()),
      c = city(s),
      target = { type: 'city' as const, id: c.id, x: c.x, y: c.y };
    let next = registerTradition(s, ['C_02', 'S_09', 'V_09', 'O_04'], target);
    next = registerTradition(next, ['C_02', 'S_09', 'V_12', 'O_07'], target);
    next = registerTradition(next, ['C_02', 'S_09', 'V_11', 'O_12'], target);
    expect(next.cities[0].vocations).toHaveLength(2);
    expect(next.voice).toBe(s.voice);
  });
});

describe('laws apply to actual people and preserve the death pipeline', () => {
  it('requires an owned active palace and enforces the six-law Iron Age capacity', () => {
    let s = fixture();
    building(s, s.cities[0], 'palace');
    expect(inscribeLaw(s, law().tokens).laws).toHaveLength(0);
    s = isolate(s);
    const c = city(s);
    building(s, c, 'palace');
    for (const sanction of ['O_06', 'S_06', 'V_03', 'O_12', 'O_11', 'O_10', 'M_03'])
      s = inscribeLaw(s, law(sanction).tokens);
    expect(s.laws).toHaveLength(6);
  });
  it('does not combine two incentive laws into premature emancipation', () => {
    const s = fixture(),
      u = s.units[0];
    u.caste = 'slave';
    const a = law('M_05', 'a'),
      b = law('M_05', 'b');
    for (let season = 0; season < 5; season++) {
      applySanction(s, a, u, undefined, true);
      applySanction(s, b, u, undefined, true);
    }
    expect(u.caste).toBe('slave');
    for (let season = 5; season < 10; season++) applySanction(s, a, u, undefined, true);
    expect(u.caste).toBe('citizen');
    expect(u.emancipated).toBe(true);
  });
  it('survives fortyHP corporal punishment and records a90second work incentive', () => {
    const s = fixture(),
      u = s.units[0];
    u.hp = 20;
    const before = s.cohesion;
    s.time = 123;
    applySanction(s, law('V_03'), u);
    expect(u.hp).toBe(1);
    expect(s.cohesion).toBe(before - 2);
    expect(u.lastEventAt?.LAW_PRODUCTIVITY_UNTIL).toBe(213);
  });
  it('transfers a fine from real private wealth without creating currency', () => {
    const s = fixture(),
      u = s.units[0];
    u.wealth = 75;
    s.resources.coin = 5;
    s.inequality = 10;
    applySanction(s, law('O_12'), u);
    expect(u.wealth).toBe(25);
    expect(s.resources.coin).toBe(55);
    expect(s.inequality).toBe(8);
  });
  it('blocks judicial execution of a protected person', () => {
    const s = fixture(),
      u = s.units[0];
    s.dogmas.push(dogma('S_02', 'V_05'));
    applySanction(s, law('O_06'), u);
    expect(u.hp).toBe(100);
    expect(s.stats.deaths).toBe(0);
  });
  it('a judicially killed divine king causes the same collapse as any other regicide', () => {
    const s = fixture(),
      u = s.units[0];
    u.isKing = true;
    s.kingId = u.id;
    s.government = 'monarchy';
    s.dogmas.push(dogma('S_07', 'C_02'));
    applySanction(s, law('O_06'), u);
    expect(u.hp).toBe(0);
    expect(s.cohesion).toBe(0);
    expect(s.stats.deaths).toBe(1);
  });
});

describe('battles and final conditions', () => {
  it('garrison casualties use the shared regicide pipeline without counting the person twice', () => {
    const s = isolate(fixture()),
      c = city(s),
      enemy = city(s, 'foreign', 350, 250);
    s.urbanized = true;
    c.cohorts.warriors = 1;
    c.garrisonHp = 100;
    enemy.factionId = 'foreign';
    const king = s.units[0];
    king.cityId = c.id;
    king.isKing = true;
    king.caste = 'warrior';
    s.kingId = king.id;
    s.government = 'monarchy';
    s.dogmas.push(dogma('S_07', 'C_02'));
    const attacker = army(s, enemy);
    attacker.x = c.x;
    attacker.y = c.y;
    attacker.action = 'attacking';
    attacker.targetId = c.id;
    updateImperial(s, 1);
    expect(king.hp).toBe(0);
    expect(s.cohesion).toBe(0);
    expect(c.cohorts.warriors).toBe(0);
    expect(s.stats.deaths).toBe(1);
    expect(s.entities.filter((e) => e.kind === 'corpse')).toHaveLength(1);
  });
  it('foreign buildings pay maintenance once from their own stores and decay without using the player treasury', () => {
    const s = isolate(fixture());
    city(s);
    const foreign = city(s, 'foreign', 350, 250);
    foreign.factionId = 'foreign';
    foreign.resources.wood = 2;
    foreign.resources.coin = 10;
    s.resources.wood = 100;
    s.resources.coin = 100;
    const fire = building(s, foreign, 'campfire'),
      archive = building(s, foreign, 'archive');
    seasonalImperial(s);
    expect(fire.active).toBe(true);
    expect(archive.active).toBe(true);
    expect(foreign.resources.wood).toBe(0);
    expect(foreign.resources.coin).toBe(0);
    expect(s.resources.wood).toBe(100);
    expect(s.resources.coin).toBe(100);
    seasonalImperial(s);
    expect(fire.active).toBe(false);
    expect(fire.hp).toBe(80);
    expect(archive.active).toBe(false);
    expect(archive.hp).toBe(280);
    expect(s.resources.coin).toBe(100);
  });
  it('a catapult deals200 pure wall damage each second rather than twenty times that value', () => {
    const s = isolate(fixture()),
      c = city(s),
      enemy = city(s, 'enemy', 350, 250);
    enemy.factionId = 'foreign';
    const walls = building(s, enemy, 'walls'),
      b = army(s, c);
    b.x = enemy.x;
    b.catapult = true;
    b.action = 'conquering';
    b.targetId = enemy.id;
    updateImperial(s, 1);
    expect(walls.hp).toBe(1800);
    updateImperial(s, 1);
    expect(walls.hp).toBe(1600);
  });
  it('annexes after thirty occupation seconds and retains local language and doctrine', () => {
    const s = isolate(fixture()),
      c = city(s),
      enemy = city(s, 'enemy', 350, 250);
    enemy.factionId = 'foreign';
    enemy.words = ['S_01', 'V_01'];
    enemy.dogmas = [dogma('O_03', 'V_05')];
    const b = army(s, c);
    b.x = enemy.x;
    b.action = 'conquering';
    b.targetId = enemy.id;
    for (let i = 0; i < 29; i++) updateImperial(s, 1);
    expect(enemy.factionId).toBe('foreign');
    updateImperial(s, 1);
    expect(enemy.factionId).toBe('player');
    expect(enemy.revoltTension).toBe(50);
    expect(enemy.words).toEqual(['S_01', 'V_01']);
    expect(enemy.dogmas[0].targetId).toBe('O_03');
  });
  it('physical battle damage includes sacrificial morale and does not give enemies player dogmas', () => {
    function damage(sacrificial: boolean) {
      const s = isolate(fixture()),
        c = city(s),
        enemy = city(s, 'enemy', 350, 250);
      enemy.factionId = 'foreign';
      const b = army(s, c);
      b.x = enemy.x;
      b.action = 'attacking';
      b.targetId = enemy.id;
      enemy.garrisonHp = 2000;
      enemy.cohorts.warriors = 20;
      if (sacrificial) s.eventTimes.sacrificeMorale = 90;
      updateImperial(s, 1);
      return 2000 - enemy.garrisonHp;
    }
    expect(damage(true) / damage(false)).toBeCloseTo(1.2);
  });
  it('Valhalla keeps a wounded battalion fighting instead of triggering its ordinary retreat', () => {
    function battle(valhalla: boolean) {
      const s = isolate(fixture()),
        capital = city(s),
        enemyCity = city(s, 'enemy', 310, 250);
      enemyCity.factionId = 'foreign';
      const b = army(s, capital),
        enemy = army(s, enemyCity, 'foreign-army');
      b.x = enemy.x;
      b.y = enemy.y;
      b.hp = 200;
      b.action = 'attacking';
      b.targetId = enemyCity.id;
      if (valhalla) s.dogmas.push(dogma('V_03', 'O_06'));
      updateImperial(s, 0.1);
      expect(b.hp).toBeGreaterThan(0);
      expect(b.hp).toBeLessThan(200);
      expect(enemy.hp).toBeLessThan(2000);
      return b;
    }
    const ordinary = battle(false),
      devoted = battle(true);
    expect(ordinary.action).toBe('moving');
    expect(ordinary.tx).toBe(HOME.x);
    expect(devoted.action).toBe('attacking');
    expect(devoted.targetId).toBe('enemy');
  });
  it('sanctuary prevents actual army damage within the home perimeter', () => {
    const s = isolate(fixture()),
      c = city(s),
      enemyCity = city(s, 'enemy', 350, 250);
    enemyCity.factionId = 'foreign';
    const b = army(s, c),
      enemy = army(s, enemyCity, 'foreign-army');
    enemy.x = b.x;
    enemy.y = b.y;
    s.dogmas.push(dogma('S_08', 'O_01'));
    updateImperial(s, 0.5);
    expect(b.hp).toBe(2000);
    expect(enemy.hp).toBeLessThan(2000);
  });
  it('requires sixteen consecutive peaceful seasons and resets the imperial counter on unrest', () => {
    const s = isolate(fixture()),
      c = city(s);
    building(s, c, 'palace');
    s.laws = Array.from({ length: 5 }, (_, i) => law('V_03', `law-${i}`));
    for (let i = 0; i < 15; i++) evaluateVictory(s, true);
    expect(s.victory).toBeNull();
    s.revoltTension = 30;
    evaluateVictory(s, true);
    expect(s.victoryProgress.imperialSeasons).toBe(0);
    s.revoltTension = 0;
    for (let i = 0; i < 16; i++) evaluateVictory(s, true);
    expect(s.victory).toBe('imperial');
  });
  it('does not accrue Pax seasons while the palace is inactive', () => {
    const s = isolate(fixture()),
      c = city(s);
    building(s, c, 'palace').active = false;
    s.laws = Array.from({ length: 5 }, (_, i) => law('V_03', `law-${i}`));
    evaluateVictory(s, true);
    expect(s.victoryProgress.imperialSeasons).toBe(0);
  });
  it('requires full retention, a fully staffed owned archive and every language at80percent', () => {
    const s = fixture(),
      c = city(s),
      archive = building(s, c, 'archive');
    for (const f of s.factions) f.words = [...WORD_ORDER];
    s.words.O_03.retention = 99;
    evaluateVictory(s);
    expect(s.victory).toBeNull();
    s.words.O_03.retention = 100;
    archive.lastEfficiency = 0.75;
    evaluateVictory(s);
    expect(s.victory).toBeNull();
    archive.lastEfficiency = 1;
    s.factions[0].words = WORD_ORDER.slice(0, 35);
    evaluateVictory(s);
    expect(s.victory).toBeNull();
    s.factions[0].words = WORD_ORDER.slice(0, 36);
    evaluateVictory(s);
    expect(s.victory).toBe('cultural');
  });
  it('requires actual completed reforms, emancipation and ninetycohesion for philosophy', () => {
    const s = isolate(fixture());
    s.philosophy = true;
    s.emancipated = true;
    s.cohesion = 100;
    evaluateVictory(s);
    expect(s.victory).toBeNull();
    s.dogmaReformTargets = ['former-dogma'];
    s.eventTimes['reformed:former-dogma'] = 1;
    s.cohesion = 89;
    evaluateVictory(s);
    expect(s.victory).toBeNull();
    s.cohesion = 90;
    evaluateVictory(s);
    expect(s.victory).toBe('philosophical');
  });
  it('foreign survival consumes finite local berries and does not research new words on a timer alone', () => {
    const s = fixture(),
      f = s.factions[0],
      c = s.cities.find((c) => c.id === f.cityId)!;
    s.time = 90; // Settle the first spring, when finite berries were available.
    s.entities = s.entities.filter(
      (e) => Math.floor(e.x / 100) === c.sectorX && Math.floor(e.y / 100) === c.sectorY,
    );
    const berries = s.entities.filter((e) => e.kind === 'berries'),
      before = berries.reduce((n, e) => n + e.amount, 0);
    const original = [...f.words];
    seasonalImperial(s);
    expect(berries.reduce((n, e) => n + e.amount, 0)).toBeLessThan(before);
    expect(cityPopulation(c)).toBeGreaterThan(0);
    expect(f.eventMemory?.length).toBeGreaterThan(0);
    expect(
      f.words
        .filter((w) => !original.includes(w))
        .every((w) => f.eventMemory?.some((e) => e.wordIds.includes(w))),
    ).toBe(true);
  });
});

describe('resolved legal rules and actual Valhalla service', () => {
  it('enacts the stated Fire inquisition and stops an already running reform', () => {
    const s = isolate(fixture()),
      c = city(s);
    building(s, c, 'palace');
    building(s, c, 'school');
    s.cohesion = 40;
    s.dogmas = [{ ...dogma('O_03', 'M_01'), reforming: true }];
    const n = inscribeLaw(s, ['S_02', 'V_14', 'M_03', 'M_01', 'C_03', 'O_05']);
    expect(n.laws).toHaveLength(1);
    expect(n.cohesion).toBe(50);
    expect(n.dogmas[0].reforming).toBe(false);
    const weight = n.dogmas[0].weight;
    seasonalImperial(n);
    expect(n.dogmas[0].weight).toBe(weight);
  });
  it('only punishes the caste named by the law, including implicit clicked targets', () => {
    const s = isolate(fixture()),
      c = city(s);
    building(s, c, 'court');
    const u = s.units[0];
    const rule = {
      ...law('V_03'),
      subjectId: 'S_06',
      verbId: 'V_03',
      objectId: 'O_03',
      prohibitive: true,
    };
    s.laws = [rule];
    expect(enforceActionLaws(s, ['S_02', 'V_03', 'O_03'], undefined, [u.id])).toBe(true);
    expect(u.hp).toBe(100);
    u.caste = 'slave';
    expect(enforceActionLaws(s, ['S_02', 'V_03', 'O_03'], undefined, [u.id])).toBe(false);
    expect(u.hp).toBe(60);
  });
  it('does not count a pending command or lifetime work as a completed legal season', () => {
    const s = isolate(fixture());
    const u = s.units[0];
    s.units = [u];
    u.caste = 'slave';
    u.workCycles = 999;
    u.command = ['S_06', 'V_08', 'O_02'];
    const l = { ...law('M_05'), subjectId: 'S_06', verbId: 'V_08', objectId: 'O_02' };
    s.laws = [l];
    s.time = 90;
    seasonalImperial(s);
    expect(s.eventTimes[`lawful:${l.id}:${u.id}`]).toBeUndefined();
    expect(u.caste).toBe('slave');
    for (let i = 1; i <= 10; i++) {
      s.time = (i + 1) * 90;
      recordLawWork(s, u.id, ['S_06', 'V_08', 'O_02'], 1, s.time - 1);
      seasonalImperial(s);
    }
    expect(u.caste).toBe('citizen');
    expect(s.eventTimes[`lawful:${l.id}:${u.id}`]).toBe(10);
  });
  it('moves a material confiscation on a real caravan rather than crediting remote goods immediately', () => {
    const s = isolate(fixture()),
      cap = city(s),
      province = city(s, 'province', 350, 250);
    province.resources.wood = 100;
    applySanction(s, law('O_11'), undefined, province);
    expect(province.resources.wood).toBe(50);
    expect(s.resources.wood).toBe(0);
    expect(s.caravans[0].resources.wood).toBe(50);
    updateImperial(s, 10);
    expect(s.resources.wood).toBe(0);
    updateImperial(s, 7);
    expect(cap.resources.wood).toBe(50);
  });
  it('covers an assessed fiscal deficit by its declared value rather than enslaving one person for every deficit', () => {
    const s = isolate(fixture());
    city(s);
    const p = city(s, 'province', 350, 250);
    p.cohorts.workers = 20;
    p.resources.ore = 100;
    p.resources.wood = 200;
    p.resources.food = 100;
    p.words = [];
    building(s, p, 'foundry');
    building(s, p, 'depot');
    building(s, p, 'storage');
    s.laws = [
      { ...law('S_06'), subjectId: 'S_09', verbId: 'V_04', objectId: 'O_11', modifierId: 'O_07' },
    ];
    s.time = 90;
    seasonalImperial(s);
    expect(s.eventTimes[`fiscalDeficit:${p.id}`]).toBe(450);
    expect(p.cohorts.slaves).toBe(5);
    expect(p.cohorts.workers).toBe(15);
  });
  it('makes scholars physically take the first wounds and lose custody when the frontline kills them', () => {
    const s = isolate(fixture());
    s.urbanized = true;
    const own = city(s),
      enemy = city(s, 'enemy', 250, 250);
    enemy.factionId = 'enemy';
    enemy.cohorts.warriors = 50;
    enemy.garrisonHp = 5000;
    const sage = s.units.find((u) => u.name === 'Ayla')!;
    s.units = [sage];
    sage.cityId = own.id;
    sage.caste = 'sage';
    sage.x = 250;
    sage.y = 250;
    own.cohorts.sages = 1;
    own.cohorts.warriors = 20;
    s.cohesion = 50;
    s.words.O_02 = { retention: 80, custodians: [sage.id], uses: 0 };
    s.dogmas = [dogma('V_03', 'O_06')];
    const a = army(s, own);
    a.action = 'attacking';
    a.targetId = enemy.id;
    building(s, own, 'archive');
    const control = structuredClone(s);
    control.units = [];
    control.cities.find((c) => c.id === own.id)!.cohorts.sages = 0;
    updateImperial(s, 1);
    updateImperial(control, 1);
    expect(sage.hp).toBe(0);
    expect(sage.action).toBe('dead');
    expect(own.cohorts.sages).toBe(0);
    expect(s.words.O_02.retention).toBe(0);
    expect(s.cohesion).toBe(55);
    expect(a.frontlineSageIds).toContain(sage.id);
    expect(a.hp - control.battalions[0].hp).toBeCloseTo(100);
  });
  it('withdraws scholars from archives until they physically return from their assigned army', () => {
    const s = isolate(fixture());
    s.urbanized = true;
    const c = city(s),
      enemy = city(s, 'enemy', 450, 250);
    enemy.factionId = 'enemy';
    const sage = s.units.find((u) => u.name === 'Ayla')!;
    s.units = [sage];
    sage.cityId = c.id;
    sage.caste = 'sage';
    sage.x = 250;
    sage.y = 250;
    c.cohorts.sages = 1;
    s.dogmas = [dogma('V_03', 'O_06')];
    const archive = building(s, c, 'archive'),
      a = army(s, c);
    a.action = 'attacking';
    a.targetId = enemy.id;
    updateImperial(s, 1);
    expect(sage.action).toBe('frontline');
    expect(sage.x).toBe(250);
    expect(a.x).toBe(254);
    expect(archive.lastEfficiency).toBe(0);
    updateImperial(s, 1);
    expect(sage.x).toBe(254);
    a.action = 'idle';
    updateImperial(s, 1);
    expect(sage.x).toBe(250);
    expect(sage.action).toBe('idle');
    expect(archive.lastEfficiency).toBe(0.25);
  });
  it('uses only scholarly workers for a fire monopoly and applies its contextual production bonus', () => {
    const s = isolate(fixture()),
      c = city(s);
    c.cohorts.workers = 4;
    c.resources.ore = 100;
    c.resources.wood = 200;
    c.resources.food = 100;
    const furnace = building(s, c, 'foundry');
    building(s, c, 'depot');
    building(s, c, 'storage');
    s.dogmas = [dogma('O_05', 'S_04')];
    allocateCityWorkers(s, c);
    expect(furnace.lastEfficiency).toBe(0);
    c.cohorts.sages = 4;
    s.time = 90;
    seasonalImperial(s);
    expect(furnace.lastEfficiency).toBe(1);
    expect(c.production.ingot).toBeCloseTo(18 * 1.3);
  });
  it('does not repeatedly subtract the opposing-doctrine diplomatic penalty every tick', () => {
    const s = fixture();
    s.dogmas = [dogma('O_04', 'M_01')];
    const f = s.factions[0];
    f.dogmas = [dogma('O_04', 'C_02')];
    updateImperial(s, 0.25);
    expect(f.relation).toBe(-50);
    updateImperial(s, 0.25);
    expect(f.relation).toBe(-50);
    s.dogmas = [];
    updateImperial(s, 0.25);
    expect(f.relation).toBe(0);
  });
  it('applies the canonical synergy only for a law enforcing the taboo and adds the exact schism cost for a sanctified target', () => {
    const s = isolate(fixture()),
      c = city(s);
    building(s, c, 'palace');
    s.cohesion = 25;
    s.corruption = 0.8;
    s.revoltTension = 40;
    s.dogmas = [{ ...dogma('O_04', 'M_01'), weight: 24 }];
    const canonical = inscribeLaw(s, ['S_02', 'V_02', 'O_04', 'M_01', 'C_03', 'O_06']);
    expect(canonical.cohesion).toBe(100);
    expect(canonical.corruption).toBe(0);
    expect(canonical.revoltTension).toBe(20);
    s.dogmas = [{ ...dogma('S_05', 'O_01'), weight: 24 }];
    const schism = inscribeLaw(s, ['S_05', 'V_01', 'O_10', 'M_01', 'C_03', 'S_06']);
    expect(schism.revoltTension).toBe(52);
    expect(schism.cohesion).toBe(25);
    expect(schism.corruption).toBe(0.8);
    const independent = inscribeLaw(s, ['S_02', 'V_04', 'O_03', 'M_02', 'C_03', 'V_03']);
    expect(independent.revoltTension).toBe(40);
    expect(independent.cohesion).toBe(25);
    expect(independent.corruption).toBe(0.8);
  });
  it('removes a physically represented debtor from citizen custody when a fiscal sanction enslaves them', () => {
    const s = isolate(fixture()),
      c = city(s);
    c.cohorts.workers = 1;
    const u = s.units.find((u) => u.name === 'Tala')!;
    s.units = [u];
    u.cityId = c.id;
    u.caste = 'citizen';
    s.words.O_02 = { retention: 80, custodians: [u.id], uses: 0 };
    applySanction(s, law('S_06'), undefined, c);
    expect(c.cohorts.workers).toBe(0);
    expect(c.cohorts.slaves).toBe(1);
    expect(u.caste).toBe('slave');
    expect(s.words.O_02.custodians).toEqual([]);
    expect(s.words.O_02.retention).toBe(0);
  });
});
