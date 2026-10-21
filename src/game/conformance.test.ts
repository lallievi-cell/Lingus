/** Golden checks transcribed from the final GDD; references: docs/CONFORMANCE.md. */
import { describe, expect, it } from 'vitest';
import {
  BUILDING_ORDER,
  BUILDING_SPECS,
  emptyInventory,
  INNATE_WORDS,
  RESOURCE_SPECS,
  SEASON_TEMPERATURES,
  WORDS,
  WORD_ORDER,
} from './content';
import {
  attentionPoints,
  birthProbability,
  bodyTemperatureDelta,
  buildingEfficiency,
  cognitiveTension,
  corruptionRate,
  custodianLoss,
  dogmaWeight,
  effectiveDamage,
  faunaGrowth,
  mutualIntelligibility,
  resourceSpoilage,
  retentionDelta,
  senileDeathProbability,
} from './math';
import { createGame, dismissCampfire, issueCommand, solveSpark, teachWord, tick } from './engine';
import { cognitiveSlots, LAW_LIMITS, MAX_SLOTS, TRADITION_LIMITS } from './grammar';
import { freeCapacity } from './runtime';
import {
  advanceTier,
  consume,
  createBuilding,
  evaluateDiscoveries,
  finishSeasonMemory,
  getSeason,
  killUnit,
  recordCraft,
  seasonalCore,
  simulationStep,
} from './simulation';
import type { BuildingKind, GameState, Inventory, Resource } from './types';

function remember(s: GameState, id: string, retention = 50, custodians = [s.units[0].id]) {
  s.words[id] = { retention, custodians, uses: 0, investment: 0, support: 0 };
  for (const u of s.units) if (custodians.includes(u.id) && !u.knows.includes(id)) u.knows.push(id);
}

describe('GDD initial Seed Zero, not a generous substitute', () => {
  it('starts with the seven exact source profiles and four innate words', () => {
    const s = createGame(6842);
    expect(s.units.map((u) => [u.age, u.strength, u.intelligence, u.hp, u.hunger])).toEqual([
      [8, 8, 4, 100, 20],
      [10, 4, 8, 100, 20],
      [6, 5, 6, 100, 20],
      [7, 6, 5, 100, 20],
      [6, 5, 5, 100, 20],
      [14, 3, 9, 80, 30],
      [2, 2, 6, 60, 10],
    ]);
    expect(Object.keys(s.words)).toEqual(['S_01', 'V_01', 'V_02', 'V_03']);
    expect(Object.values(s.words).map((m) => m.retention)).toEqual([100, 100, 100, 100]);
    expect([s.time, s.tier, s.cohesion, s.voice, cognitiveSlots(s)]).toEqual([0, 0, 100, 3, 2]);
    expect(Object.values(s.resources).every((n) => n === 0)).toBe(true);
  });
  it('has exactly three bushes/60 berries, 15 trees/300 wood, two rocks/200 stone and the stated fauna and ore in its initial sector', () => {
    const s = createGame(),
      initial = s.entities.filter((e) => e.sectorId === 'sector-2-2');
    const count = (kind: string) => initial.filter((e) => e.kind === kind).length;
    const amount = (kind: string) =>
      initial.filter((e) => e.kind === kind).reduce((n, e) => n + e.amount, 0);
    expect([
      count('berries'),
      amount('berries'),
      count('tree'),
      amount('tree'),
      count('stone'),
      amount('stone'),
    ]).toEqual([3, 60, 15, 300, 2, 200]);
    expect([count('deer'), count('wolf'), count('ore'), amount('ore')]).toEqual([6, 2, 1, 500]);
    expect(s.sectors).toHaveLength(25);
    expect(s.sectors.filter((c) => c.explored)).toHaveLength(1);
    expect(s.factions.length).toBeGreaterThanOrEqual(3);
    expect(s.factions.length).toBeLessThanOrEqual(5);
  });
  it.each([
    [0, 0, false, 1],
    [59.75, 0, false, 1],
    [60, 0, true, 1],
    [89.75, 0, true, 1],
    [90, 1, false, 1],
    [180, 2, false, 1],
    [270, 3, false, 1],
    [360, 0, false, 2],
  ])('uses final 90-second calendar at t=%s', (time, index, isNight, year) => {
    const s = createGame();
    s.time = time as number;
    expect(getSeason(s)).toMatchObject({ index, isNight, year });
  });
  it('uses .8 hunger per second without an unlisted sleep discount or grace period', () => {
    const s = createGame();
    s.started = true;
    const next = tick(s, 1);
    expect(next.units[0].hunger).toBeCloseTo(20.8, 8);
  });
  it('does not advance clocks, physiology or voice before start or while paused', () => {
    const s = createGame();
    expect(tick(s, 30)).toBe(s);
    s.started = true;
    s.paused = true;
    expect(tick(s, 30)).toBe(s);
  });
  it('regenerates one voice only after ten seconds of simulation', () => {
    const s = createGame();
    s.started = true;
    s.voice = 0;
    const before = tick(s, 9.75);
    expect(before.voice).toBe(0);
    const after = tick(before, 0.25);
    expect(after.voice).toBe(1);
  });
});

