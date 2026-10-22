import { describe, expect, it } from 'vitest';
import { ELDER_AGE, WORD_ORDER } from './content';
import { getDogmaEffects } from './dogmas';
import { createGame, issueCommand, parseGame, teachWord } from './engine';
import { compileSentence } from './grammar';
import { consume, finishSeasonMemory, foodAccessRank, resetUnit, updateUnits } from './simulation';
import type { Dogma, GameState, Unit } from './types';

function world() {
  const s = createGame(6842);
  s.started = true;
  s.paused = false;
  s.tier = 2;
  s.entities = [];
  s.units = s.units.slice(0, 3);
  s.units.forEach((u) =>
    Object.assign(u, {
      ...s.home,
      age: 6,
      hp: 100,
      hunger: 70,
      temp: 100,
      strength: 5,
      intelligence: 5,
      action: 'idle',
      caste: 'citizen',
      factionId: 'player',
      command: undefined,
    }),
  );
  for (const id of WORD_ORDER)
    s.words[id] = { retention: 100, custodians: [s.units[0].id], uses: 0 };
  return s;
}
function doctrine(s: GameState, vectorId = 'M_04') {
  const d: Dogma = {
    id: 'gerontocracy',
    targetId: 'S_04',
    vectorId,
    name: 'Gerontocrazia',
    description: '',
    weight: 10,
    age: 0,
  };
  s.dogmas.push(d);
  return d;
}
function fire(s: GameState) {
  s.buildings.push({
    id: 'fire',
    kind: 'campfire',
    ...s.home,
    hp: 100,
    active: true,
    workerIds: [],
  });
}
function priority(s: GameState, subject = 'S_03', selected?: Unit) {
  return issueCommand(s, [subject, 'V_02', 'O_04', 'M_04'], undefined, selected?.id, {
    type: 'point',
    ...s.home,
  });
}

describe('gerontocracy follows its historical archetype and era', () => {
  it('accepts the exact historical three-word phrase and stores the canonical property doctrine', () => {
    const s = world();
    s.units[0].intelligence = 8;
    s.buildings.push({ id: 'menhir', kind: 'menhir', ...s.home, hp: 500, active: true });
    expect(compileSentence(s, ['S_04', 'C_02', 'M_04']).kind).toBe('dogma');
    const n = issueCommand(s, ['S_04', 'C_02', 'M_04']);
    expect(n.dogmas.map((d) => [d.targetId, d.vectorId])).toEqual([['S_04', 'M_04']]);
    expect(getDogmaEffects(n).elderFoodPrivilege).toBe(true);
  });
  it('still requires Sacro and a living menhir for the historical phrase', () => {
    const s = world();
    expect(issueCommand(s, ['S_04', 'C_02', 'M_04']).dogmas).toHaveLength(0);
    s.buildings.push({ id: 'menhir', kind: 'menhir', ...s.home, hp: 500, active: true });
    delete s.words.M_03;
    expect(issueCommand(s, ['S_04', 'C_02', 'M_04']).dogmas).toHaveLength(0);
  });
  it('checks conflict before any cost or trauma healing', () => {
    const s = world();
    doctrine(s, 'S_01');
    s.cohesion = 40;
    s.recentTrauma = { tag: 'hurt', time: 0 };
    s.buildings.push({ id: 'menhir', kind: 'menhir', ...s.home, hp: 500, active: true });
    const n = issueCommand(s, ['S_04', 'C_02', 'M_04']);
    expect(n.dogmas).toEqual(s.dogmas);
    expect(n.cohesion).toBe(40);
    expect(n.recentTrauma).toEqual(s.recentTrauma);
  });
  it('does not conflate ordinary veneration of sages with gerontocracy', () => {
    const s = world();
    doctrine(s, 'C_02');
    expect(getDogmaEffects(s).gamma).toBe(3);
    expect(getDogmaEffects(s).teaching).toBe(1);
    expect(getDogmaEffects(s).elderFoodPrivilege).toBe(false);
  });
  it('preserves ordinary oral decay before Bronze and uses gamma0.5 in the oligarchy', () => {
    const s = world();
    doctrine(s);
    s.words.O_05.retention = 80;
    const complexity = 6;
    expect(getDogmaEffects(s).gamma).toBe(3);
    finishSeasonMemory(s);
    expect(s.words.O_05.retention).toBe(80 - 3 * complexity);
    s.tier = 4;
    s.words.O_05.retention = 80;
    expect(getDogmaEffects(s).gamma).toBe(0.5);
    finishSeasonMemory(s);
    expect(s.words.O_05.retention).toBe(80 - 0.5 * complexity);
    expect(getDogmaEffects(s).warriorRebellionThreshold).toBe(70);
  });
  it('pays the same ten Attention for a25percent stronger lesson, without a second seasonal credit', () => {
    const s = world();
    doctrine(s);
    fire(s);
    s.attention = 20;
    s.words.O_05.retention = 50;
    const n = teachWord(s, 'O_05');
    expect(n.attention).toBe(10);
    expect(n.words.O_05.retention).toBe(62.5);
    expect(n.words.O_05.custodians).toHaveLength(2);
    expect(n.stats.taught).toBe(1);
    finishSeasonMemory(n);
    expect(n.words.O_05.retention).toBe(44.5);
    expect(n.logs.some((l) => l.text.includes('12.5 memoria'))).toBe(true);
  });
  it('feeds the elder before an earlier-array adult when only one ration exists', () => {
    const s = world();
    doctrine(s);
    s.resources.food = 1;
    s.units = s.units.slice(0, 2);
    const [adult, elder] = s.units;
    elder.age = ELDER_AGE;
    adult.hunger = 70;
    elder.hunger = 70;
    updateUnits(s, 0.25);
    expect(elder.hunger).toBeLessThan(60);
    expect(adult.hunger).toBeGreaterThan(70);
    expect(s.resources.food).toBe(0);
  });
  it('prevents only elder famine damage, including condensed citizens, and still allows disease damage', () => {
    const s = world();
    doctrine(s);
    s.units = s.units.slice(0, 2);
    const [adult, elder] = s.units;
    elder.age = ELDER_AGE;
    adult.hunger = elder.hunger = 100;
    updateUnits(s, 1);
    expect(adult.hp).toBe(98);
    expect(elder.hp).toBe(100);
    elder.plagueUntil = s.time + 60;
    updateUnits(s, 1);
    expect(elder.hp).toBe(98.5);
    s.urbanized = true;
    s.cities[0].factionId = 'player';
    s.cities[0].resources.food = 0;
    s.cities[0].resources.meat = 0;
    s.cities[0].resources.cooked = 0;
    elder.cityId = s.cities[0].id;
    elder.plagueUntil = undefined;
    elder.hp = 100;
    updateUnits(s, 1);
    expect(elder.hp).toBe(100);
  });
});

