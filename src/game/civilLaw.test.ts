import { describe, expect, it, vi } from 'vitest';
import { BUILDING_SPECS, emptyInventory, HOME, WORD_ORDER } from './content';
import { applyCivilAssault, updateCivilConflicts } from './civilLaw';
import { createGame, issueCommand, tick } from './engine';
import { civilStrike, killUnit, simulationStep } from './simulation';
import type { Dogma, GameState, Law } from './types';

function world(): GameState {
  const s = createGame(1);
  s.started = true;
  s.time = 10;
  s.entities = [];
  s.cities = [];
  s.factions = [];
  s.units = s.units.slice(0, 3);
  for (const u of s.units)
    Object.assign(u, {
      ...HOME,
      factionId: 'player',
      hp: 100,
      strength: 5,
      intelligence: 5,
      hunger: 20,
      age: 6,
      temp: 100,
      caste: 'citizen',
      action: 'idle',
      progress: 0,
    });
  s.cohesion = 50;
  s.resources = emptyInventory();
  return s;
}

function enact(s: GameState, kind: 'murder' | 'retaliation') {
  const tokens =
    kind === 'murder'
      ? ['S_02', 'V_03', 'S_01', 'M_01', 'C_03', 'O_06']
      : ['S_02', 'V_03', 'S_02', 'M_01', 'C_03', 'V_03'];
  const law: Law = {
    id: kind,
    name: kind,
    tokens,
    subjectId: tokens[0],
    verbId: tokens[1],
    objectId: tokens[2],
    modifierId: tokens[3],
    sanctionId: tokens[5],
    prohibitive: true,
    age: 0,
  };
  s.laws.push(law);
  if (!s.buildings.some((b) => b.kind === 'court'))
    s.buildings.push({
      id: 'court',
      kind: 'court',
      ...HOME,
      hp: BUILDING_SPECS.court.maxHp,
      active: true,
      completed: true,
      workerIds: [],
    });
}

function doctrine(s: GameState, targetId: string, vectorId: string) {
  const dogma: Dogma = {
    id: `${targetId}:${vectorId}`,
    targetId,
    vectorId,
    name: 'Test',
    age: 0,
    weight: 10,
    description: 'Test',
  };
  s.dogmas.push(dogma);
}

function crisis(s: GameState) {
  s.inequality = 60;
  s.cohesion = 25;
  for (const u of s.units) u.hunger = 80;
  s.resources.food = 1;
}