describe('GDD catalog completeness and exact original complexity', () => {
  const tiers = [
    { tier: 0, words: { S_01: 0, V_01: 0, V_02: 0, V_03: 0 } },
    { tier: 1, words: { S_02: 1, O_01: 1, V_04: 2, O_02: 1, O_03: 1, M_01: 2, C_01: 2, O_04: 2 } },
    { tier: 2, words: { M_02: 4, V_05: 4, V_06: 5, O_05: 6, V_07: 4, V_08: 5, O_06: 3, M_03: 6 } },
    { tier: 3, words: { S_03: 5, S_04: 6, C_02: 8, V_09: 8, V_10: 7, M_04: 7, S_05: 6, V_11: 8 } },
    {
      tier: 4,
      words: { O_07: 7, V_12: 8, O_08: 8, O_09: 9, O_10: 7, S_06: 8, S_07: 9, O_11: 8, C_03: 9 },
    },
    {
      tier: 5,
      words: { O_12: 9, S_08: 9, V_13: 9, S_09: 8, O_13: 10, O_14: 10, M_05: 10, V_14: 10 },
    },
  ];
  for (const group of tiers)
    for (const [id, complexity] of Object.entries(group.words)) {
      it(`${id} belongs to tier ${group.tier} with complexity ${complexity}`, () => {
        expect(WORDS[id]).toMatchObject({ tier: group.tier, complexity });
      });
    }
  it('contains only the closed inventory of 45 grammatical tokens', () => {
    expect(WORD_ORDER).toHaveLength(45);
    expect(
      ['S', 'V', 'O', 'M', 'C'].map(
        (kind) => WORD_ORDER.filter((id) => WORDS[id].kind === kind).length,
      ),
    ).toEqual([9, 14, 14, 5, 3]);
    expect(WORDS.V_06.recipe).toEqual(['V_03', 'O_02', 'O_02']);
    expect(WORDS.O_05.recipe).toEqual(['V_06', 'O_03']);
    expect(WORDS.O_05.alternatives).toContainEqual(['O_03']);
    expect(WORDS.O_13.recipe).toEqual(['V_08', 'O_03', 'O_07', 'O_08']);
  });
});

