import { describe, expect, it } from 'vitest';
import { createGame } from './engine';
import { BUILDING_SPECS, HOME } from './content';
import {
  createBuilding,
  processWork,
  seasonalCore,
  updateUnits,
  consume,
  updateAnimals,
  simulationStep,
} from './simulation';
import { seasonalDutyFulfilled } from './imperialLawPolicy';
import type { GameState, Law, Unit } from './types';

function world(seed = 1): GameState {
  const s = createGame(seed);
  s.started = true;
  s.entities = [];
  s.units = s.units.slice(0, 1);
  Object.assign(s.units[0], {
    ...HOME,
    strength: 5,
    intelligence: 5,
    age: 6,
    hp: 100,
    hunger: 40,
    temp: 100,
    action: 'idle',
    progress: 0,
  });
  return s;
}
function learn(s: GameState, id: string) {
  s.words[id] = { retention: 100, custodians: [s.units[0].id], uses: 0 };
}
function law(tokens: string[], age = 0): Law {
  return {
    id: tokens.join('-'),
    tokens,
    name: 'Test',
    subjectId: tokens[0],
    verbId: tokens[1],
    objectId: tokens[2],
    modifierId: tokens[3],
    sanctionId: tokens[5],
    prohibitive: tokens[3] === 'M_01',
    age,
  };
}
function cloneUnit(s: GameState, id: string): Unit {
  const u = structuredClone(s.units[0]);
  u.id = id;
  s.units.push(u);
  return u;
}
function craft(s: GameState) {
  const u = s.units[0];
  Object.assign(u, {
    action: 'crafting',
    command: ['S_02', 'V_06', 'O_02'],
    tx: u.x,
    ty: u.y,
    progress: 0,
  });
  return u;
}
function build(s: GameState, kind: 'storage' | 'school' = 'storage') {
  const u = s.units[0];
  Object.assign(u, {
    action: 'building',
    buildingKind: kind,
    command: ['S_01', 'V_08', 'O_02', kind === 'school' ? 'S_04' : 'M_02'],
    tx: u.x,
    ty: u.y,
    progress: 0,
  });
  return u;
}

