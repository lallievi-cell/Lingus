import { describe, expect, it } from 'vitest';
import { emptyInventory, HOME } from './content';
import { compileSentence, createGame, createReadyBuilding, issueCommand, tick } from './engine';
import type { GameState, Resource, Target } from './types';

/** Isolated conservation fixtures, not campaigns from the Seed Zero. */
function village(people = 1) {
  const s = createGame(6842);
  Object.assign(s, {
    started: true,
    tier: 3,
    cities: [],
    factions: [],
    resources: emptyInventory(),
  });
  s.units = s.units.slice(0, people);
  for (const u of s.units)
    Object.assign(u, {
      ...HOME,
      hp: 100,
      hunger: 20,
      temp: 100,
      age: 8,
      action: 'idle',
      progress: 0,
    });
  for (const id of [
    'S_02',
    'V_04',
    'V_05',
    'V_06',
    'V_07',
    'V_08',
    'V_09',
    'V_10',
    'V_12',
    'O_01',
    'O_02',
    'O_03',
    'O_04',
    'O_05',
    'O_07',
    'O_09',
    'C_01',
    'C_02',
    'M_02',
  ]) {
    s.words[id] = { retention: 100, custodians: s.units.map((u) => u.id), uses: 0 };
    for (const u of s.units) if (!u.knows.includes(id)) u.knows.push(id);
  }
  s.entities = [
    {
      id: 'wood-source',
      kind: 'tree',
      x: 254,
      y: 250,
      hp: 100,
      maxHp: 100,
      amount: 20,
      maxAmount: 20,
    },
    {
      id: 'stone-source',
      kind: 'stone',
      x: 256,
      y: 250,
      hp: 100,
      maxHp: 100,
      amount: 20,
      maxAmount: 20,
    },
  ];
  return s;
}
function target(s: GameState, id: string): Target {
  const e = s.entities.find((e) => e.id === id)!;
  return { type: 'entity', id, x: e.x, y: e.y };
}
function advanceUntil(s: GameState, condition: (s: GameState) => boolean) {
  for (let step = 0; step < 120 && !condition(s); step++) s = tick(s, 0.25);
  expect(condition(s)).toBe(true);
  return s;
}
function loaded(people = 1) {
  let s = village(people);
  // Five distinct work places need a long enough return leg to observe all
  // loads in transit at once; they no longer lift from one shared point.
  if (people >= 5) s.entities.find((entity) => entity.id === 'wood-source')!.x = HOME.x + 20;
  s = issueCommand(s, ['S_01', 'V_04', 'O_03'], target(s, 'wood-source'));
  s = advanceUntil(s, (state) =>
    state.units.every((u) => u.action === 'returning' && u.carry?.amount === 3),
  );
  expect(s.resources.wood).toBe(0);
  return s;
}
function total(s: GameState, resource: Resource) {
  return (
    s.resources[resource] +
    s.units.reduce((n, u) => n + (u.carry?.resource === resource ? u.carry.amount : 0), 0) +
    s.entities.reduce(
      (n, e) =>
        n +
        (e.resource === resource ||
        (resource === 'wood' && e.kind === 'tree') ||
        (resource === 'stone' && e.kind === 'stone')
          ? e.amount
          : 0),
      0,
    )
  );
}
function expectUninterrupted(before: GameState, after: GameState) {
  expect(after.units).toEqual(before.units);
  expect(after.entities).toEqual(before.entities);
  expect(after.resources).toEqual(before.resources);
  expect(after.voice).toBe(before.voice);
  expect(after.stats.commands).toBe(before.stats.commands);
  expect(after.words).toEqual(before.words);
}