describe('GDD resource identity, nutrition, spoilage and fractional global wear', () => {
  const resources: [Resource, string, number, number, number][] = [
    ['food', 'RES_BERRY', 25, 0.5, 0],
    ['meat', 'RES_MEAT_RAW', 40, 0.6, 0],
    ['cooked', 'RES_MEAT_COOK', 60, 0.25, 0],
    ['stone', 'RES_STONE', 0, 0, 0],
    ['wood', 'RES_WOOD', 0, 0.05, 0],
    ['pelt', 'RES_PELT', 0, 0.1, 0],
    ['seed', 'RES_SEED', 0, 0.2, 0],
    ['ore', 'RES_METAL_ORE', 0, 0, 0],
    ['ingot', 'RES_INGOT', 0, 0, 0],
    ['tool', 'ITEM_LITHIC', 0, 0, 0.1],
    ['spear', 'ITEM_SPEAR', 0, 0, 0.05],
    ['pottery', 'ITEM_POTTERY', 0, 0, 0],
    ['metalArms', 'ITEM_METAL_ARM', 0, 0, 0.02],
    ['coin', 'RES_COIN', 0, 0, 0],
  ];
  it.each(resources)(
    '%s preserves the actual source item, nutrition and loss rates',
    (key, id, nutrition, spoil, wear) => {
      expect(RESOURCE_SPECS[key]).toMatchObject({ id, nutrition, spoil, wear });
    },
  );
  it.each([
    ['food', 25],
    ['meat', 40],
    ['cooked', 60],
  ] as const)('%s is consumed with its own source nutrition', (resource, nutrition) => {
    const s = createGame();
    const u = s.units[0];
    u.x = s.home.x;
    u.y = s.home.y;
    u.hunger = 80;
    s.resources[resource] = 1;
    expect(consume(s, u)).toBe(true);
    expect(u.hunger).toBe(80 - nutrition);
    expect(s.resources[resource]).toBe(0);
  });
  it('multiplies seasonal spoilage modifiers instead of replacing source rates', () => {
    expect(resourceSpoilage(0.5)).toBe(0.5);
    expect(resourceSpoilage(0.5, true)).toBe(0.75);
    expect(resourceSpoilage(0.5, false, true)).toBe(0.4);
    expect(resourceSpoilage(0.5, false, false, true)).toBe(0.25);
    expect(resourceSpoilage(0.5, true, true, true)).toBeCloseTo(0.3, 8);
    expect(resourceSpoilage(0.6, true)).toBeCloseTo(0.9, 8);
  });
  it('uses one shared 30-item ground pile, including food and material, with no currency limit', () => {
    const s = createGame();
    s.resources.food = 12;
    s.resources.stone = 18;
    expect(freeCapacity(s, 'wood')).toBe(0);
    expect(freeCapacity(s, 'meat')).toBe(0);
    expect(freeCapacity(s, 'coin')).toBe(Infinity);
  });
  it('dedicated stores stack by food and material category and count seeds as food', () => {
    const s = createGame();
    createBuilding(s, 'storage');
    createBuilding(s, 'storage');
    createBuilding(s, 'depot');
    expect(freeCapacity(s, 'food')).toBe(400);
    expect(freeCapacity(s, 'seed')).toBe(400);
    expect(freeCapacity(s, 'stone')).toBe(500);
  });
});