describe('physical rule connections from the guide', () => {
  it('a real hostile wound causes one attack trauma per90seconds, independently of continued damage', () => {
    const s = world(),
      u = s.units[0];
    s.time = 65;
    s.entities.push({ id: 'wolf', kind: 'wolf', ...HOME, amount: 1, hp: 45, maxHp: 45 });
    updateAnimals(s, 0.1);
    expect(u.hp).toBeLessThan(100);
    expect(s.cohesion).toBe(95);
    expect(s.recentTrauma).toEqual({ tag: 'ENV_ALLY_DAMAGED', time: 65 });
    updateAnimals(s, 0.1);
    expect(s.cohesion).toBe(95);
    s.time = 155;
    updateAnimals(s, 0.1);
    expect(s.cohesion).toBe(90);
  });

  it('famine trauma requires at least half the living community at hunger100 and is rate limited separately', () => {
    const s = world(),
      a = s.units[0],
      b = cloneUnit(s, 'second'),
      c = cloneUnit(s, 'third');
    a.hunger = 100;
    b.hunger = 60;
    c.hunger = 60;
    simulationStep(s, 0.1);
    expect(s.cohesion).toBe(100);
    b.hunger = 100;
    simulationStep(s, 0.1);
    expect(s.cohesion).toBe(92);
    expect(s.recentTrauma?.tag).toBe('ENV_STARVATION');
    simulationStep(s, 0.1);
    expect(s.cohesion).toBe(92);
    s.time = 90;
    simulationStep(s, 0.1);
    expect(s.cohesion).toBe(84);
  });
  it('parasites halve actual crafting work for45seconds without becoming a movement penalty', () => {
    const healthy = world(),
      sick = world();
    const a = craft(healthy),
      b = craft(sick);
    b.parasiteUntil = 45;
    processWork(healthy, a, 1);
    processWork(sick, b, 1);
    expect(a.progress).toBe(1);
    expect(b.progress).toBe(0.5);
    sick.time = 46;
    processWork(sick, b, 1);
    expect(b.progress).toBe(1.5);
    Object.assign(a, { action: 'moving', tx: HOME.x + 4, ty: HOME.y });
    Object.assign(b, { action: 'moving', tx: HOME.x + 4, ty: HOME.y, parasiteUntil: 100 });
    processWork(healthy, a, 1);
    processWork(sick, b, 1);
    expect(a.x).toBe(HOME.x + 4);
    expect(b.x).toBe(a.x);
  });

  it('gains exactly0.1strength after five completed hunts or constructions', () => {
    const s = world(),
      u = s.units[0];
    for (let i = 0; i < 2; i++) {
      const prey = { id: `prey${i}`, kind: 'deer' as const, ...HOME, amount: 2, hp: 1, maxHp: 30 };
      s.entities.push(prey);
      Object.assign(u, {
        action: 'hunting',
        targetId: prey.id,
        command: ['S_02', 'V_03', 'O_04'],
        progress: 0,
      });
      processWork(s, u, 1);
    }
    expect(u.strength).toBe(5);
    for (let i = 0; i < 2; i++) processWork(s, build(s), 5);
    expect(u.strength).toBe(5);
    processWork(s, build(s), 5);
    expect(u.strength).toBeCloseTo(5.1);
    expect(u.workCycles).toBe(5);
  });

  it('one whole lithic tool accelerates only one simultaneous gatherer', () => {
    const s = world(),
      a = s.units[0],
      b = cloneUnit(s, 'second');
    s.resources.tool = 1;
    s.entities.push({
      id: 'wood',
      kind: 'tree',
      ...HOME,
      amount: 10,
      maxAmount: 10,
      hp: 100,
      maxHp: 100,
    });
    for (const u of s.units)
      Object.assign(u, {
        action: 'gathering',
        targetId: 'wood',
        command: ['S_01', 'V_04', 'O_03'],
        progress: 0,
      });
    processWork(s, a, 1.4);
    processWork(s, b, 1.4);
    expect(a.action).toBe('returning');
    expect(a.carry?.amount).toBe(1);
    expect(b.action).toBe('gathering');
    expect(b.carry).toBeUndefined();
    expect(b.progress).toBeCloseTo(1.4);
  });

  it('carrying wears the actual tool on extraction and leaves the load out of storage until arrival', () => {
    const s = world(),
      u = s.units[0];
    s.resources.tool = 1;
    s.entities.push({
      id: 'wood',
      kind: 'tree',
      ...HOME,
      amount: 10,
      maxAmount: 10,
      hp: 100,
      maxHp: 100,
    });
    Object.assign(u, { action: 'gathering', targetId: 'wood', command: ['S_01', 'V_04', 'O_03'] });
    processWork(s, u, 2);
    expect(s.resources.tool).toBeCloseTo(0.9);
    expect(s.resources.wood).toBe(0);
    expect(u.carry).toEqual({ resource: 'wood', amount: 1 });
    expect(s.entities[0].amount).toBe(9);
  });

  it('danger-based flight overrides an unrelated current order after a real enemy wound', () => {
    const s = world(),
      u = s.units[0];
    learn(s, 'M_01');
    Object.assign(u, {
      x: HOME.x + 50,
      hp: 30,
      hunger: 50,
      action: 'gathering',
      command: ['S_02', 'V_04', 'O_03'],
      lastDamageCause: 'V_03',
    });
    updateUnits(s, 1);
    expect(u.action).toBe('fleeing');
    expect(u.x).toBeLessThan(HOME.x + 50);
    expect(u.command).toBeUndefined();
  });

  it('a nighttime tradition wakes a sleeping eligible worker without spending voice', () => {
    const s = world(),
      u = s.units[0];
    s.time = 65;
    u.action = 'sleeping';
    s.traditions.push({
      id: 'night',
      tokens: ['C_01', 'S_01', 'V_01'],
      target: { type: 'point', x: HOME.x + 20, y: HOME.y },
      createdAt: 0,
    });
    const voice = s.voice;
    updateUnits(s, 1);
    expect(u.action).toBe('moving');
    expect(u.x).toBeGreaterThan(HOME.x);
    expect(s.voice).toBe(voice);
  });

  it('construction fills only real nearby compatible adult workers up to the building limit', () => {
    const s = world(),
      builder = s.units[0];
    builder.intelligence = 7;
    for (let i = 0; i < 5; i++) {
      const teacher = cloneUnit(s, `teacher${i}`);
      teacher.intelligence = 7;
      teacher.age = i === 4 ? 2 : 6;
    }
    processWork(s, build(s, 'school'), 5);
    const school = s.buildings[0];
    expect(school.kind).toBe('school');
    expect(school.workerIds).toHaveLength(BUILDING_SPECS.school.workers);
    expect(school.workerIds).not.toContain('teacher4');
    expect(builder.jobBuildingId).toBe(school.id);
    expect(s.units.filter((u) => u.jobBuildingId === school.id)).toHaveLength(4);
  });

  it('a school teaches only while real teachers operate it and cannot repeatedly grant the same bonus', () => {
    const s = world();
    s.units = [];
    const base = createGame().units[0];
    for (let i = 0; i < 4; i++)
      s.units.push({
        ...structuredClone(base),
        id: `teacher${i}`,
        ...HOME,
        intelligence: 7,
        hunger: 20,
        action: 'idle',
      });
    const child = {
      ...structuredClone(base),
      id: 'child',
      ...HOME,
      age: 2,
      intelligence: 5,
      hunger: 20,
    };
    s.units.push(child);
    const school = createBuilding(s, 'school');
    expect(child.intelligence).toBe(5);
    updateUnits(s, 0);
    expect(child.intelligence).toBe(5);
    for (const teacher of s.units.slice(0, 2)) {
      teacher.action = 'working';
      teacher.jobBuildingId = school.id;
      school.workerIds!.push(teacher.id);
    }
    updateUnits(s, 0);
    expect(child.intelligence).toBe(6);
    updateUnits(s, 0);
    expect(child.intelligence).toBe(6);
    for (const teacher of s.units.slice(2, 4)) {
      teacher.action = 'working';
      teacher.jobBuildingId = school.id;
      school.workerIds!.push(teacher.id);
    }
    updateUnits(s, 0);
    expect(child.intelligence).toBe(7);
    updateUnits(s, 0);
    expect(child.intelligence).toBe(7);
  });

  it('kept berries on the real initial home pile can generate the spring seed observation', () => {
    const s = world();
    s.time = 360;
    s.resources.food = 2;
    seasonalCore(s);
    expect(s.resources.food).toBe(1); // Real winter spoilage is paid first.
    expect(
      s.units[0].eventMemory?.some(
        (e) => e.tag === 'ENV_SEED_SPROUT' && e.wordIds.includes('V_09'),
      ),
    ).toBe(true);
  });

  it('retains fractional fauna growth across spring seasons while extinction stays permanent', () => {
    const s = world();
    s.units = [];
    for (let i = 0; i < 8; i++)
      s.entities.push({
        id: `deer${i}`,
        kind: 'deer',
        x: 240 + i,
        y: 240,
        amount: 2,
        hp: 30,
        maxHp: 30,
      });
    s.time = 360;
    seasonalCore(s);
    expect(s.entities).toHaveLength(8);
    expect(s.eventTimes['FAUNA_FRACTION:sector-2-2']).toBeCloseTo(0.96);
    s.time = 720;
    seasonalCore(s);
    expect(s.entities).toHaveLength(9);
    for (const e of s.entities) e.hp = 0;
    s.time = 1080;
    seasonalCore(s);
    expect(s.entities.filter((e) => e.hp > 0)).toHaveLength(0);
    expect(s.eventTimes['FAUNA_FRACTION:sector-2-2']).toBe(0);
  });

  it('a newborn inherits both parents and requires the pair to have slept at home', () => {
    const s = world(1),
      a = s.units[0],
      b = cloneUnit(s, 'parent-b');
    Object.assign(a, { strength: 2, intelligence: 4, sleptThisNight: true });
    Object.assign(b, { strength: 8, intelligence: 10, sleptThisNight: true });
    s.time = 90;
    seasonalCore(s);
    expect(s.stats.births).toBe(1);
    const child = s.units.find((u) => u.age === 0)!;
    expect([4, 6]).toContain(child.strength);
    expect([6, 8]).toContain(child.intelligence);
    const awake = world(1);
    cloneUnit(awake, 'awake-b');
    awake.time = 90;
    seasonalCore(awake);
    expect(awake.stats.births).toBe(0);
  });
});