describe('civil wounds and post-damage justice', () => {
  it('applies the exact actual wound to its attacker and adds ten cohesion', () => {
    const s = world(),
      [attacker, victim] = s.units;
    enact(s, 'retaliation');
    attacker.command = ['S_02', 'V_03', 'S_02'];
    attacker.targetId = victim.id;
    const actual = applyCivilAssault(s, attacker, victim, 17, killUnit);
    expect(actual).toBe(17);
    expect(victim.hp).toBe(83);
    expect(attacker.hp).toBe(83);
    expect(attacker.command).toBeUndefined();
    expect(s.cohesion).toBe(60);
    expect(attacker.lastEventAt?.CIVIL_AGGRESSOR_UNTIL).toBe(40);
    expect(s.stats.deaths).toBe(0);
  });

  it('caps overkill to the victim’s remaining HP rather than a fixed sanction', () => {
    const s = world(),
      [attacker, victim] = s.units;
    enact(s, 'retaliation');
    victim.hp = 10;
    expect(applyCivilAssault(s, attacker, victim, 40, killUnit)).toBe(10);
    expect(attacker.hp).toBe(90);
    expect(victim.action).toBe('dead');
    expect(s.stats.deaths).toBe(1);
    expect(s.entities.filter((e) => e.kind === 'corpse')).toHaveLength(1);
    expect(Object.keys(s.eventTimes).some((k) => k.startsWith('civil-feud:'))).toBe(false);
  });

  it('requires a living, active, completed owned court', () => {
    const s = world(),
      [attacker, victim] = s.units;
    enact(s, 'retaliation');
    s.buildings[0].completed = false;
    applyCivilAssault(s, attacker, victim, 17, killUnit);
    expect(victim.hp).toBe(83);
    expect(attacker.hp).toBe(100);
    expect(s.cohesion).toBe(50);
  });

  it('executes only after a real death and updates bodies, custodians and urban cohorts once', () => {
    const s = world(),
      [attacker, victim, witness] = s.units;
    enact(s, 'murder');
    s.urbanized = true;
    s.cities.push({
      id: 'capital',
      name: 'Capital',
      ...HOME,
      sectorX: 2,
      sectorY: 2,
      factionId: 'player',
      cohorts: { workers: 3, warriors: 0, sages: 0, slaves: 0 },
      resources: s.resources,
      words: [],
      dogmas: [],
      revoltTension: 0,
      housing: 3,
      buildingIds: ['court'],
      vocations: [],
      loyalty: 100,
      assimilation: { delegateCount: 0, active: false },
      production: emptyInventory(),
      capital: true,
      garrisonHp: 0,
    });
    for (const u of s.units) u.cityId = 'capital';
    s.words.O_03 = { retention: 80, custodians: [attacker.id, victim.id], uses: 0 };
    s.words.O_02 = { retention: 80, custodians: [attacker.id, witness.id], uses: 0 };
    applyCivilAssault(s, attacker, victim, 10, killUnit);
    expect(attacker.hp).toBe(100);
    expect(s.stats.deaths).toBe(0);
    victim.hp = 5;
    expect(applyCivilAssault(s, attacker, victim, 30, killUnit)).toBe(5);
    expect(attacker.action).toBe('dead');
    expect(victim.action).toBe('dead');
    expect(s.stats.deaths).toBe(2);
    expect(s.entities.filter((e) => e.kind === 'corpse')).toHaveLength(2);
    expect(s.cities[0].cohorts.workers).toBe(1);
    expect(s.words.O_03.retention).toBe(0);
    expect(s.words.O_03.custodians).toEqual([]);
    expect(s.words.O_02.retention).toBe(40);
    expect(s.words.O_02.custodians).toEqual([witness.id]);
    expect(Object.keys(s.eventTimes).some((k) => k.startsWith('civil-feud:'))).toBe(false);
    applyCivilAssault(s, attacker, victim, 30, killUnit);
    expect(s.stats.deaths).toBe(2);
  });

  it('feeds a fatal retaliatory sentence through the same death pipeline', () => {
    const s = world(),
      [attacker, victim] = s.units;
    enact(s, 'retaliation');
    attacker.hp = 8;
    s.words.O_03 = { retention: 75, custodians: [attacker.id], uses: 0 };
    applyCivilAssault(s, attacker, victim, 12, killUnit);
    expect(victim.hp).toBe(88);
    expect(attacker.action).toBe('dead');
    expect(s.stats.deaths).toBe(1);
    expect(s.words.O_03.retention).toBe(0);
    expect(s.entities.filter((e) => e.kind === 'corpse')).toHaveLength(1);
  });

  it('gives protective doctrine and sanctuary priority over an assault or a sentence', () => {
    const s = world(),
      [attacker, victim] = s.units;
    enact(s, 'retaliation');
    doctrine(s, 'S_02', 'O_01');
    expect(applyCivilAssault(s, attacker, victim, 12, killUnit)).toBe(0);
    expect(victim.hp).toBe(100);
    expect(s.cohesion).toBe(50);
    s.dogmas = [];
    attacker.strength = 8;
    doctrine(s, 'S_03', 'V_05');
    expect(applyCivilAssault(s, attacker, victim, 12, killUnit)).toBe(12);
    expect(victim.hp).toBe(88);
    expect(attacker.hp).toBe(100);
    expect(s.cohesion).toBe(60);
  });

  it('blocks an initial pacifist blow but permits defence against an actual aggressor', () => {
    const s = world(),
      [attacker, victim] = s.units;
    doctrine(s, 'V_03', 'M_01');
    expect(applyCivilAssault(s, attacker, victim, 12, killUnit)).toBe(0);
    victim.lastEventAt = { CIVIL_AGGRESSOR_UNTIL: s.time + 30 };
    expect(applyCivilAssault(s, attacker, victim, 12, killUnit)).toBe(12);
    expect(victim.hp).toBe(88);
  });

  it('resolves a public friendly attack after physical damage, with no preventive40HP sanction', () => {
    let s = world();
    s.tier = 5;
    for (const id of WORD_ORDER)
      s.words[id] = {
        retention: 100,
        custodians: [s.units[2].id],
        uses: 0,
      };
    enact(s, 'retaliation');
    const [attacker, victim] = s.units;
    s = issueCommand(
      s,
      ['S_02', 'V_03', 'S_02'],
      {
        type: 'unit',
        id: victim.id,
        x: victim.x,
        y: victim.y,
      },
      attacker.id,
    );
    expect(s.stats.commands).toBe(1);
    expect(s.voice).toBe(2);
    expect(s.units[0].hp).toBe(100);
    expect(s.units[1].hp).toBe(100);
    s = tick(s, 1);
    expect(s.units[1].hp).toBe(92.5);
    expect(s.units[0].hp).toBe(92.5);
    expect(s.cohesion).toBe(55);
    expect(s.units[0].command).toBeUndefined();
  });
});