describe('GDD climate and physical equations', () => {
  it.each([
    [0, 55, 45, 0.5, -0.5],
    [1, 75, 55, 2.5, 0.5],
    [2, 50, 35, 0, -1.5],
    [3, 20, 5, -3, -4.5],
  ])(
    'season %s preserves exact temperatures and unprotected thermal deltas',
    (season, day, night, dayDelta, nightDelta) => {
      expect(SEASON_TEMPERATURES[season]).toEqual({ day, night });
      expect(bodyTemperatureDelta(day)).toBeCloseTo(dayDelta, 8);
      expect(bodyTemperatureDelta(night)).toBeCloseTo(nightDelta, 8);
    },
  );
  it('adds warmth to ambient cooling rather than granting instant temperature recovery', () => {
    expect(bodyTemperatureDelta(5, 3, 1)).toBe(-0.5);
    expect(bodyTemperatureDelta(5, 3, 2.5)).toBe(1);
    expect(bodyTemperatureDelta(-10)).toBe(-6);
  });
  it.each([
    [14, 0],
    [15, 0.12],
    [18, 0.48],
    [22, 0.96],
    [23, 1],
  ] as const)('age %s uses final senile mortality %s', (age, probability) => {
    expect(senileDeathProbability(age)).toBeCloseTo(probability, 8);
  });
  it('computes births from each eligible pair, housing pressure and explicit hut bonus', () => {
    expect(birthProbability(5, 10)).toBe(0.125);
    expect(birthProbability(10, 10)).toBe(0);
    expect(birthProbability(5, 10, 0.25)).toBe(0.15625);
  });
  it('combines actual weapon, strength, morale, armor and cover in the source damage equation', () => {
    expect(effectiveDamage(5, 8)).toBe(9);
    expect(effectiveDamage(15, 8, 0.7, 0.15, 0.4)).toBeCloseTo(6.783, 8);
    expect(effectiveDamage(40, 5, 1.5, 0.5, 0.8)).toBeCloseTo(6.375, 8);
    expect(effectiveDamage(5, 1, 0.7, 0.99, 0.99)).toBe(1);
  });
});

