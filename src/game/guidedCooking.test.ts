import { describe, expect, it } from 'vitest';
import { emptyInventory, HOME } from './content';
import {
  createGame,
  createReadyBuilding,
  issueCommand,
  parseGame,
  serializeGame,
  tick,
} from './engine';
import { getOrderPreview } from './orderPreview';
import { observeTaskOutcomes } from './taskOutcomes';
import type { GameState } from './types';

const meal = ['S_02', 'V_07', 'O_04', 'O_05'];
function kitchen(mode: 'guided' | 'classic' = 'guided', people = 1) {
  const s = createGame(6842, mode);
  Object.assign(s, {
    started: true,
    tier: 2,
    time: mode === 'guided' ? 600 : 540,
    cities: [],
    factions: [],
    entities: [],
    resources: emptyInventory(),
    buildings: [],
  });
  s.units = s.units.slice(0, people);
  for (const u of s.units)
    Object.assign(u, {
      ...HOME,
      age: 6,
      hunger: 0,
      hp: 100,
      temp: 100,
      action: 'idle',
      progress: 0,
    });
  for (const id of ['S_02', 'V_07', 'O_04', 'O_05', 'O_02']) {
    s.words[id] = { retention: 100, custodians: s.units.map((u) => u.id), uses: 0 };
    for (const u of s.units) u.knows.push(id);
  }
  createReadyBuilding(s, 'campfire');
  createReadyBuilding(s, 'storage');
  return s;
}
function order(s: GameState, unit = 0, tokens = meal) {
  return issueCommand(s, tokens, undefined, s.units[unit].id);
}
function advance(s: GameState, seconds: number) {
  for (let left = seconds; left > 1e-8; left -= 0.25) s = tick(s, Math.min(left, 0.25));
  return s;
}
const total = (s: GameState, resource: 'meat' | 'cooked' | 'stone') =>
  s.resources[resource] +
  s.entities
    .filter((e) => e.kind === 'ground' && e.resource === resource)
    .reduce((sum, e) => sum + e.amount, 0);
const extinguish = (s: GameState) => {
  s.buildings.find((b) => b.kind === 'campfire')!.active = false;
};