describe('scarcity quarrels and interrupted blood feuds', () => {
  it('uses real hungry adults, food and combat once per90seconds without creating population or resources', () => {
    const s = world();
    crisis(s);
    const resources = structuredClone(s.resources),
      words = structuredClone(s.words),
      population = s.units.length;
    const strike = vi.fn(civilStrike);
    updateCivilConflicts(s, 0.25, strike);
    expect(strike).toHaveBeenCalledOnce();
    expect(s.units.some((u) => u.hp < 100)).toBe(true);
    expect(s.resources).toEqual(resources);
    expect(s.words).toEqual(words);
    expect(s.units).toHaveLength(population);
    const seed = s.seed;
    s.time += 89;
    updateCivilConflicts(s, 0.25, strike);
    expect(strike).toHaveBeenCalledOnce();
    expect(s.seed).toBe(seed);
    s.time += 1;
    updateCivilConflicts(s, 0.25, strike);
    expect(strike).toHaveBeenCalledTimes(2);
  });

  it.each(['comfortable', 'equal', 'plentiful', 'distant', 'children', 'pacifist'])(
    'does not roll or invent a quarrel when the community is %s',
    (reason) => {
      const s = world();
      crisis(s);
      if (reason === 'comfortable') s.cohesion = 31;
      if (reason === 'equal') s.inequality = 49;
      if (reason === 'plentiful') {
        s.resources.food = 20;
        s.entities.push({ id: 'last-berry', kind: 'berries', ...HOME, amount: 1, hp: 1, maxHp: 1 });
      }
      if (reason === 'distant') for (const u of s.units.slice(1)) u.x += 10;
      if (reason === 'children') for (const u of s.units) u.age = 3;
      if (reason === 'pacifist') doctrine(s, 'V_03', 'M_01');
      const seed = s.seed,
        strike = vi.fn(() => 0);
      updateCivilConflicts(s, 0.25, strike);
      expect(strike).not.toHaveBeenCalled();
      expect(s.seed).toBe(seed);
    },
  );

  it('integrates a scarcity episode before hunger consumes its final real ration', () => {
    const s = world();
    crisis(s);
    simulationStep(s, 0.25);
    expect(s.eventTimes['civil-last-episode']).toBe(s.time);
    expect(s.units.some((u) => u.hp < 100)).toBe(true);
  });

  it('lets a real nearby witness answer an unjudged murder after30seconds', () => {
    const s = world(),
      [attacker, victim, witness] = s.units;
    victim.hp = 1;
    applyCivilAssault(s, attacker, victim, 5, killUnit);
    const strike = vi.fn(civilStrike);
    updateCivilConflicts(s, 0.25, strike);
    expect(strike).not.toHaveBeenCalled();
    s.time += 30;
    updateCivilConflicts(s, 0.25, strike);
    expect(strike).toHaveBeenCalledOnce();
    expect(strike).toHaveBeenCalledWith(s, witness, attacker);
    expect(attacker.hp).toBeLessThan(100);
    updateCivilConflicts(s, 0.25, strike);
    expect(strike).toHaveBeenCalledOnce();
  });

  it('stops a pending revenge when murder law becomes effective', () => {
    const s = world(),
      [attacker, victim] = s.units;
    victim.hp = 1;
    applyCivilAssault(s, attacker, victim, 5, killUnit);
    enact(s, 'murder');
    s.time += 30;
    const strike = vi.fn(() => 0);
    updateCivilConflicts(s, 0.25, strike);
    expect(strike).not.toHaveBeenCalled();
    expect(Object.keys(s.eventTimes).some((k) => k.startsWith('civil-feud:'))).toBe(false);
  });
});