describe('GDD cognition, oral memory and actual Attention units', () => {
  it('uses the explicit later Intelligence/5 multiplier and .05 exponential environmental kernel', () => {
    expect(cognitiveTension([{ time: 0, weight: 50 }], 4, 0)).toBe(40);
    expect(cognitiveTension([{ time: 0, weight: 50 }], 9, 0)).toBe(90);
    expect(cognitiveTension([{ time: 0, weight: 100 }], 5, 20)).toBeCloseTo(36.787944117, 8);
  });
  it('keeps the last 60 seconds only and excludes events from the future', () => {
    expect(cognitiveTension([{ time: 0, weight: 100 }], 5, 60)).toBeCloseTo(4.9787068368, 8);
    expect(cognitiveTension([{ time: 0, weight: 100 }], 5, 60.001)).toBe(0);
    expect(cognitiveTension([{ time: 61, weight: 100 }], 5, 60)).toBe(0);
  });
  it('sums simultaneous actual experiences within one mind', () => {
    expect(
      cognitiveTension(
        [
          { time: 10, weight: 50 },
          { time: 10, weight: 25 },
          { time: 10, weight: 15 },
        ],
        8,
        10,
      ),
    ).toBe(144);
  });
  it('implements the explicit later five-work-cycle patch separately from the environmental decay decision', () => {
    const s = createGame(),
      u = s.units[0];
    remember(s, 'O_02');
    for (let i = 0; i < 4; i++) {
      s.time = i * 2;
      recordCraft(s, u, 'V_06');
      evaluateDiscoveries(s, u);
    }
    expect(s.sparks.some((p) => p.wordId === 'V_06')).toBe(false);
    s.time = 8;
    recordCraft(s, u, 'V_06');
    evaluateDiscoveries(s, u);
    expect(s.sparks.find((p) => p.wordId === 'V_06')?.recipe).toEqual(['V_03', 'O_02', 'O_02']);
    expect(u.tension?.V_06).toBe(100);
  });
  it('uses 1.5 per use, normalized ten-Attention investment and 3 per complexity', () => {
    expect(retentionDelta(2, 1, 4)).toBe(1);
    expect(retentionDelta(0, 0, 4, 0.95)).toBeCloseTo(-0.6, 8);
    expect(retentionDelta(0, 0, 10, 1)).toBe(0);
  });
  it('does not award a hidden retention bonus for pronouncing an order', () => {
    const s = createGame();
    s.tier = 1;
    remember(s, 'O_02');
    const next = issueCommand(s, ['S_01', 'V_03', 'O_02']);
    expect(next.stats.commands).toBe(1);
    expect(next.words.O_02.uses).toBe(1);
    expect(next.words.O_02.retention).toBe(50);
  });
  it('does not grant a 270-second memory grace period', () => {
    const s = createGame();
    remember(s, 'O_05');
    s.time = 90;
    finishSeasonMemory(s);
    expect(s.words.O_05.retention).toBe(32);
    expect(INNATE_WORDS.map((id) => s.words[id].retention)).toEqual([100, 100, 100, 100]);
  });
  it('charges ten actual Attention for ten retention once, not twice across campfire dismissal', () => {
    const s = createGame();
    remember(s, 'S_02');
    remember(s, 'O_05');
    createBuilding(s, 'campfire');
    s.attention = 10;
    s.campfirePending = true;
    const taught = teachWord(s, 'S_02');
    expect(taught.attention).toBe(0);
    expect(taught.words.S_02.retention).toBe(60);
    expect(taught.words.S_02.custodians).toHaveLength(2);
    expect(taught.words.S_02.custodians).toContain(s.units[6].id);
    const ended = dismissCampfire(taught);
    expect(ended.words.S_02.retention).toBe(57);
  });
  it('losing the last real custodian erases the word, while two custodians halve retention', () => {
    const s = createGame();
    remember(s, 'O_03', 80, [s.units[0].id, s.units[1].id]);
    remember(s, 'O_02', 80, [s.units[0].id]);
    killUnit(s, s.units[0]);
    expect(s.words.O_03.retention).toBe(40);
    expect(s.words.O_02.retention).toBe(0);
    expect(custodianLoss(90, 3)).toBeCloseTo(60, 8);
    expect(custodianLoss(50, 1)).toBe(0);
  });
  it('computes Attention with no guaranteed ten-point floor', () => {
    expect(attentionPoints(0, 0, 20)).toBe(0);
    expect(attentionPoints(10, 1, 20)).toBe(40);
    expect(attentionPoints(50, 4, 0)).toBe(100);
    expect(attentionPoints(100, 0, 0, 250)).toBe(250);
  });
  it('keeps the documented oral-overflow units decision visible and makes Writing discoverable', () => {
    expect(Object.values(WORDS).reduce((sum, w) => sum + w.complexity, 0)).toBe(252);
    // Final teaching rule: 100 actual Attention / 10 per normalized investment × beta10 = 100 memory restoration.
    expect(retentionDelta(0, 100 / 10, 0)).toBe(100);
    const s = createGame();
    for (const id of WORD_ORDER) if (id !== 'O_09') remember(s, id);
    s.time = 100;
    simulationStep(s, 0.25);
    simulationStep(s, 0.25);
    expect(s.units.some((u) => u.eventMemory?.some((e) => e.tag === 'ENV_ORAL_OVERFLOW'))).toBe(
      true,
    );
    expect(s.sparks.some((p) => p.wordId === 'O_09')).toBe(true);
  });
  it('does not award free construction or wood for merely discovering Fire', () => {
    const s = createGame();
    remember(s, 'O_03');
    s.sparks.push({
      id: 'gdd-fire',
      wordId: 'O_05',
      unitId: s.units[0].id,
      eventLabel: 'ENV_LIGHTNING_FIRE',
      expiresAt: 45,
      recipe: ['O_03'],
      hint: 'Legno e fulmine',
    });
    const next = solveSpark(s, 'gdd-fire', ['O_03']);
    expect(next.words.O_05.retention).toBe(50);
    expect(next.resources.wood).toBe(0);
    expect(next.buildings.some((b) => b.kind === 'campfire')).toBe(false);
  });
});