describe('Guided food cooking is a paid daytime task, before Always becomes available', () => {
  it('prepares twenty-two portions with two actual cooks and two orders, charging each cycle', () => {
    let s = kitchen('guided', 2);
    s.resources.meat = 30;
    s = order(order(s), 1);
    expect(s.stats.commands).toBe(2);
    expect(s.voice).toBe(1);
    expect(s.resources.meat).toBe(28);
    s = advance(s, 5);
    expect(s.resources.cooked).toBe(2);
    expect(s.resources.meat).toBe(28); // No speculative payment for the next cycle.
    expect(s.voice).toBe(1);
    s = advance(s, 50);
    expect(s.resources.cooked).toBe(22);
    expect(s.resources.meat).toBe(8);
    expect(s.stats.commands).toBe(2);
    expect(s.traditions).toHaveLength(0);
    expect(s.units.every((u) => u.craftNeedsPayment === true)).toBe(true);
  });
  it('exhausts only the real meat and reports the missing ingredient', () => {
    let s = kitchen();
    s.resources.meat = 3;
    s = advance(order(s), 15);
    const next = tick(s, 0.25);
    expect(next.resources).toMatchObject({ meat: 0, cooked: 3 });
    expect(next.units[0].command).toBeUndefined();
    expect(observeTaskOutcomes(s, next)[0]?.reason).toBe('materials');
    expect(advance(next, 10).resources.cooked).toBe(3);
  });
  it('does not pay a first cycle or spend Voice without ingredients', () => {
    const s = kitchen();
    const next = order(s);
    expect(next.stats.commands).toBe(0);
    expect(next.voice).toBe(3);
    expect(next.resources.cooked).toBe(0);
  });
  it('requires the real fire before accepting a meal order', () => {
    const s = kitchen();
    s.resources.meat = 3;
    extinguish(s);
    const next = order(s);
    expect(next.stats.commands).toBe(0);
    expect(next.resources.meat).toBe(3);
  });
  it('finishes a paid cycle at dusk, then rests without paying another portion', () => {
    let s = kitchen();
    s.time = 655;
    s.resources.meat = 3;
    s = advance(order(s), 4.75);
    const next = tick(s, 0.25);
    expect(next.resources).toMatchObject({ meat: 2, cooked: 1 });
    expect(next.units[0].command).toBeUndefined();
    expect(observeTaskOutcomes(s, next)[0]?.reason).toBe('rest');
    expect(advance(next, 15).resources.meat).toBe(2);
  });
  it.each(['hunger', 'cold', 'forgotten'] as const)('pays no next cycle after %s', (reason) => {
    let s = kitchen();
    s.resources.meat = 3;
    s = advance(order(s), 5);
    if (reason === 'hunger') s.units[0].hunger = 75;
    if (reason === 'cold') s.units[0].temp = 20;
    if (reason === 'forgotten') s.words.O_04.retention = 0;
    const next = tick(s, 0.25);
    expect(next.resources.meat).toBe(2);
    expect(next.resources.cooked).toBe(1);
    expect(next.units[0].command).toBeUndefined();
  });
  it('checks a newly enacted prohibition before charging another portion', () => {
    let s = kitchen();
    s.resources.meat = 3;
    s = advance(order(s), 5);
    createReadyBuilding(s, 'court');
    s.laws.push({
      id: 'cooking-ban',
      name: 'Divieto',
      tokens: ['S_01', 'V_07', 'O_04', 'M_01', 'C_03', 'V_03'],
      subjectId: 'S_01',
      verbId: 'V_07',
      objectId: 'O_04',
      modifierId: 'M_01',
      sanctionId: 'V_03',
      prohibitive: true,
      age: 0,
    });
    const next = tick(s, 0.25);
    expect(next.resources).toMatchObject({ meat: 2, cooked: 1 });
    expect(next.units[0].hp).toBe(60);
    expect(next.units[0].command).toBeUndefined();
  });
  it('rejects ground-only meat when storage has no room, without consuming it or Voice', () => {
    const s = kitchen();
    s.resources.food = 200;
    s.entities.push({
      id: 'raw',
      kind: 'ground',
      resource: 'meat',
      ...HOME,
      hp: 0,
      maxHp: 1,
      amount: 3,
    });
    const next = order(s);
    expect(next.stats.commands).toBe(0);
    expect(next.voice).toBe(3);
    expect(next.resources.food).toBe(200);
    expect(total(next, 'meat')).toBe(3);
  });
  it('converts stored meat in a full store because each real payment frees its output place', () => {
    let s = kitchen();
    s.resources.meat = 200;
    s = advance(order(s), 15);
    expect(s.resources).toMatchObject({ meat: 197, cooked: 3 });
    expect(s.entities).toHaveLength(0);
    expect(s.stats.commands).toBe(1);
  });
  it('uses nearby raw meat once per cycle and leaves remote inputs untouched', () => {
    let s = kitchen();
    s.resources.meat = 1;
    s.entities = [
      { id: 'near', kind: 'ground', resource: 'meat', x: 255, y: 250, hp: 0, maxHp: 1, amount: 2 },
      { id: 'far', kind: 'ground', resource: 'meat', x: 350, y: 250, hp: 0, maxHp: 1, amount: 2 },
    ];
    s = advance(order(s), 20);
    expect(s.resources.cooked).toBe(3);
    expect(s.resources.meat).toBe(0);
    expect(s.entities.find((e) => e.id === 'near')!.amount).toBe(0);
    expect(s.entities.find((e) => e.id === 'far')!.amount).toBe(2);
  });
  it('charges no speculative input when a new command interrupts at a completed cycle', () => {
    let s = kitchen();
    s.resources.meat = 3;
    s = advance(order(s), 5);
    s = issueCommand(s, ['S_02', 'V_01'], { type: 'point', ...HOME }, s.units[0].id);
    s = advance(s, 2);
    expect(s.resources).toMatchObject({ meat: 2, cooked: 1 });
    expect(s.units[0].craftNeedsPayment).toBeUndefined();
  });
  it('reloads an unpaid next cycle without duplicating or losing the reserved ingredient', () => {
    let s = kitchen();
    s.resources.meat = 3;
    s = advance(order(s), 5);
    const saved = parseGame(serializeGame(s))!;
    expect(saved).not.toBeNull();
    saved.paused = false;
    expect(saved.units[0].craftNeedsPayment).toBe(true);
    const next = advance(saved, 5);
    expect(next.resources).toMatchObject({ meat: 1, cooked: 2 });
    expect(next.stats.commands).toBe(1);
  });
  it('shares the opening biological work rate and agrees with incremental ticks', () => {
    let s = kitchen();
    s.time = 10;
    s.resources.meat = 4;
    s = order(s);
    expect(advance(s, 8.25).resources.cooked).toBe(0);
    expect(advance(s, 8.5).resources.cooked).toBe(1);
    const incremental = advance(s, 17),
      bulk = tick(s, 17);
    expect(incremental.resources).toMatchObject({ meat: 2, cooked: 2 });
    expect(bulk.resources).toEqual(incremental.resources);
    expect(bulk.units[0].progress).toBeCloseTo(incremental.units[0].progress);
  });
  it('explains repeat cooking in Guided while Classic describes a single cycle', () => {
    const guided = kitchen(),
      classic = kitchen('classic');
    guided.resources.meat = classic.resources.meat = 3;
    expect(getOrderPreview(guided, meal, undefined, guided.units[0].id).behaviour).toContain(
      'durante il giorno',
    );
    expect(getOrderPreview(classic, meal, undefined, classic.units[0].id).behaviour).toContain(
      'termina dopo questo ciclo',
    );
  });
  it('keeps Classic food cooking a single paid cycle', () => {
    let s = kitchen('classic');
    s.resources.meat = 3;
    s = advance(order(s), 20);
    expect(s.resources).toMatchObject({ meat: 2, cooked: 1 });
    expect(s.units[0].command).toBeUndefined();
    expect(s.stats.commands).toBe(1);
  });
  it.each(['guided', 'classic'] as const)('keeps ceramics one-shot in %s', (mode) => {
    let s = kitchen(mode);
    s.resources.stone = 3;
    s = advance(order(s, 0, ['S_02', 'V_07', 'O_02', 'O_05']), 20);
    expect(s.resources).toMatchObject({ stone: 2, pottery: 1 });
    expect(s.units[0].command).toBeUndefined();
  });
  it.each(['guided', 'classic'] as const)(
    'returns an unfinished paid meal once when the fire dies in %s',
    (mode) => {
      let s = kitchen(mode);
      s.resources.meat = 3;
      s = advance(order(s), 2);
      extinguish(s);
      const next = tick(s, 0.25);
      expect(next.resources.cooked).toBe(0);
      expect(total(next, 'meat')).toBe(3);
      expect(next.resources.meat).toBe(2);
      expect(next.entities.find((e) => e.resource === 'meat')).toMatchObject({
        ...HOME,
        amount: 1,
      });
      expect(observeTaskOutcomes(s, next)[0]?.reason).toBe('fire');
      expect(total(advance(next, 10), 'meat')).toBe(3);
    },
  );
  it('returns paid ceramic stone if its real fire dies before completion', () => {
    let s = kitchen();
    s.resources.stone = 3;
    s = advance(order(s, 0, ['S_02', 'V_07', 'O_02', 'O_05']), 2);
    extinguish(s);
    s = advance(s, 5);
    expect(s.resources.pottery).toBe(0);
    expect(s.resources.stone).toBe(2);
    expect(total(s, 'stone')).toBe(3);
  });
  it('does not refund an unpaid next portion when the fire dies between cycles', () => {
    let s = kitchen();
    s.resources.meat = 3;
    s = advance(order(s), 5);
    extinguish(s);
    s = advance(s, 1);
    expect(s.resources).toMatchObject({ meat: 2, cooked: 1 });
    expect(s.entities).toHaveLength(0);
    expect(s.units[0].command).toBeUndefined();
  });
});
