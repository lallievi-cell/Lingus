import { describe, expect, it } from 'vitest';
import { emptyInventory, HOME } from './content';
import { createGame, issueCommand, tick } from './engine';
import type { GameState, MapEntity } from './types';

/** Local task fixtures exercise real extraction, carrying and shared capacity. */
function camp(mode: 'classic' | 'guided' = 'guided', people = 2) {
  const s = createGame(6842, mode);
  Object.assign(s, {
    started: true,
    tier: 2,
    cities: [],
    factions: [],
    resources: emptyInventory(),
  });
  s.units = s.units.slice(0, people);
  for (const u of s.units)
    Object.assign(u, {
      ...HOME,
      age: 8,
      hp: 100,
      hunger: 0,
      temp: 100,
      action: 'idle',
      progress: 0,
    });
  for (const id of ['O_01', 'O_02', 'O_03', 'V_04', 'V_05']) {
    s.words[id] = { retention: 100, custodians: s.units.map((u) => u.id), uses: 0 };
    for (const u of s.units) if (!u.knows.includes(id)) u.knows.push(id);
  }
  s.entities = [
    { id: 'rock', kind: 'stone', x: 254, y: 250, hp: 100, maxHp: 100, amount: 30, maxAmount: 30 },
  ];
  return s;
}
function advance(s: GameState, seconds: number) {
  for (let left = seconds; left > 1e-8; left -= 0.25) s = tick(s, Math.min(0.25, left));
  return s;
}
function order(s: GameState, verb: string, e: MapEntity) {
  return issueCommand(s, ['S_01', verb, 'O_02'], { type: 'entity', id: e.id, x: e.x, y: e.y });
}
function amount(s: GameState) {
  return (
    s.resources.stone +
    s.entities.reduce(
      (n, e) => n + (e.kind === 'stone' || e.resource === 'stone' ? e.amount : 0),
      0,
    ) +
    s.units.reduce((n, u) => n + (u.carry?.resource === 'stone' ? u.carry.amount : 0), 0)
  );
}
function fragment(id: string, x = 254, resource: 'stone' | 'wood' = 'stone'): MapEntity {
  return { id, kind: 'ground', resource, x, y: 250, amount: 1, maxAmount: 1, hp: 0, maxHp: 1 };
}

describe('carrying a physical pile of extracted materials', () => {
  it('fills two carriers from real one-piece extraction drops without touching the remaining rock', () => {
    let s = camp('classic');
    s = advance(order(s, 'V_03', s.entities[0]), 7);
    const pile = s.entities.filter((e) => e.kind === 'ground');
    expect(pile.length).toBeGreaterThanOrEqual(6);
    expect(pile.every((e) => e.amount === 1)).toBe(true);
    const rock = s.entities[0].amount;
    const original = structuredClone(s);
    s = advance(order(s, 'V_04', pile[0]), 5);
    expect(s.resources.stone).toBe(6);
    expect(s.entities[0].amount).toBe(rock);
    expect(s.units.every((u) => !u.carry && !u.command)).toBe(true);
    expect(amount(s)).toBe(30);
    expect(original.resources.stone).toBe(0);
    expect(original.entities.filter((e) => e.kind === 'ground').every((e) => e.amount === 1)).toBe(
      true,
    );
  });

  it.each(['classic', 'guided'] as const)(
    'keeps %s trips bounded to the selected material pile',
    (mode) => {
      let s = camp(mode, 1);
      s.entities.push(
        ...Array.from({ length: 8 }, (_, i) => fragment(`piece-${i}`)),
        fragment('remote', 270),
        fragment('other-material', 254, 'wood'),
      );
      s = advance(order(s, 'V_04', s.entities[1]), 20);
      expect(s.resources.stone).toBe(mode === 'classic' ? 3 : 8);
      expect(s.entities[0].amount).toBe(30);
      expect(s.entities.find((e) => e.id === 'remote')?.amount).toBe(1);
      expect(s.entities.find((e) => e.id === 'other-material')?.amount).toBe(1);
      expect(amount(s)).toBe(39);
      expect(s.units[0].command).toBeUndefined();
    },
  );

  it('reserves only real free capacity across carriers and leaves the rest of the pile untouched', () => {
    let s = camp();
    s.resources.wood = 25;
    s.entities.push(...Array.from({ length: 8 }, (_, i) => fragment(`piece-${i}`)));
    s = advance(order(s, 'V_04', s.entities[1]), 15);
    expect(s.resources.stone).toBe(5);
    expect(s.resources.wood).toBe(25);
    expect(s.entities.filter((e) => e.kind === 'ground').reduce((n, e) => n + e.amount, 0)).toBe(3);
    expect(s.units.every((u) => !u.carry && !u.command)).toBe(true);
    expect(amount(s)).toBe(38);
  });
});