describe('GDD building register, staffing and actual maximum-HP upkeep', () => {
  const buildings: [BuildingKind, string, number, number][] = [
    ['campfire', 'BLD_01', 100, 1],
    ['storage', 'BLD_02', 150, 0],
    ['depot', 'BLD_03', 150, 0],
    ['menhir', 'BLD_04', 500, 0],
    ['stele', 'BLD_05', 400, 0],
    ['farm', 'BLD_06', 100, 3],
    ['pen', 'BLD_07', 200, 2],
    ['foundry', 'BLD_08', 300, 4],
    ['hut', 'BLD_09', 150, 0],
    ['palisade', 'BLD_10', 400, 0],
    ['house', 'BLD_11', 400, 0],
    ['grave', 'BLD_12', 500, 1],
    ['temple', 'BLD_13', 800, 3],
    ['walls', 'BLD_14', 2000, 0],
    ['archive', 'BLD_15', 350, 4],
    ['palace', 'BLD_16', 1200, 2],
    ['market', 'BLD_17', 300, 3],
    ['court', 'BLD_18', 500, 2],
    ['school', 'BLD_19', 400, 4],
    ['workshop', 'BLD_20', 400, 4],
  ];
  it.each(buildings)('%s has source ID %s, HP %s and workers %s', (kind, id, maxHp, workers) => {
    expect(BUILDING_SPECS[kind]).toMatchObject({ id, maxHp, workers });
  });
  it('keeps exactly twenty distinct buildings and source construction costs', () => {
    expect(BUILDING_ORDER).toHaveLength(20);
    expect(new Set(BUILDING_ORDER.map((k) => BUILDING_SPECS[k].id)).size).toBe(20);
    expect(BUILDING_SPECS.campfire.cost).toEqual({ wood: 5 });
    expect(BUILDING_SPECS.menhir.cost).toEqual({ stone: 20 });
    expect(BUILDING_SPECS.hut.cost).toEqual({ wood: 10, pelt: 5 });
    expect(BUILDING_SPECS.house.cost).toEqual({ stone: 20, wood: 10 });
    expect(BUILDING_SPECS.archive.cost).toEqual({ stone: 50, wood: 20 });
    expect(BUILDING_SPECS.workshop.cost).toEqual({ wood: 40, ingot: 20 });
  });
  // Source unified register rows1417–1568; workshop split inherits row19 (A-14).
  const physicalCosts: [BuildingKind, Partial<Inventory>, Partial<Inventory>][] = [
    ['campfire', { wood: 5 }, { wood: 2 }],
    ['storage', { wood: 10 }, {}],
    ['depot', { wood: 5 }, {}],
    ['menhir', { stone: 20 }, {}],
    ['stele', { stone: 50 }, {}],
    ['farm', { seed: 5 }, { seed: 1 }],
    ['pen', { wood: 20 }, { food: 5 }],
    ['foundry', { stone: 30, wood: 10 }, { wood: 5 }],
    ['hut', { wood: 10, pelt: 5 }, { wood: 1 }],
    ['palisade', { wood: 25 }, { wood: 2 }],
    ['house', { stone: 20, wood: 10 }, { stone: 1 }],
    ['grave', { stone: 30 }, {}],
    ['temple', { stone: 100 }, { food: 5 }],
    ['walls', { stone: 150 }, { stone: 5 }],
    ['archive', { stone: 50, wood: 20 }, { coin: 10 }],
    ['palace', { stone: 100, ingot: 30 }, { coin: 25 }],
    ['market', { wood: 30, stone: 20 }, { coin: 5 }],
    ['court', { stone: 60 }, { coin: 15 }],
    ['school', { stone: 80 }, { coin: 20 }],
    ['workshop', { wood: 40, ingot: 20 }, { coin: 20 }],
  ];
  it.each(physicalCosts)(
    '%s preserves source construction and recurring resource costs',
    (kind, cost, upkeep) => {
      expect(BUILDING_SPECS[kind].cost).toEqual(cost);
      expect(BUILDING_SPECS[kind].upkeep).toEqual(upkeep);
    },
  );
  it('retains the stone alternative for storage and season-specific farm/pen maintenance', () => {
    expect(BUILDING_SPECS.storage.alternativeCost).toEqual({ stone: 10 });
    expect(BUILDING_SPECS.farm.upkeepSeason).toBe(0);
    expect(BUILDING_SPECS.pen.upkeepSeason).toBe(3);
  });
  it('scales actual building effect by occupied slots and keeps passive buildings fully effective', () => {
    expect(buildingEfficiency(1, 3)).toBeCloseTo(1 / 3, 8);
    expect(buildingEfficiency(0, 3)).toBe(0);
    expect(buildingEfficiency(0, 0)).toBe(1);
  });
  it('loses twenty percent of maximum HP on unpaid upkeep, not twenty flat HP', () => {
    const s = createGame();
    s.units = s.units.filter((u) => u.age < 14);
    const b = createBuilding(s, 'palisade');
    s.time = 90;
    seasonalCore(s);
    expect(b.hp).toBe(320);
    expect(b.active).toBe(false);
  });
});

