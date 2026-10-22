import { describe, expect, it } from 'vitest';
import { createGame, issueCommand } from './engine';
import { matchingEntities, updateUnits } from './simulation';
import type { EntityKind, GameState } from './types';

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
  const e = { id, kind, x: s.home.x + dx, y: s.home.y, amount: 1, hp: 100, maxHp: 100 };
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