describe('laws change actual individual behavior', () => {
  it('a permanent work script cannot bypass the court or punish its worker again every tick', () => {
    const s = world(),
      u = s.units[0];
    s.time = 65;
    s.buildings.push({ id: 'court', kind: 'court', ...HOME, hp: 500, active: true });
    s.entities.push({ id: 'wood', kind: 'tree', ...HOME, amount: 10, hp: 100, maxHp: 100 });
    s.laws.push(law(['S_01', 'V_03', 'O_03', 'M_01', 'C_03', 'V_03']));
    s.traditions.push({
      id: 'illegal',
      tokens: ['C_02', 'S_01', 'V_03', 'O_03'],
      target: { type: 'entity', id: 'wood', ...HOME },
      createdAt: 0,
    });
    updateUnits(s, 1);
    expect(u.hp).toBe(60);
    expect(s.entities[0].amount).toBe(10);
    updateUnits(s, 1);
    expect(u.hp).toBe(60);
    expect(s.entities[0].amount).toBe(10);
  });

  it('a resource sanctuary protects the physical wood node rather than its artisan', () => {
    const s = world(),
      u = s.units[0];
    s.dogmas.push({
      id: 'sacred',
      targetId: 'O_03',
      vectorId: 'O_01',
      age: 0,
      weight: 10,
      name: 'Santuario',
      description: '',
    });
    s.entities.push({ id: 'wood', kind: 'tree', ...HOME, amount: 10, hp: 100, maxHp: 100 });
    Object.assign(u, { action: 'gathering', targetId: 'wood', command: ['S_02', 'V_03', 'O_03'] });
    processWork(s, u, 2);
    expect(s.entities[0].amount).toBe(10);
    expect(u.action).toBe('idle');
  });
  it('winter Corvée accelerates a real construction rather than every unrelated activity', () => {
    const ordinary = world(),
      forced = world();
    ordinary.time = forced.time = 270;
    forced.laws.push(law(['S_01', 'V_08', 'O_02', 'M_02', 'C_03', 'V_03']));
    processWork(ordinary, build(ordinary), 4);
    processWork(forced, build(forced), 4);
    expect(ordinary.buildings).toHaveLength(0);
    expect(forced.buildings).toHaveLength(1);
  });

  it('the vagrancy rule reduces the cost of a real ration by15percent', () => {
    const s = world(),
      u = s.units[0];
    s.resources.food = 2;
    u.hunger = 60;
    s.laws.push(law(['S_02', 'V_04', 'O_01', 'C_02', 'C_03', 'O_10']));
    expect(consume(s, u)).toBe(true);
    expect(s.resources.food).toBeCloseTo(1.15);
    expect(u.hunger).toBe(35);
  });

  it('slave protection halves environmental mortality without changing the temperature equation', () => {
    const ordinary = world(),
      protectedState = world();
    ordinary.time = protectedState.time = 275;
    for (const s of [ordinary, protectedState])
      Object.assign(s.units[0], { caste: 'slave', temp: 10, hunger: 50 });
    protectedState.laws.push(law(['S_02', 'V_03', 'S_06', 'M_01', 'C_03', 'O_12']));
    updateUnits(ordinary, 1);
    updateUnits(protectedState, 1);
    expect(ordinary.units[0].temp).toBe(protectedState.units[0].temp);
    expect(100 - protectedState.units[0].hp).toBeCloseTo((100 - ordinary.units[0].hp) * 0.5);
  });

  it('state education makes its progressive gain once, without per-tick stacking', () => {
    const s = world(),
      u = s.units[0];
    s.laws.push(law(['S_01', 'V_05', 'O_09', 'M_02', 'C_03', 'O_12'], 12));
    updateUnits(s, 0);
    expect(u.intelligence).toBe(7);
    updateUnits(s, 0);
    expect(u.intelligence).toBe(7);
  });

  it('a legal delivery duty is fulfilled by arrival, not by assigning an order or lifting goods', () => {
    const s = world(),
      u = s.units[0],
      duty = law(['S_02', 'V_04', 'O_01', 'C_02', 'C_03', 'O_10']);
    s.entities.push({ id: 'wood', kind: 'tree', ...HOME, amount: 10, hp: 100, maxHp: 100 });
    Object.assign(u, { action: 'gathering', targetId: 'wood', command: ['S_02', 'V_04', 'O_03'] });
    expect(seasonalDutyFulfilled(s, duty, u)).toBe(false);
    processWork(s, u, 2);
    expect(seasonalDutyFulfilled(s, duty, u)).toBe(false);
    processWork(s, u, 1);
    expect(seasonalDutyFulfilled(s, duty, u)).toBe(true);
    expect(s.resources.wood).toBe(1);
  });
});
