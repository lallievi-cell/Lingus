import { describe, expect, it } from 'vitest';
import { HOME } from './content';
import { applyCivilAssault } from './civilLaw';
import {
  createGame,
  createReadyBuilding,
  issueCommand,
  parseGame,
  serializeGame,
  tick,
} from './engine';
import { updateImperial } from './imperial';
import { killUnit, processWork, updateAnimals, updateUnits } from './simulation';
import type { GameState, Unit } from './types';

function world() {
  const s = createGame(6842);
  Object.assign(s, { started: true, tier: 2, time: 10, entities: [], cities: [], factions: [] });
  s.units = s.units.slice(0, 1);
  Object.assign(s.units[0], {
    ...HOME,
    hp: 32,
    hunger: 40,
    temp: 100,
    age: 6,
    action: 'idle',
    progress: 0,
  });
  for (const id of ['S_02', 'M_01', 'V_07', 'O_05', 'O_04', 'V_09']) {
    s.words[id] = { retention: 100, custodians: [s.units[0].id], uses: 0 };
    s.units[0].knows.push(id);
  }
  createReadyBuilding(s, 'campfire');
  Object.assign(s.resources, { meat: 2, wood: 20 });
  return s;
}
function companion(s: GameState, x: number, id = 'observer') {
  const u = structuredClone(s.units[0]);
  Object.assign(u, { id, name: id, x, hp: 100, pendingCombatDamage: false, eventMemory: [] });
  s.units.push(u);
  return u;
}
function wolf(s: GameState, at = s.units[0]) {
  const e = { id: 'wolf', kind: 'wolf' as const, x: at.x, y: at.y, hp: 100, maxHp: 100, amount: 1 };
  s.entities.push(e);
  return e;
}
function cook(s: GameState) {
  return issueCommand(s, ['S_02', 'V_07', 'O_05', 'O_04'], undefined, s.units[0].id);
}
function moveAway(s: GameState) {
  return issueCommand(
    s,
    ['S_02', 'V_01'],
    { type: 'point', x: HOME.x + 80, y: HOME.y },
    s.units[0].id,
  );
}
function advance(s: GameState, seconds: number) {
  for (let remaining = seconds; remaining > 1e-8; ) {
    const step = Math.min(1, remaining);
    s = tick(s, step);
    remaining -= step;
  }
  return s;
}
const dangerEvents = (u: Unit) => u.eventMemory?.filter((e) => e.tag === 'ENV_ALLY_DAMAGED') ?? [];