describe('GDD tiers, irreversible history, logistics and finite world formulae', () => {
  it('preserves exact slot and permanent-rule limits including six-slot cap', () => {
    expect([...MAX_SLOTS]).toEqual([2, 3, 4, 5, 6, 6]);
    expect([...TRADITION_LIMITS]).toEqual([0, 0, 0, 3, 5, 8]);
    expect([...LAW_LIMITS]).toEqual([0, 0, 0, 0, 3, 6]);
  });
  it('requires a Tier1 catalyst as well as two discoveries', () => {
    const s = createGame();
    remember(s, 'O_02');
    remember(s, 'O_03');
    advanceTier(s);
    expect(s.tier).toBe(0);
    remember(s, 'S_02');
    advanceTier(s);
    expect(s.tier).toBe(1);
  });
  it('requires eight stable words, not merely eight discovered words, for Tier2', () => {
    const s = createGame();
    s.tier = 1;
    for (const id of ['S_02', 'O_02', 'O_03']) remember(s, id, 50);
    remember(s, 'O_05', 49);
    advanceTier(s);
    expect(s.tier).toBe(1);
    s.words.O_05.retention = 50;
    advanceTier(s);
    expect(s.tier).toBe(2);
  });
  it('applies loss and restoration of exactly one rightmost cognitive slot', () => {
    const s = createGame();
    s.tier = 5;
    s.lockedSlot = true;
    expect(cognitiveSlots(s)).toBe(5);
    s.lockedSlot = false;
    expect(cognitiveSlots(s)).toBe(6);
  });
  it('calcifies sacred history by exactly eight percent per season', () => {
    expect(dogmaWeight(0)).toBe(10);
    expect(dogmaWeight(1)).toBe(10.8);
    expect(dogmaWeight(3)).toBeCloseTo(12.59712, 8);
  });
  it('uses Jaccard set similarity, not overlap divided by either vocabulary alone', () => {
    expect(mutualIntelligibility(['a', 'b', 'c', 'd'], ['c', 'd', 'e', 'f'])).toBeCloseTo(
      100 / 3,
      8,
    );
    expect(mutualIntelligibility(['a', 'a'], ['a'])).toBe(100);
    expect(mutualIntelligibility(['a'], ['b'])).toBe(0);
  });
  it('applies court and machine factors multiplicatively before the .8 corruption cap', () => {
    expect(corruptionRate(1)).toBe(0.15);
    expect(corruptionRate(6)).toBe(0.8);
    expect(corruptionRate(4, true)).toBe(0.3);
    expect(corruptionRate(4, false, true)).toBe(0.42);
    expect(corruptionRate(4, true, true)).toBe(0.21);
  });
  it('never recreates extinct fauna through logistic reproduction', () => {
    expect(faunaGrowth(0, 0.2, 20)).toBe(0);
    expect(faunaGrowth(20, 0.2, 20)).toBe(0);
    expect(faunaGrowth(10, 0.2, 20)).toBe(1);
  });
  it('keeps the closed fourteen-resource inventory separate and initially empty', () => {
    const r = emptyInventory();
    expect(Object.keys(r)).toHaveLength(14);
    expect(Object.values(r)).toEqual(Array(14).fill(0));
  });
});
