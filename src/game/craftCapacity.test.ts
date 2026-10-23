import { describe, expect, it } from 'vitest';
import { emptyInventory, HOME } from './content';
import { createGame, issueCommand, tick } from './engine';
import { freeCapacity } from './runtime';
import type { GameState } from './types';

/** Isolated stock and concurrency fixtures, not ordinary opening playthroughs. */
function village(mode: 'classic' | 'guided' = 'classic', people = 1) {
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
    Object.assign(u, { ...HOME, age: 8, hunger: 0, temp: 100, hp: 100, action: 'idle' });
  for (const id of ['S_02', 'O_01', 'O_02', 'O_03', 'V_04', 'V_06']) {
    s.words[id] = { retention: 100, custodians: s.units.map((u) => u.id), uses: 0 };
    for (const u of s.units) if (!u.knows.includes(id)) u.knows.push(id);
  }
  s.entities = [];
  return s;
}
function advance(s: GameState, seconds: number) {
  for (let remaining = seconds; remaining > 0; remaining -= 0.25) s = tick(s, 0.25);
  return s;
}

describe('craft output capacity uses the real post-payment inventory', () => {
  it('converts stone into a tool with all thirty stock places occupied', () => {
    let s = village();
    s.resources.stone = 30;
    const input = structuredClone(s);
    s = issueCommand(s, ['S_01', 'V_06', 'O_02']);
    expect(s.stats.commands).toBe(1);
    expect(s.resources.stone).toBe(29);
    s = advance(s, 5);
    expect(s.resources.tool).toBe(1);
    expect(s.resources.stone).toBe(29);
    expect(freeCapacity(s, 'tool')).toBe(0);
    expect(s.entities).toHaveLength(0);
    expect(input.resources.stone).toBe(30);
    expect(input.units[0].action).toBe('idle');
  });

  it('allows a spear to replace its two actual stored ingredients in a full stockpile', () => {
    let s = village();
    Object.assign(s.resources, { stone: 29, wood: 1 });
    s = advance(issueCommand(s, ['S_01', 'V_06', 'O_02', 'O_03']), 5);
    expect(s.resources).toMatchObject({ stone: 28, wood: 0, spear: 1 });
    expect(freeCapacity(s, 'spear')).toBe(1);
    expect(s.stats.commands).toBe(1);
  });

  it('keeps repeating a Guided tool order while each real stone frees the output place', () => {
    let s = village('guided');
    s.resources.stone = 30;
    s = advance(issueCommand(s, ['S_01', 'V_06', 'O_02']), 15);
    expect(s.resources).toMatchObject({ stone: 27, tool: 3 });
    expect(s.stats.commands).toBe(1);
    expect(s.units[0].craftNeedsPayment).toBe(true);
    expect(s.entities).toHaveLength(0);
  });

  it('rejects ground-only payment when the stored wood and reserved carrier fill all places', () => {
    let s = village('guided', 2);
    s.resources.wood = 29;
    s.units[1].carry = { resource: 'wood', amount: 1 };
    s.entities.push({
      id: 'local-stone',
      kind: 'ground',
      resource: 'stone',
      ...HOME,
      amount: 2,
      maxAmount: 2,
      hp: 0,
      maxHp: 1,
    });
    s = issueCommand(s, ['S_02', 'V_06', 'O_02'], undefined, s.units[0].id);
    expect(s.stats.commands).toBe(0);
    expect(s.voice).toBe(3);
    expect(s.resources.wood).toBe(29);
    expect(s.entities[0].amount).toBe(2);
    expect(s.units[0].action).toBe('idle');
    expect(s.units[1].carry?.amount).toBe(1);
  });

  it('leaves a paid output physically at the artisan if a real delivery fills its place first', () => {
    let s = village('guided', 2);
    s.resources.stone = 30;
    s.entities.push({
      id: 'wood-source',
      kind: 'tree',
      ...HOME,
      amount: 5,
      maxAmount: 5,
      hp: 100,
      maxHp: 100,
    });
    s = issueCommand(s, ['S_02', 'V_06', 'O_02'], undefined, s.units[0].id);
    s = issueCommand(
      s,
      ['S_02', 'V_04', 'O_03'],
      {
        type: 'entity',
        id: 'wood-source',
        ...HOME,
      },
      s.units[1].id,
    );
    s = advance(s, 5);
    expect(s.resources).toMatchObject({ stone: 29, wood: 1, tool: 0 });
    expect(s.entities.find((e) => e.kind === 'ground' && e.resource === 'tool')).toMatchObject({
      ...HOME,
      amount: 1,
    });
    expect(s.entities.find((e) => e.id === 'wood-source')?.amount).toBe(4);
    expect(s.units.every((u) => !u.carry)).toBe(true);
  });
});