describe('the GDD combat interrupt requires a new hostile wound', () => {
  it('lets a wounded survivor finish a paid cooking order after the danger is over', () => {
    let s = world();
    Object.assign(s.units[0], { hp: 24, lastDamageCause: 'V_03' });
    s = cook(s);
    expect(s.resources.meat).toBe(1);
    expect(s.units[0].action).toBe('cooking');
    s = advance(s, 5);
    expect(s.resources.cooked).toBe(1);
    expect(s.units[0].action).toBe('idle');
  });

  it('interrupts a new order once after a real wolf wound, then permits orders after reaching home', () => {
    let s = world();
    s.time = 65;
    s.units[0].x += 40;
    wolf(s);
    updateAnimals(s, 0.25);
    expect(s.units[0].hp).toBe(30);
    expect(s.units[0].pendingCombatDamage).toBe(true);
    s.entities = [];
    s = moveAway(s);
    s = advance(s, 0.25);
    expect(s.units[0].action).toBe('fleeing');
    expect(s.units[0].command).toBeUndefined();
    expect(s.units[0].pendingCombatDamage).toBe(false);
    s = advance(s, 9);
    expect(Math.hypot(s.units[0].x - HOME.x, s.units[0].y - HOME.y)).toBeLessThanOrEqual(10);
    expect(s.units[0].action).not.toBe('fleeing');
    s = cook(s);
    s = advance(s, 5);
    expect(s.resources.cooked).toBe(1);
  });

  it('does not let home healing in the same update erase the actual thirty-HP wound', () => {
    let s = world();
    s.time = 65;
    Object.assign(s.units[0], { x: HOME.x + 8, hunger: 0 });
    wolf(s);
    updateAnimals(s, 0.25);
    expect(s.units[0].hp).toBe(30);
    s.entities = [];
    s = advance(s, 0.25);
    expect(s.units[0].hp).toBeGreaterThan(30);
    expect(s.units[0].action).toBe('fleeing');
    expect(s.units[0].x).toBeLessThan(HOME.x + 8);
  });

  it('allows each new wound to interrupt again without creating an immunity or a cooldown', () => {
    let s = world();
    s.time = 65;
    s.units[0].x += 40;
    wolf(s);
    updateAnimals(s, 0.25);
    updateUnits(s, 0.25);
    expect(s.units[0].pendingCombatDamage).toBe(false);
    s = moveAway(s);
    updateAnimals(s, 0.25);
    expect(s.units[0].pendingCombatDamage).toBe(true);
    updateUnits(s, 0.25);
    expect(s.units[0].action).toBe('fleeing');
    expect(s.units[0].command).toBeUndefined();
  });

  it.each(['unknown-danger', 'hunger', 'cold', 'martial', 'night-taboo'] as const)(
    'consumes a wound once even when %s has priority or prevents flight',
    (condition) => {
      let s = world();
      const u = s.units[0];
      Object.assign(u, { x: HOME.x + 30, hp: 25, pendingCombatDamage: true });
      if (condition === 'unknown-danger') delete s.words.M_01;
      if (condition === 'hunger') {
        u.hunger = 96;
        s.resources.meat = 0;
      }
      if (condition === 'cold') u.temp = 10;
      if (condition === 'martial')
        s.laws.push({
          id: 'martial',
          name: 'Legge marziale',
          tokens: ['S_01', 'V_01', 'S_08', 'M_01', 'C_03', 'O_06'],
          subjectId: 'S_01',
          verbId: 'V_01',
          objectId: 'S_08',
          modifierId: 'M_01',
          sanctionId: 'O_06',
          prohibitive: true,
          age: 0,
        });
      if (condition === 'night-taboo') {
        s.time = 65;
        s.dogmas.push({
          id: 'night',
          name: 'Tabù notte',
          targetId: 'C_01',
          vectorId: 'M_01',
          description: 'Riposo obbligatorio',
          age: 0,
          weight: 10,
        });
      }
      updateUnits(s, 0.25);
      expect(u.action).not.toBe('fleeing');
      expect(u.pendingCombatDamage).toBe(false);
      Object.assign(u, { hunger: 40, temp: 100 });
      s.time = 10;
      s.words.M_01 = { retention: 100, custodians: [u.id], uses: 0 };
      s.laws = [];
      s.dogmas = [];
      const before = u.x;
      s = advance(moveAway(s), 0.25);
      expect(s.units[0].x).toBeGreaterThan(before);
      expect(s.units[0].action).toBe('moving');
    },
  );

  it('suspends a real building assignment during flight and resumes it after arriving home', () => {
    let s = world();
    const farm = createReadyBuilding(s, 'farm');
    farm.x += 40;
    s.units[0].x = farm.x;
    s = issueCommand(
      s,
      ['S_02', 'V_09', 'O_04'],
      { type: 'building', id: farm.id, x: farm.x, y: farm.y },
      s.units[0].id,
    );
    const e = wolf(s);
    // Hunting retaliation is a real animal wound even during the daytime.
    const attacker = s.units[0];
    attacker.action = 'hunting';
    attacker.targetId = e.id;
    processWork(s, attacker, 1);
    attacker.action = 'working';
    s.entities = [];
    s = advance(s, 0.25);
    expect(s.units[0].suspendedJob?.buildingId).toBe(farm.id);
    expect(s.buildings.find((b) => b.id === farm.id)?.workerIds).toEqual([]);
    s = advance(s, 10);
    expect(s.units[0].jobBuildingId).toBe(farm.id);
    expect(s.units[0].suspendedJob).toBeUndefined();
  });

  it('records real animal retaliation and foreign retaliation as fresh combat wounds', () => {
    for (const kind of ['animal', 'foreign'] as const) {
      const s = world(),
        u = s.units[0];
      u.x += 40;
      Object.assign(u, { action: 'hunting', command: ['S_02', 'V_03', 'O_04'], progress: 0 });
      if (kind === 'animal') u.targetId = wolf(s).id;
      else {
        const enemy = companion(s, u.x, 'foreign');
        enemy.factionId = 'enemy';
        u.targetId = enemy.id;
      }
      processWork(s, u, 1);
      expect(u.hp, kind).toBeLessThan(30);
      expect(u.pendingCombatDamage, kind).toBe(true);
      updateUnits(s, 0.25);
      expect(u.action, kind).toBe('fleeing');
    }
  });

  it('records a civil aggressor’s actual wound but excludes a reflected legal penalty', () => {
    const s = world(),
      attacker = s.units[0],
      victim = companion(s, HOME.x + 40, 'victim');
    attacker.hp = 32;
    victim.hp = 32;
    createReadyBuilding(s, 'court');
    s.laws.push({
      id: 'retaliation',
      name: 'Taglione',
      tokens: ['S_02', 'V_03', 'S_02', 'M_01', 'C_03', 'V_03'],
      subjectId: 'S_02',
      verbId: 'V_03',
      objectId: 'S_02',
      modifierId: 'M_01',
      sanctionId: 'V_03',
      prohibitive: true,
      age: 0,
    });
    expect(applyCivilAssault(s, attacker, victim, 5, killUnit)).toBe(5);
    expect(victim.pendingCombatDamage).toBe(true);
    expect(attacker.hp).toBe(27);
    expect(attacker.pendingCombatDamage).not.toBe(true);
    updateUnits(s, 0.25);
    expect(victim.action).toBe('fleeing');
  });

  it('marks a real frontline wound caused by an enemy battalion', () => {
    const s = world(),
      u = s.units[0];
    s.factions.push({
      id: 'enemy',
      name: 'Nemici',
      cityId: '',
      words: [],
      dogmas: [],
      relation: -100,
      hostile: true,
    });
    Object.assign(u, { x: HOME.x + 40, action: 'frontline', targetId: 'own' });
    s.dogmas.push({
      id: 'war',
      name: 'Valhalla',
      targetId: 'V_03',
      vectorId: 'O_06',
      description: 'Saggi in prima linea',
      age: 0,
      weight: 10,
    });
    for (const [id, factionId] of [
      ['own', 'player'],
      ['enemy', 'enemy'],
    ])
      s.battalions.push({
        id,
        name: id,
        factionId,
        cityId: '',
        x: u.x,
        y: u.y,
        hp: 100,
        maxHp: 100,
        morale: 1,
        action: id === 'own' ? 'attacking' : 'idle',
        catapult: false,
        occupation: 0,
        frontlineSageIds: id === 'own' ? [u.id] : [],
      });
    updateImperial(s, 0.25);
    expect(u.hp).toBeLessThan(32);
    expect(u.pendingCombatDamage).toBe(true);
  });

  it('does not create a new wound from zero elapsed damage or a blocked attack', () => {
    const s = world();
    s.time = 65;
    wolf(s);
    updateAnimals(s, 0);
    expect(s.units[0].pendingCombatDamage).not.toBe(true);
    createReadyBuilding(s, 'palisade');
    updateAnimals(s, 0.25);
    expect(s.units[0].hp).toBe(32);
    expect(s.units[0].pendingCombatDamage).not.toBe(true);
  });

  it('preserves and validates the optional pending wound in a save', () => {
    const s = world();
    s.units[0].pendingCombatDamage = true;
    const loaded = parseGame(serializeGame(s));
    expect(loaded?.units[0].pendingCombatDamage).toBe(true);
    delete s.units[0].pendingCombatDamage;
    expect(parseGame(serializeGame(s))).not.toBeNull();
    const invalid = JSON.parse(serializeGame(s));
    invalid.units[0].pendingCombatDamage = 'true';
    expect(parseGame(JSON.stringify(invalid))).toBeNull();
  });
});

