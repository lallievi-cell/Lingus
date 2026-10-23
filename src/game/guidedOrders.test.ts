import { describe, expect, it } from 'vitest';
import { emptyInventory, HOME } from './content';
import {
  createGame,
  createReadyBuilding,
  issueCommand,
  parseGame,
  serializeGame,
  solveSpark,
  tick,
} from './engine';
import type { GameState, Resource, Target } from './types';

/** Isolated task fixtures: these are not ordinary campaigns from the beginning. */
function village(mode: 'guided' | 'classic' = 'guided', people = 1) {
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
  for (const id of ['S_02', 'O_01', 'O_02', 'O_03', 'O_04', 'O_07', 'V_04', 'V_05', 'V_06', 'V_07'])
    learn(s, id);
  s.entities = [
    { id: 'source', kind: 'tree', x: 254, y: 250, hp: 100, maxHp: 100, amount: 20, maxAmount: 20 },
  ];
  return s;
}
function learn(s: GameState, id: string) {
  s.words[id] = { retention: 100, custodians: s.units.map((u) => u.id), uses: 0 };
  for (const u of s.units) if (!u.knows.includes(id)) u.knows.push(id);
}
function source(s: GameState): Target {
  const e = s.entities[0];
  return { type: 'entity', id: e.id, x: e.x, y: e.y };
}
function advance(s: GameState, seconds: number) {
  for (let left = seconds; left > 1e-8; left -= 0.25) s = tick(s, Math.min(0.25, left));
  return s;
}
function until(s: GameState, condition: (s: GameState) => boolean) {
  for (let step = 0; step < 240 && !condition(s); step++) s = tick(s, 0.25);
  expect(condition(s)).toBe(true);
  return s;
}
function total(s: GameState, r: Resource) {
  return (
    s.resources[r] +
    s.units.reduce((n, u) => n + (u.carry?.resource === r ? u.carry.amount : 0), 0) +
    s.entities.reduce(
      (n, e) =>
        n +
        (e.resource === r ||
        (r === 'wood' && e.kind === 'tree') ||
        (r === 'stone' && e.kind === 'stone') ||
        (r === 'ore' && e.kind === 'ore')
          ? e.amount
          : 0),
      0,
    )
  );
}

