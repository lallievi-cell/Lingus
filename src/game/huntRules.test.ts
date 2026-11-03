import { describe, expect, it } from 'vitest';
import { createGame, issueCommand, tick } from './engine';
import { FAUNA_SPECS } from './content';
import { matchingEntities, updateAnimals, updateUnits } from './simulation';
import type { EntityKind, GameState, MapEntity } from './types';

const hunt = ['S_02', 'V_03', 'O_04', 'M_01'];
function world() {
  const s = createGame(6842);
  s.started = true;
  s.tier = 3;
  s.units = [s.units[0]];
  Object.assign(s.units[0], { ...s.home, hunger: 20, temp: 100, action: 'idle', progress: 0 });
  for (const id of ['S_02', 'O_04', 'M_01', 'C_02'])
    s.words[id] = { retention: 100, custodians: [s.units[0].id], uses: 0 };
  s.entities = [];
  return s;
}
function animal(s: GameState, id: string, kind: EntityKind, dx: number) {
  const e: MapEntity = {
    id,
    kind,
    x: s.home.x + dx,
    y: s.home.y,
    amount: 1,
    hp: 100,
    maxHp: 100,
  };
  s.entities.push(e);
  return e;
}

describe('big game hunting from the four-slot source phrase', () => {
  it('chooses big game ahead of a nearer deer or wolf', () => {
    const s = world();
    animal(s, 'deer', 'deer', 1);
    animal(s, 'wolf', 'wolf', 2);
    animal(s, 'alpha', 'alpha', 12);
    animal(s, 'mammoth', 'mammoth', 20);
    const next = issueCommand(s, hunt, undefined, s.units[0].id);
    expect(next.units[0].action).toBe('hunting');
    expect(next.units[0].targetId).toBe('alpha');
    expect(matchingEntities(s, hunt, s.units[0]).map((e) => e.id)).toEqual(['alpha', 'mammoth']);
  });
  it('can select a mammoth and respects the100metre hunt radius', () => {
    const s = world();
    animal(s, 'deer', 'deer', 1);
    animal(s, 'far-alpha', 'alpha', 100.01);
    animal(s, 'mammoth', 'mammoth', 100);
    expect(issueCommand(s, hunt, undefined, s.units[0].id).units[0].targetId).toBe('mammoth');
  });
  it('does not substitute ordinary prey or loose meat when no big game is in range', () => {
    const s = world();
    animal(s, 'deer', 'deer', 1);
    animal(s, 'wolf', 'wolf', 2);
    animal(s, 'far-mammoth', 'mammoth', 101);
    s.entities.push({
      id: 'meat',
      kind: 'ground',
      resource: 'meat',
      ...s.home,
      amount: 2,
      hp: 0,
      maxHp: 0,
    });
    expect(matchingEntities(s, hunt, s.units[0])).toEqual([]);
    expect(issueCommand(s, hunt, undefined, s.units[0].id).units[0].targetId).toBeUndefined();
  });
  it('keeps the ordinary hunt able to choose a nearby deer', () => {
    const s = world();
    animal(s, 'deer', 'deer', 1);
    animal(s, 'alpha', 'alpha', 12);
    expect(issueCommand(s, hunt.slice(0, 3), undefined, s.units[0].id).units[0].targetId).toBe(
      'deer',
    );
  });
  it('does not let a clicked deer bypass the big game selector', () => {
    const s = world(),
      deer = animal(s, 'deer', 'deer', 1);
    animal(s, 'alpha', 'alpha', 12);
    const target = { type: 'entity' as const, id: deer.id, x: deer.x, y: deer.y };
    expect(issueCommand(s, hunt, target, s.units[0].id).units[0].targetId).toBe('alpha');
  });
  it('uses the same selector when a persistent hunting tradition is assigned', () => {
    const s = world(),
      deer = animal(s, 'deer', 'deer', 1);
    animal(s, 'mammoth', 'mammoth', 12);
    const target = { type: 'entity' as const, id: deer.id, x: deer.x, y: deer.y };
    const next = issueCommand(s, ['C_02', ...hunt], target, s.units[0].id);
    expect(next.traditions).toHaveLength(1);
    updateUnits(next, 0.25);
    expect(next.units[0].action).toBe('hunting');
    expect(next.units[0].targetId).toBe('mammoth');
  });
  it('preserves a clicked tree for an ordinary striking tradition with no named material', () => {
    const s = world(),
      tree = animal(s, 'tree', 'tree', 1);
    const next = issueCommand(
      s,
      ['C_02', 'S_02', 'V_03'],
      { type: 'entity', id: tree.id, x: tree.x, y: tree.y },
      s.units[0].id,
    );
    updateUnits(next, 0.25);
    expect(next.units[0].targetId).toBe('tree');
    expect(next.units[0].action).toBe('gathering');
  });
});