describe('danger is observed from a new animal wound', () => {
  it('notifies actual nearby allies, excluding the victim and distant people, once per new wound', () => {
    const s = world(),
      victim = s.units[0];
    s.time = 65;
    victim.x += 40;
    const near = companion(s, victim.x + 10),
      far = companion(s, victim.x + 21, 'far');
    wolf(s);
    updateAnimals(s, 0.25);
    expect(dangerEvents(victim)).toHaveLength(0);
    expect(dangerEvents(near)).toHaveLength(1);
    expect(dangerEvents(far)).toHaveLength(0);
    const first = dangerEvents(near)[0];
    expect(first.weight).toBe(60);
    s.entities = [];
    for (let i = 0; i < 4; i++) {
      s.time++;
      updateUnits(s, 1);
    }
    expect(dangerEvents(near)).toEqual([first]);
  });

  it('does not turn a historic wound or a foreign/civil blow into a new predator observation', () => {
    const s = world(),
      victim = s.units[0],
      observer = companion(s, HOME.x + 5);
    Object.assign(victim, { hp: 24, lastDamageCause: 'V_03' });
    updateUnits(s, 1);
    expect(dangerEvents(observer)).toHaveLength(0);
    applyCivilAssault(s, observer, victim, 1, killUnit);
    updateUnits(s, 1);
    expect(dangerEvents(observer)).toHaveLength(0);
    const enemy = companion(s, victim.x, 'enemy');
    enemy.factionId = 'enemy';
    Object.assign(victim, {
      action: 'combat',
      targetId: enemy.id,
      command: ['S_02', 'V_03', 'O_04'],
      progress: 0,
    });
    processWork(s, victim, 1);
    expect(dangerEvents(observer)).toHaveLength(0);
  });

  it('keeps the existing one-second observation throttle for repeated real animal wounds', () => {
    const s = world();
    s.time = 65;
    s.units[0].x += 40;
    const observer = companion(s, s.units[0].x + 10);
    wolf(s);
    updateAnimals(s, 0.25);
    s.time += 0.25;
    updateAnimals(s, 0.25);
    expect(dangerEvents(observer)).toHaveLength(1);
    s.time = 66;
    updateAnimals(s, 0.25);
    expect(dangerEvents(observer)).toHaveLength(2);
  });

  it('also lets nearby allies witness a fatal animal wound', () => {
    const s = world();
    s.time = 65;
    s.units[0].x += 40;
    const observer = companion(s, s.units[0].x + 10);
    s.units[0].hp = 31;
    wolf(s);
    updateAnimals(s, 4);
    expect(s.units[0].hp).toBe(0);
    expect(dangerEvents(observer)).toHaveLength(1);
    expect(dangerEvents(s.units[0])).toHaveLength(0);
  });
});