describe('guided material transport remains physical and bounded', () => {
  it('uses several real trips for a single paid command and stops at the exhausted node', () => {
    let s = village();
    s.entities[0].amount = 7;
    s = issueCommand(s, ['S_01', 'V_04', 'O_03'], source(s));
    expect(s.voice).toBe(2);
    expect(s.stats.commands).toBe(1);
    s = until(s, (state) => state.resources.wood === 7 && !state.units[0].carry);
    expect(s.entities[0].amount).toBe(0);
    expect(s.units[0].command).toBeUndefined();
    expect(total(s, 'wood')).toBe(7);
    expect(s.stats.commands).toBe(1);
    expect(s.words.V_04.uses).toBe(1);
  });

  it.each([
    ['stone', 'stone', 'O_02'],
    ['ore', 'ore', 'O_07'],
    ['ground', 'wood', 'O_03'],
  ] as const)(
    'collects a %s target repeatedly without creating resources',
    (kind, resource, word) => {
      let s = village();
      Object.assign(s.entities[0], {
        kind,
        resource: kind === 'ground' ? resource : undefined,
        amount: 7,
      });
      s = issueCommand(s, ['S_01', 'V_04', word], source(s));
      s = until(s, (state) => state.resources[resource] === 7 && !state.units[0].carry);
      expect(s.entities[0].amount).toBe(0);
      expect(total(s, resource)).toBe(7);
      expect(s.stats.commands).toBe(1);
    },
  );

  it('preserves the single-trip rule for a Classic game and for food in a Guided game', () => {
    let classic = village('classic');
    classic = advance(issueCommand(classic, ['S_01', 'V_04', 'O_03'], source(classic)), 15);
    expect(classic.resources.wood).toBe(3);
    expect(classic.entities[0].amount).toBe(17);
    let food = village();
    Object.assign(food.entities[0], { kind: 'berries', amount: 20, hp: 1, maxHp: 1 });
    food = advance(issueCommand(food, ['S_01', 'V_04', 'O_04'], source(food)), 15);
    expect(food.resources.food).toBe(3);
    expect(food.entities[0].amount).toBe(17);
  });

  it('reserves shared capacity across carriers and leaves the uncollected materials in place', () => {
    let s = village('guided', 2);
    s.resources.stone = 25;
    s = advance(issueCommand(s, ['S_01', 'V_04', 'O_03'], source(s)), 15);
    expect(s.resources.wood).toBe(5);
    expect(s.resources.stone).toBe(25);
    expect(s.units.every((u) => !u.carry && !u.command)).toBe(true);
    expect(s.entities[0].amount).toBe(15);
    expect(total(s, 'wood')).toBe(20);
  });

  it('stops for the night and does not become a next-day tradition', () => {
    let s = village();
    s.time = 55;
    s = advance(issueCommand(s, ['S_01', 'V_04', 'O_03'], source(s)), 10);
    expect(s.resources.wood).toBe(3);
    expect(s.units[0].command).toBeUndefined();
    expect(s.units[0].action).toBe('sleeping');
    const gathered = s.resources.wood;
    s = advance(s, 30);
    expect(s.resources.wood).toBeCloseTo(gathered * 0.95);
    expect(s.entities[0].amount).toBe(17);
    expect(s.traditions).toHaveLength(0);
  });

  it.each(['hunger', 'cold', 'forgotten'] as const)(
    'finishes the carried delivery but starts no extra trip after %s',
    (reason) => {
      let s = village();
      s = until(
        issueCommand(s, ['S_01', 'V_04', 'O_03'], source(s)),
        (state) => state.units[0].action === 'returning',
      );
      if (reason === 'hunger') s.units[0].hunger = 75;
      if (reason === 'cold') s.units[0].temp = 29;
      if (reason === 'forgotten') s.words.O_03.retention = 0;
      s = advance(s, 3);
      expect(s.resources.wood).toBe(3);
      expect(s.units[0].carry).toBeUndefined();
      expect(s.units[0].command).toBeUndefined();
      expect(total(s, 'wood')).toBe(20);
    },
  );

  it('lets a new order interrupt the task while conserving the old load on the ground', () => {
    let s = village();
    s = until(
      issueCommand(s, ['S_01', 'V_04', 'O_03'], source(s)),
      (state) => state.units[0].action === 'returning',
    );
    s = issueCommand(s, ['S_01', 'V_01'], { type: 'point', ...HOME });
    s = advance(s, 10);
    expect(s.resources.wood).toBe(0);
    expect(s.entities.find((e) => e.kind === 'ground')).toMatchObject({
      resource: 'wood',
      amount: 3,
    });
    expect(total(s, 'wood')).toBe(20);
    expect(s.stats.commands).toBe(2);
  });

  it.each(['V_03', 'O_06'] as const)(
    'respects a newly enacted law before another trip, including sanction %s',
    (sanctionId) => {
      let s = village();
      s = until(
        issueCommand(s, ['S_01', 'V_04', 'O_03'], source(s)),
        (state) => state.units[0].action === 'returning',
      );
      createReadyBuilding(s, 'court');
      s.laws.push({
        id: 'new-prohibition',
        name: 'New prohibition',
        tokens: ['S_01', 'V_04', 'O_03', 'M_01', 'C_03', sanctionId],
        subjectId: 'S_01',
        verbId: 'V_04',
        objectId: 'O_03',
        modifierId: 'M_01',
        sanctionId,
        prohibitive: true,
        age: 0,
      });
      s = until(s, (state) =>
        sanctionId === 'O_06' ? state.units[0].hp === 0 : state.units[0].command === undefined,
      );
      expect(s.resources.wood).toBe(3);
      expect(s.entities[0].amount).toBe(17);
      if (sanctionId === 'O_06') {
        expect(s.units[0].hp).toBe(0);
        expect(s.units[0].action).toBe('dead');
      } else {
        expect(s.units[0].command).toBeUndefined();
        expect(s.units[0].hp).toBe(60);
      }
    },
  );
});