describe('cargo conservation when an order replaces a real return journey', () => {
  it('drops the old resource at the actual interruption point, then recollects and delivers it once', () => {
    const before = loaded(),
      carrier = before.units[0];
    let s = issueCommand(
      before,
      ['S_02', 'V_04', 'O_02'],
      target(before, 'stone-source'),
      carrier.id,
    );
    const pile = s.entities.find((e) => e.kind === 'ground' && e.resource === 'wood')!;
    expect(pile).toMatchObject({
      x: carrier.x,
      y: carrier.y,
      amount: 3,
      maxAmount: 3,
      sectorId: 'sector-2-2',
    });
    expect(s.units[0].carry).toBeUndefined();
    expect(s.units[0].action).toBe('gathering');
    expect(s.resources.wood).toBe(0);
    expect(total(s, 'wood')).toBe(20);
    expect(total(s, 'stone')).toBe(20);
    expect(before.units[0].carry).toEqual({ resource: 'wood', amount: 3 });
    expect(before.entities.some((e) => e.kind === 'ground')).toBe(false);

    s = advanceUntil(s, (state) => state.units[0].carry?.resource === 'stone');
    expect(total(s, 'wood')).toBe(20);
    s = issueCommand(s, ['S_02', 'V_04', 'O_03'], target(s, pile.id), carrier.id);
    s = advanceUntil(s, (state) => state.resources.wood === 3);
    expect(s.entities.find((e) => e.id === pile.id)?.amount).toBe(0);
    expect(s.units[0].carry).toBeUndefined();
    expect(total(s, 'wood')).toBe(20);
    expect(total(s, 'stone')).toBe(20);
    s = tick(s, 1);
    expect(s.resources.wood).toBe(3);
  });

  it('leaves a real pile when Move cancels transport, without teleporting goods into stock', () => {
    const before = loaded(),
      u = before.units[0];
    const s = issueCommand(before, ['S_02', 'V_01'], { type: 'point', ...HOME }, u.id);
    expect(s.units[0].action).toBe('moving');
    expect(s.units[0].carry).toBeUndefined();
    expect(s.entities.find((e) => e.kind === 'ground')).toMatchObject({
      x: u.x,
      y: u.y,
      resource: 'wood',
      amount: 3,
    });
    expect(s.resources.wood).toBe(0);
    expect(total(s, 'wood')).toBe(20);
  });

  it.each(['grammar', 'voice', 'materials', 'target', 'night'] as const)(
    'preserves the journey when rejected for %s',
    (reason) => {
      const before = loaded();
      let tokens = ['S_02', 'V_04', 'O_02'];
      let destination: Target | undefined = target(before, 'stone-source');
      if (reason === 'grammar') tokens = ['S_02', 'V_04', 'V_01'];
      if (reason === 'voice') before.voice = 0;
      if (reason === 'materials') tokens = ['S_02', 'V_05', 'O_02'];
      if (reason === 'target') {
        tokens = ['S_02', 'V_01'];
        destination = undefined;
      }
      if (reason === 'night') {
        before.tier = 2;
        tokens = ['C_01', 'S_02', 'V_04', 'O_02'];
      }
      if (reason !== 'grammar')
        expect(compileSentence(before, tokens, destination).valid).toBe(true);
      expectUninterrupted(before, issueCommand(before, tokens, destination, before.units[0].id));
    },
  );

  it.each(['construction', 'crafting', 'cooking'] as const)(
    'interrupts only the one executor of a group %s order',
    (action) => {
      const before = loaded(3);
      let tokens: string[];
      if (action === 'construction') {
        before.resources.wood = 5;
        tokens = ['S_01', 'V_05', 'O_02'];
      } else if (action === 'crafting') {
        before.resources.stone = 1;
        tokens = ['S_01', 'V_06', 'O_02'];
      } else {
        createReadyBuilding(before, 'campfire');
        before.resources.meat = 1;
        tokens = ['S_01', 'V_07', 'O_04', 'O_05'];
      }
      const s = issueCommand(before, tokens, { type: 'point', ...HOME });
      expect(s.stats.commands).toBe(before.stats.commands + 1);
      expect(s.units[0].carry).toBeUndefined();
      expect(s.units[0].action).toBe(action === 'construction' ? 'building' : action);
      expect(s.units.slice(1)).toEqual(before.units.slice(1));
      expect(s.entities.filter((e) => e.kind === 'ground')).toHaveLength(1);
      expect(s.entities.find((e) => e.kind === 'ground')?.amount).toBe(3);
      expect(total(s, 'wood')).toBe(total(before, 'wood') - (action === 'construction' ? 5 : 0));
    },
  );

  it('interrupts only group workers who really receive an available slot', () => {
    const before = loaded(5);
    createReadyBuilding(before, 'farm');
    const farm = before.buildings.find((b) => b.kind === 'farm')!;
    const s = issueCommand(
      before,
      ['S_01', 'V_09', 'O_04', 'O_01'],
      { type: 'building', id: farm.id, x: farm.x, y: farm.y },
      undefined,
      { type: 'point', x: before.units[0].x, y: before.units[0].y },
    );
    expect(s.units.slice(0, 3).every((u) => u.action === 'working' && !u.carry)).toBe(true);
    expect(s.units.slice(3)).toEqual(before.units.slice(3));
    expect(s.entities.filter((e) => e.kind === 'ground')).toHaveLength(3);
    expect(total(s, 'wood')).toBe(20);
    expect(s.voice).toBe(before.voice - 1);
  });

  it('leaves an unqualified group member carrying while qualified scribes receive work', () => {
    const before = loaded(3);
    before.units[0].intelligence = 3;
    before.units[1].intelligence = before.units[2].intelligence = 8;
    createReadyBuilding(before, 'archive');
    const b = before.buildings.find((b) => b.kind === 'archive')!;
    const s = issueCommand(before, ['S_01', 'V_08', 'O_02', 'O_09'], {
      type: 'building',
      id: b.id,
      x: b.x,
      y: b.y,
    });
    expect(s.units[0]).toEqual(before.units[0]);
    expect(s.units.slice(1).every((u) => u.action === 'working' && !u.carry)).toBe(true);
    expect(s.entities.filter((e) => e.kind === 'ground')).toHaveLength(2);
    expect(total(s, 'wood')).toBe(20);
  });

  it.each([
    ['farm', ['S_02', 'V_09', 'O_04']],
    ['pen', ['S_02', 'V_10', 'O_04']],
    ['archive', ['S_02', 'V_05', 'O_09']],
    ['foundry', ['S_02', 'V_12', 'O_07']],
  ] as const)('conserves cargo on a successful inferred %s assignment', (kind, tokens) => {
    const before = loaded();
    before.units[0].intelligence = 8;
    createReadyBuilding(before, kind);
    const b = before.buildings.find((b) => b.kind === kind)!;
    const s = issueCommand(before, [...tokens], { type: 'point', ...HOME }, before.units[0].id);
    expect(s.units[0]).toMatchObject({ action: 'working', jobBuildingId: b.id });
    expect(s.units[0].carry).toBeUndefined();
    expect(s.entities.find((e) => e.kind === 'ground')).toMatchObject({
      resource: 'wood',
      amount: 3,
    });
    expect(total(s, 'wood')).toBe(20);
    expect(s.resources.wood).toBe(0);
    expect(s.voice).toBe(before.voice - 1);
    expect(s.stats.commands).toBe(before.stats.commands + 1);
  });

  it.each(['explicit', 'inferred'] as const)(
    'rejects a full %s workplace without charging or dropping cargo',
    (path) => {
      const before = loaded(4);
      createReadyBuilding(before, 'farm');
      const b = before.buildings.find((b) => b.kind === 'farm')!;
      for (const u of before.units.slice(1)) {
        u.jobBuildingId = b.id;
        u.action = 'working';
      }
      b.workerIds = before.units.slice(1).map((u) => u.id);
      const tokens =
        path === 'explicit' ? ['S_02', 'V_09', 'O_04', 'O_01'] : ['S_02', 'V_09', 'O_04'];
      const destination: Target | undefined =
        path === 'explicit' ? { type: 'building', id: b.id, x: b.x, y: b.y } : undefined;
      expectUninterrupted(before, issueCommand(before, tokens, destination, before.units[0].id));
    },
  );

  it('rejects inferred work at an incomplete building without interrupting cargo', () => {
    const before = loaded();
    createReadyBuilding(before, 'farm');
    before.buildings.find((b) => b.kind === 'farm')!.completed = false;
    expectUninterrupted(
      before,
      issueCommand(before, ['S_02', 'V_09', 'O_04'], undefined, before.units[0].id),
    );
  });

  it('rejects inferred scribal work for an unqualified carrier', () => {
    const before = loaded();
    before.units[0].intelligence = 3;
    createReadyBuilding(before, 'archive');
    expectUninterrupted(
      before,
      issueCommand(before, ['S_02', 'V_05', 'O_09'], undefined, before.units[0].id),
    );
  });

  it('registers a tradition without interrupting the current return journey', () => {
    const before = loaded();
    const s = issueCommand(before, ['C_02', 'S_01', 'V_04', 'O_03']);
    expect(s.traditions).toHaveLength(before.traditions.length + 1);
    expect(s.units).toEqual(before.units);
    expect(s.entities).toEqual(before.entities);
    expect(s.resources).toEqual(before.resources);
    expect(total(s, 'wood')).toBe(20);
  });
});