describe('persistent food privileges reserve real shared stocks', () => {
  it('reserves the last ration for the strong caste rather than whichever citizen is processed first', () => {
    const s = world();
    s.units[1].strength = 8;
    const n = priority(s);
    n.resources.food = 1;
    n.units.forEach(resetUnit);
    const ordinary = n.units[0],
      strong = n.units[1];
    expect(n.foodPriority).toEqual({ subjectId: 'S_03', unitId: undefined });
    expect(consume(n, ordinary)).toBe(false);
    expect(n.resources.food).toBe(1);
    updateUnits(n, 0.25);
    expect(strong.hunger).toBeLessThan(60);
    expect(ordinary.hunger).toBeGreaterThan(70);
    expect(n.resources.food).toBe(0);
  });
  it('retains the same privilege when Sempre registers the food phrase, and rejects a failed registration cleanly', () => {
    const s = world();
    s.tier = 3;
    s.units[1].strength = 8;
    const phrase = ['C_02', 'S_03', 'V_02', 'O_04', 'M_04'];
    const n = issueCommand(s, phrase);
    expect(n.traditions).toHaveLength(1);
    expect(n.foodPriority?.subjectId).toBe('S_03');
    n.resources.food = 1;
    expect(consume(n, n.units[0])).toBe(false);
    const failed = structuredClone(s);
    failed.traditions = Array.from({ length: 3 }, (_, i) => ({
      id: `existing-${i}`,
      tokens: ['C_02', 'S_01', 'V_01'],
      createdAt: 0,
    }));
    const rejected = issueCommand(failed, phrase);
    expect(rejected.traditions).toHaveLength(3);
    expect(rejected.foodPriority).toBeUndefined();
  });
  it('keeps legacy own residents without an explicit faction in the ordinary needs simulation', () => {
    const s = world();
    s.units = s.units.slice(0, 1);
    delete s.units[0].factionId;
    s.units[0].hunger = 20;
    updateUnits(s, 1);
    expect(s.units[0].hunger).toBeCloseTo(20.8);
    expect(s.units[0].factionId).toBe('player');
  });
  it('preserves the privilege after another order and across JSON import', () => {
    const s = world();
    s.units[1].strength = 8;
    const n = priority(s),
      m = issueCommand(n, ['S_01', 'V_01'], { type: 'point', x: s.home.x + 2, y: s.home.y });
    const imported = parseGame(JSON.stringify(m));
    expect(imported).not.toBeNull();
    expect(imported!.foodPriority?.subjectId).toBe('S_03');
    expect(foodAccessRank(imported!, imported!.units[1])).toBe(1);
  });
  it('applies Io to the selected person and replaces it only with another privilege command', () => {
    const s = world();
    const n = priority(s, 'S_02', s.units[1]);
    expect(foodAccessRank(n, n.units[0])).toBe(0);
    expect(foodAccessRank(n, n.units[1])).toBe(1);
    n.voice = 3;
    n.units[2].caste = 'slave';
    const m = priority(n, 'S_06');
    expect(foodAccessRank(m, m.units[1])).toBe(0);
    expect(foodAccessRank(m, m.units[2])).toBe(1);
  });
  it('matches sages, slaves and king using their actual selectors instead of a generic unit flag', () => {
    const s = world();
    s.units[1].intelligence = 8;
    s.kingId = s.units[2].id;
    s.units[2].caste = 'slave';
    for (const [subject, index] of [
      ['S_04', 1],
      ['S_06', 2],
      ['S_07', 2],
    ] as const) {
      const n = priority(s, subject);
      expect(foodAccessRank(n, n.units[index])).toBe(1);
      expect(foodAccessRank(n, n.units[0])).toBe(0);
    }
  });
  it('does not reserve stocks for a privileged person who is distant, sated or in another city', () => {
    const s = world();
    s.units[1].strength = 8;
    const n = priority(s);
    n.resources.food = 3;
    n.units.forEach(resetUnit);
    n.units[1].x += 20;
    expect(consume(n, n.units[0])).toBe(true);
    Object.assign(n.units[1], { ...n.home, hunger: 20 });
    expect(consume(n, n.units[0])).toBe(true);
    n.urbanized = true;
    n.cities[0].factionId = 'player';
    n.units[1].cityId = n.cities[0].id;
    n.units[1].hunger = 70;
    expect(consume(n, n.units[0])).toBe(true);
    expect(n.resources.food).toBe(0);
  });
  it('does not reserve a city ration for a privileged scholar in a distant frontline', () => {
    const s = world();
    s.units[1].intelligence = 8;
    const n = priority(s, 'S_04');
    n.urbanized = true;
    const city = n.cities[0];
    city.factionId = 'player';
    city.x = n.home.x;
    city.y = n.home.y;
    city.resources.food = 1;
    city.resources.meat = 0;
    city.resources.cooked = 0;
    const [ordinary, scholar] = n.units;
    ordinary.cityId = scholar.cityId = city.id;
    scholar.action = 'frontline';
    scholar.x = city.x + 100;
    expect(consume(n, scholar)).toBe(false);
    expect(consume(n, ordinary)).toBe(true);
    expect(city.resources.food).toBe(0);
  });
  it('feeds a privileged foreign visitor from our real stocks without touching foreign stores', () => {
    const s = world();
    const visitor = {
      ...structuredClone(s.units[0]),
      id: 'foreign-visitor',
      factionId: s.factions[0].id,
    };
    s.units.push(visitor);
    const n = priority(s, 'S_05');
    n.resources.food = 1;
    const foreignBefore = structuredClone(n.cities[0].resources);
    expect(consume(n, n.units[0])).toBe(false);
    updateUnits(n, 0.25);
    expect(n.units[3].hunger).toBe(45);
    expect(n.units[0].hunger).toBeGreaterThan(70);
    expect(n.resources.food).toBe(0);
    expect(n.cities[0].resources).toEqual(foreignBefore);
  });
  it('does not let an invalid imported selector or unbound Io policy enter the simulation', () => {
    const s = world();
    expect(parseGame(JSON.stringify({ ...s, foodPriority: { subjectId: 'V_01' } }))).toBeNull();
    expect(parseGame(JSON.stringify({ ...s, foodPriority: { subjectId: 'S_02' } }))).toBeNull();
  });
});