describe('guided plain tool crafting pays for each real cycle', () => {
  it('earns the fire intuition from five cycles and pays exactly five stones before the next tick', () => {
    let s = village();
    s.resources.stone = 8;
    s = advance(issueCommand(s, ['S_01', 'V_06', 'O_02']), 25);
    expect(s.resources.tool).toBe(5);
    expect(s.resources.stone).toBe(3);
    expect(s.sparks.some((spark) => spark.wordId === 'O_05')).toBe(true);
    expect(s.units[0].craftNeedsPayment).toBe(true);
    expect(s.stats.commands).toBe(1);
    const saved = parseGame(serializeGame(s))!;
    expect(saved.units[0].craftNeedsPayment).toBe(true);
    s = issueCommand(s, ['S_01', 'V_01'], { type: 'point', ...HOME });
    s = advance(s, 1);
    expect(s.resources.stone).toBe(3);
    expect(s.units[0].craftNeedsPayment).toBeUndefined();
  });

  it('stops when the actual stone is exhausted and consumes no negative balance', () => {
    let s = village();
    s.resources.stone = 3;
    s = advance(issueCommand(s, ['S_01', 'V_06', 'O_02']), 20);
    expect(s.resources.tool).toBe(3);
    expect(s.resources.stone).toBe(0);
    expect(s.units[0].command).toBeUndefined();
    expect(s.sparks.some((spark) => spark.wordId === 'O_05')).toBe(false);
  });

  it('uses local extracted stone within fifteen metres and leaves remote stone untouched', () => {
    let s = village();
    s.entities = [
      {
        id: 'local',
        kind: 'ground',
        resource: 'stone',
        x: 260,
        y: 250,
        amount: 3,
        maxAmount: 3,
        hp: 0,
        maxHp: 1,
      },
      {
        id: 'remote',
        kind: 'ground',
        resource: 'stone',
        x: 280,
        y: 250,
        amount: 8,
        maxAmount: 8,
        hp: 0,
        maxHp: 1,
      },
    ];
    s = advance(issueCommand(s, ['S_01', 'V_06', 'O_02']), 20);
    expect(s.resources.tool).toBe(3);
    expect(s.entities[0].amount).toBe(0);
    expect(s.entities[1].amount).toBe(8);
    expect(s.resources.stone).toBe(0);
  });

  it('does not prepay another cycle when work ends at night or the output store becomes full', () => {
    let night = village();
    night.time = 55;
    night.resources.stone = 8;
    night = advance(issueCommand(night, ['S_01', 'V_06', 'O_02']), 6);
    expect(night.resources.tool).toBe(1);
    expect(night.resources.stone).toBe(7);
    expect(night.units[0].command).toBeUndefined();
    let full = village();
    full.resources.stone = 8;
    full = advance(issueCommand(full, ['S_01', 'V_06', 'O_02']), 5);
    // An isolated concurrent-delivery boundary: all remaining slots are occupied.
    full.resources.wood = 22;
    full = advance(full, 1);
    expect(full.resources.tool).toBe(1);
    expect(full.resources.stone).toBe(7);
    expect(full.units[0].command).toBeUndefined();
  });

  it('leaves Classic tools, Guided spears and cooking as single paid manufactures', () => {
    let classic = village('classic');
    classic.resources.stone = 8;
    classic = advance(issueCommand(classic, ['S_01', 'V_06', 'O_02']), 20);
    expect(classic.resources.tool).toBe(1);
    expect(classic.resources.stone).toBe(7);
    let spear = village();
    Object.assign(spear.resources, { stone: 3, wood: 3 });
    spear = advance(issueCommand(spear, ['S_01', 'V_06', 'O_02', 'O_03']), 15);
    expect(spear.resources.spear).toBe(1);
    expect(spear.resources.stone).toBe(2);
    expect(spear.resources.wood).toBe(2);
    let cooking = village();
    learn(cooking, 'O_05');
    createReadyBuilding(cooking, 'campfire');
    cooking.resources.meat = 3;
    cooking = advance(issueCommand(cooking, ['S_01', 'V_07', 'O_04', 'O_05']), 15);
    expect(cooking.resources.cooked).toBe(1);
    expect(cooking.resources.meat).toBe(2);
  });

  it('lights the guided fire at home using delivered wood rather than the artisan’s drifting position', () => {
    let s = village();
    s.units[0].x = 280;
    Object.assign(s.resources, { stone: 5, wood: 5 });
    s = advance(issueCommand(s, ['S_02', 'V_06', 'O_02'], undefined, s.units[0].id), 25);
    const spark = s.sparks.find((spark) => spark.wordId === 'O_05')!;
    expect(spark).toBeDefined();
    s = solveSpark(s, spark.id, spark.recipe);
    expect(s.buildings.find((b) => b.kind === 'campfire')).toMatchObject({
      x: HOME.x,
      y: HOME.y,
      active: true,
    });
    expect(s.resources.wood).toBe(0);
  });

  it('requires wood at home for guided ignition instead of taking distant extracted wood', () => {
    let s = village();
    s.units[0].x = 280;
    s.resources.stone = 5;
    s.entities.push({
      id: 'distant-wood',
      kind: 'ground',
      resource: 'wood',
      x: 280,
      y: 250,
      amount: 5,
      maxAmount: 5,
      hp: 0,
      maxHp: 1,
    });
    s = advance(issueCommand(s, ['S_02', 'V_06', 'O_02'], undefined, s.units[0].id), 25);
    const spark = s.sparks.find((spark) => spark.wordId === 'O_05')!;
    s = solveSpark(s, spark.id, spark.recipe);
    expect(s.buildings.some((b) => b.kind === 'campfire')).toBe(false);
    expect(s.entities.find((e) => e.id === 'distant-wood')?.amount).toBe(5);
  });
});