describe('continuous wildlife movement and hunting engagement', () => {
  it('walks back after an escape instead of teleporting when the nearest human crosses15m', () => {
    const s = world(),
      u = s.units[0],
      deer = animal(s, 'escaped-deer-17', 'deer', 35);
    Object.assign(deer, { originX: s.home.x + 8, originY: s.home.y });
    const before = { x: deer.x, y: deer.y },
      seed = s.seed;
    updateAnimals(s, 0.25);
    expect(Math.hypot(deer.x - before.x, deer.y - before.y)).toBeLessThanOrEqual(
      FAUNA_SPECS.deer.speed * 0.25 + 1e-9,
    );
    expect(Math.hypot(deer.x - before.x, deer.y - before.y)).toBeGreaterThan(0);
    expect(s.seed).toBe(seed);
    expect(u.x).toBe(s.home.x);
  });

  it('does not jump across a sector boundary when an older animal is outside its birth sector', () => {
    const s = world(),
      deer = animal(s, 'border-deer-3', 'deer', 0);
    Object.assign(deer, { x: 301, y: 250, originX: 299, originY: 250 });
    Object.assign(s.units[0], { x: 300, y: 250 });
    const before = { x: deer.x, y: deer.y };
    updateAnimals(s, 0.1);
    expect(Math.hypot(deer.x - before.x, deer.y - before.y)).toBeLessThanOrEqual(0.6 + 1e-9);
  });

  it('handles nonnumeric animal IDs and establishes a stable origin once for older saves', () => {
    const s = world(),
      deer = animal(s, 'old-deer', 'deer', 40);
    const origin = { x: deer.x, y: deer.y };
    for (let i = 0; i < 100; i++) {
      const before = { x: deer.x, y: deer.y };
      s.time += 0.25;
      updateAnimals(s, 0.25);
      expect(Number.isFinite(deer.x) && Number.isFinite(deer.y)).toBe(true);
      expect(Math.hypot(deer.x - before.x, deer.y - before.y)).toBeLessThanOrEqual(1.5 + 1e-9);
    }
    expect(deer.originX).toBe(origin.x);
    expect(deer.originY).toBe(origin.y);
    expect(Math.hypot(deer.x - origin.x, deer.y - origin.y)).toBeLessThanOrEqual(2 + 1e-9);
  });

  it('keeps a fleeing animal born on the outer world edge inside the real world', () => {
    const s = world(),
      deer = animal(s, 'edge-deer-9', 'deer', 0);
    Object.assign(deer, { x: 500, y: 500, originX: 500, originY: 500 });
    Object.assign(s.units[0], { x: 499, y: 499 });
    updateAnimals(s, 0.25);
    expect(deer.x).toBeLessThanOrEqual(500);
    expect(deer.y).toBeLessThanOrEqual(500);
    expect(Math.hypot(deer.x - 500, deer.y - 500)).toBeLessThanOrEqual(1.5 + 1e-9);
  });

  it('does not permanently freeze an animal after its old hunting order was cancelled', () => {
    const s = world(),
      deer = animal(s, 'abandoned-deer-1', 'deer', 40);
    deer.attacked = true;
    const before = { x: deer.x, y: deer.y };
    updateAnimals(s, 0.25);
    expect(Math.hypot(deer.x - before.x, deer.y - before.y)).toBeGreaterThan(0);
    expect(deer.attacked).toBe(true); // Preserve hostility history for dogmas and presentation.
  });

  it.each([false, true])(
    'reaches and kills real prey for a %s persistent tradition',
    (tradition) => {
      let s = world();
      Object.assign(s, { paused: false, time: 20, sparks: [] });
      const deer = animal(s, 'hunted-deer-5', 'deer', 12);
      Object.assign(deer, { hp: 30, maxHp: 30, originX: deer.x, originY: deer.y });
      const tokens = ['S_02', 'V_03', 'O_04'];
      s = issueCommand(s, tradition ? ['C_02', ...tokens] : tokens, undefined, s.units[0].id);
      if (tradition) expect(s.traditions).toHaveLength(1);
      const commands = s.stats.commands;
      expect(commands).toBe(tradition ? 0 : 1);
      for (let i = 0; i < 80 && s.stats.hunts === 0; i++) s = tick(s, 0.25);
      expect(s.stats.hunts).toBe(1);
      expect(s.entities.find((e) => e.id === deer.id)?.hp).toBe(0);
      expect(s.stats.commands).toBe(commands);
    },
  );
});
