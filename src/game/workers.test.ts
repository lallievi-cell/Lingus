import { describe, expect, it } from 'vitest';
import {
  createGame,
  createReadyBuilding,
  dismissCampfire,
  issueCommand,
  parseGame,
  serializeGame,
  tick,
} from './engine';
import { HOME } from './content';
import { buildingEfficiency } from './runtime';
import { seasonalCore } from './simulation';
import type { GameState } from './types';

/** These fixtures isolate real public orders and elapsed work, not an ordinary campaign. */
function village(time = 180) {
  const s = createGame(6842);
  Object.assign(s, { started: true, tier: 3, time, entities: [], cities: [], factions: [] });
  for (const u of s.units)
    Object.assign(u, {
      ...HOME,
      age: 6,
      hp: 100,
      hunger: 0,
      temp: 100,
      action: 'idle',
      progress: 0,
    });
  for (const id of ['S_02', 'C_01', 'C_02', 'V_09', 'O_04', 'O_01']) {
    s.words[id] = { retention: 100, custodians: s.units.map((u) => u.id), uses: 0 };
    for (const u of s.units) if (!u.knows.includes(id)) u.knows.push(id);
  }
  for (const kind of ['farm', 'campfire', 'house', 'storage', 'depot'] as const)
    createReadyBuilding(s, kind);
  // Actual food and upkeep supplies keep this test about work and sleep.
  Object.assign(s.resources, { cooked: 100, seed: 10, wood: 100, stone: 100 });
  return s;
}
function advance(state: GameState, seconds: number) {
  let s = state;
  for (let remaining = seconds; remaining > 1e-8; ) {
    if (s.campfirePending) s = dismissCampfire(s);
    const step = Math.min(1, remaining);
    s = tick(s, step);
    remaining -= step;
  }
  return s;
}
function order(s: GameState, tokens = ['S_01', 'V_09', 'O_04'], executorId?: string) {
  const farm = s.buildings.find((b) => b.kind === 'farm')!;
  return issueCommand(
    s,
    tokens,
    { type: 'building', id: farm.id, x: farm.x, y: farm.y },
    executorId,
    { type: 'point', x: farm.x, y: farm.y },
  );
}
function farm(s: GameState) {
  return s.buildings.find((b) => b.kind === 'farm')!;
}

describe('village work, rest and seasonal production', () => {
  it('keeps an ordinary job while its workers sleep, and harvests their actual autumn work', () => {
    let s = order(village());
    s = advance(s, 60);
    expect(farm(s).workerIds).toEqual([]);
    expect(buildingEfficiency(s, farm(s))).toBe(0);
    expect(s.units.filter((u) => u.suspendedJob?.buildingId === farm(s).id)).toHaveLength(3);
    s = advance(s, 5);
    expect(s.units.every((u) => u.sleptThisNight)).toBe(true);
    s = advance(s, 25);
    expect(s.resources.food).toBeCloseTo(50);
    expect(farm(s).lastEfficiency).toBeCloseTo(1);
    expect(farm(s).workerIds).toHaveLength(3);
    expect(
      s.units.filter((u) => u.jobBuildingId === farm(s).id).every((u) => !u.suspendedJob),
    ).toBe(true);
    for (const u of s.units.slice(0, 3))
      expect(s.eventTimes[`legal-work:2:${u.id}:V_09:O_04`]).toBeCloseTo(50 / 3);
  });

  it('lets all seven people sleep with an Always order, including those outside the three slots', () => {
    let s = order(village(), ['C_02', 'S_01', 'V_09', 'O_04']);
    s = advance(s, 64);
    expect(s.units.every((u) => u.action === 'sleeping' && u.sleptThisNight)).toBe(true);
    expect(farm(s).workerIds).toEqual([]);
    s = advance(s, 26);
    expect(s.resources.food).toBeCloseTo((50 * 59.75) / 60);
    expect(farm(s).workerIds).toHaveLength(3);
  });

  it('stops an unfinished recurring extraction at night and resumes the tradition next day', () => {
    let s = village(235);
    s.entities.push({ id: 'tree', kind: 'tree', ...HOME, hp: 100, maxHp: 100, amount: 1000 });
    s.words.O_03 = { retention: 100, custodians: [s.units[0].id], uses: 0 };
    for (const u of s.units) u.knows.push('O_03');
    s = issueCommand(s, ['C_02', 'S_01', 'V_03', 'O_03']);
    s = advance(s, 5);
    const afterDay = s.entities[0].amount;
    s = advance(s, 5);
    expect(s.entities[0].amount).toBe(afterDay);
    expect(s.units.every((u) => u.action === 'sleeping' && u.restedThisSeason)).toBe(true);
    s = advance(s, 25);
    expect(s.units.filter((u) => u.age >= 4).every((u) => u.action === 'gathering')).toBe(true);
  });

  it('finishes a real carried delivery home before resting rather than discarding its load', () => {
    let s = village(232);
    s.entities.push({
      id: 'tree',
      kind: 'tree',
      x: HOME.x + 15,
      y: HOME.y,
      hp: 100,
      maxHp: 100,
      amount: 1000,
    });
    for (const id of ['O_03', 'V_04']) {
      s.words[id] = { retention: 100, custodians: [s.units[0].id], uses: 0 };
      for (const u of s.units) u.knows.push(id);
    }
    s = issueCommand(s, ['C_02', 'S_01', 'V_04', 'O_03']);
    const carriedBy = new Set<string>();
    const physicalWood = (current: GameState) =>
      current.resources.wood +
      current.entities.reduce(
        (total, entity) =>
          total + (entity.kind === 'tree' || entity.resource === 'wood' ? entity.amount : 0),
        0,
      ) +
      current.units.reduce(
        (total, unit) => total + (unit.carry?.resource === 'wood' ? unit.carry.amount : 0),
        0,
      );
    for (let elapsed = 0; elapsed < 8 && carriedBy.size < 7; elapsed += 0.25) {
      s = advance(s, 0.25);
      for (const unit of s.units)
        if (unit.carry?.resource === 'wood') {
          expect(unit.action).toBe('returning');
          expect(unit.carry.amount).toBe(1);
          carriedBy.add(unit.id);
        }
      expect(physicalWood(s)).toBe(1100);
    }
    expect(carriedBy.size).toBe(7);
    s = advance(s, 240 - s.time);
    expect(s.units.some((u) => u.carry?.resource === 'wood' && u.action === 'returning')).toBe(
      true,
    );
    for (
      let elapsed = 0;
      elapsed < 12 && !s.units.every((u) => !u.carry && u.action === 'sleeping');
      elapsed += 0.25
    ) {
      s = advance(s, 0.25);
      expect(physicalWood(s)).toBe(1100);
    }
    expect(s.resources.wood).toBe(107);
    expect(s.entities.find((e) => e.id === 'tree')?.amount).toBe(993);
    expect(s.units.every((u) => !u.carry && u.action === 'sleeping')).toBe(true);
  });

  it('temporarily suspends a daytime job under the night taboo instead of deleting it', () => {
    let s = village(235);
    s.dogmas.push({
      id: 'night-taboo',
      targetId: 'C_01',
      vectorId: 'M_01',
      name: 'Tabù delle Tenebre',
      description: 'Riposo obbligatorio',
      age: 0,
      weight: 10,
    });
    s = advance(order(s), 8);
    expect(farm(s).workerIds).toEqual([]);
    expect(s.units.slice(0, 3).every((u) => u.suspendedJob && u.action === 'sleeping')).toBe(true);
    s = advance(s, 27);
    expect(farm(s).workerIds).toHaveLength(3);
  });

  it('preserves a suspended job while its worker actually walks home and returns after rest', () => {
    let s = village();
    farm(s).x = HOME.x + 30;
    for (const u of s.units) u.x = HOME.x + 30;
    s = order(s);
    s = advance(s, 61);
    expect(s.units[0].action).toBe('resting');
    expect(s.units[0].suspendedJob?.buildingId).toBe(farm(s).id);
    expect(s.units[0].jobBuildingId).toBeUndefined();
    s = advance(s, 20);
    expect(s.units[0].action).toBe('sleeping');
    expect(s.units[0].suspendedJob?.buildingId).toBe(farm(s).id);
    s = advance(s, 9);
    expect(s.units[0].jobBuildingId).toBe(farm(s).id);
    expect(s.units[0].x).toBeLessThan(farm(s).x);
  });

  it('resumes after a real meal but a new direct order cancels the old assignment', () => {
    let s = order(village(200));
    s.units[0].hunger = 74.9;
    s = advance(s, 0.25);
    expect(s.units[0].hunger).toBeLessThan(20);
    expect(s.units[0].suspendedJob?.buildingId).toBe(farm(s).id);
    expect(farm(s).workerIds).not.toContain(s.units[0].id);
    s = advance(s, 0.25);
    expect(s.units[0].jobBuildingId).toBe(farm(s).id);
    s = advance(s, 39.5);
    expect(s.units[0].suspendedJob).toBeDefined();
    s = issueCommand(s, ['S_02', 'V_01'], { type: 'point', ...HOME }, s.units[0].id);
    expect(s.units[0].suspendedJob).toBeUndefined();
  });

  it.each([
    [210, 3, 25],
    [180, 1, 50 / 3],
  ])('pays only earned autumn work from t=%s with %s workers', (time, count, expected) => {
    let s = village(time);
    s = count === 1 ? order(s, ['S_02', 'V_09', 'O_04'], s.units[0].id) : order(s);
    s = advance(s, 270 - time);
    expect(s.resources.food).toBeCloseTo(expected);
  });

  it('counts an explicit 30-second night shift without treating it as a full ordinary shift', () => {
    let s = order(village(239.75), ['C_01', 'S_01', 'V_09', 'O_04']);
    s = advance(s, 30.25);
    expect(s.resources.food).toBeCloseTo(25);
    expect(farm(s).lastEfficiency).toBeCloseTo(0.5);
  });

  it('caps day plus night work at the specified full seasonal yield', () => {
    let s = advance(order(village()), 60);
    s = order(s, ['C_01', 'S_01', 'V_09', 'O_04']);
    s = advance(s, 30);
    expect(farm(s).seasonWork?.['2'].efficiencySeconds).toBeGreaterThan(80);
    expect(s.resources.food).toBeCloseTo(50);
  });

  it('credits each original worked phrase even after a different order at the season boundary', () => {
    let s = order(village(), ['S_01', 'V_09', 'O_04', 'O_01']);
    s = advance(s, 30);
    s = order(s, ['S_02', 'V_09', 'O_04'], s.units[0].id);
    s = advance(s, 59.75);
    s = issueCommand(s, ['S_02', 'V_01'], { type: 'point', ...HOME }, s.units[0].id);
    s = advance(s, 0.25);
    expect(s.resources.food).toBeCloseTo(50);
    expect(s.eventTimes[`legal-work:2:${s.units[0].id}:V_09:O_04`]).toBeCloseTo(50 / 3);
    expect(s.eventTimes[`legal-work:2:${s.units[0].id}:V_09:O_01`]).toBeCloseTo(50 / 6);
    expect(s.eventTimes[`legal-work:2:${s.units[1].id}:V_09:O_01`]).toBeCloseTo(50 / 3);
    expect(s.eventTimes[`legal-work:2:${s.units[0].id}:V_01:O_04`]).toBeUndefined();
  });

  it('lets Veglia move real rest into daytime and the ordinary recurring job into nighttime', () => {
    let s = village(200);
    s.dogmas.push({
      id: 'night-watch',
      targetId: 'C_01',
      vectorId: 'C_02',
      name: 'Veglia',
      description: 'Riposo diurno',
      age: 0,
      weight: 10,
    });
    s = order(s, ['C_02', 'S_01', 'V_09', 'O_04']);
    s = advance(s, 4);
    expect(s.units.every((u) => u.action === 'sleeping' && u.restedThisSeason)).toBe(true);
    expect(s.units.some((u) => u.sleptThisNight)).toBe(false);
    s = advance(s, 36);
    expect(farm(s).workerIds).toHaveLength(3);
  });

  it.each([
    ['C_02', 235, 5, 30],
    ['C_01', 239.75, 30.25, 60],
  ] as const)(
    'does not resurrect a removed %s tradition from a suspended assignment',
    (condition, time, first, rest) => {
      let s = advance(order(village(time), [condition, 'S_01', 'V_09', 'O_04']), first);
      expect(s.units.some((u) => u.suspendedJob)).toBe(true);
      s.traditions = [];
      s = advance(s, rest);
      expect(farm(s).workerIds).toEqual([]);
      expect(s.units.some((u) => u.suspendedJob)).toBe(false);
    },
  );

  it.each([
    [1, 20, 5],
    [0, 0, 0],
  ])(
    'a livestock pen with %s real livestock settles its earned meat and pelts after normal rest',
    (livestock, meat, pelt) => {
      let s = village();
      const pen = createReadyBuilding(s, 'pen');
      pen.livestock = livestock;
      s.words.V_10 = { retention: 100, custodians: [s.units[0].id], uses: 0 };
      for (const u of s.units) u.knows.push('V_10');
      s = issueCommand(s, ['S_01', 'V_10', 'O_04'], { type: 'building', id: pen.id, ...HOME });
      s = advance(s, 90);
      expect(s.resources.meat).toBeCloseTo(meat);
      expect(s.resources.pelt).toBeCloseTo(pelt);
    },
  );

  it('keeps a worked temple contribution when its sages sleep before the campfire', () => {
    let s = village();
    const temple = createReadyBuilding(s, 'temple');
    s.resources.food = 5;
    for (const u of s.units) u.intelligence = 8;
    for (const id of ['V_08', 'O_02', 'M_03']) {
      s.words[id] = { retention: 100, custodians: [s.units[0].id], uses: 0 };
      for (const u of s.units) u.knows.push(id);
    }
    s = issueCommand(s, ['S_01', 'V_08', 'O_02', 'M_03'], {
      type: 'building',
      id: temple.id,
      ...HOME,
    });
    s = advance(s, 90);
    expect(s.attention).toBeCloseTo(20);
    expect(s.buildings.find((b) => b.id === temple.id)?.lastEfficiency).toBe(1);
  });

  it('checks a new prohibitive law before a suspended direct worker resumes', () => {
    let s = advance(order(village(235)), 5);
    createReadyBuilding(s, 'court');
    s.laws.push({
      id: 'stop-farming',
      name: 'Agricoltura vietata',
      tokens: ['S_01', 'V_09', 'O_04', 'M_01', 'C_03', 'V_03'],
      subjectId: 'S_01',
      verbId: 'V_09',
      objectId: 'O_04',
      modifierId: 'M_01',
      sanctionId: 'V_03',
      prohibitive: true,
      age: 0,
    });
    s = advance(s, 30);
    expect(s.units[0].hp).toBe(60);
    expect(s.units[0].jobBuildingId).toBeUndefined();
    expect(s.units[0].suspendedJob).toBeUndefined();
    expect(farm(s).workerIds).toEqual([]);
  });

  it('excludes children and unqualified workers from recurring building jobs', () => {
    let s = village(200);
    s.units[0].age = 2;
    s = advance(order(s, ['C_02', 'S_01', 'V_09', 'O_04']), 0.5);
    expect(farm(s).workerIds).not.toContain(s.units[0].id);
    expect(farm(s).seasonWork?.['2'].workerSeconds[s.units[0].id]).toBeUndefined();
    s = village(200);
    const archive = createReadyBuilding(s, 'archive');
    for (const id of ['V_05', 'O_09']) {
      s.words[id] = { retention: 100, custodians: [s.units[0].id], uses: 0 };
      for (const u of s.units) u.knows.push(id);
    }
    for (const u of s.units) u.intelligence = 5;
    s.units[1].intelligence = 8;
    s = issueCommand(s, ['C_02', 'S_01', 'V_05', 'O_09']);
    s = advance(s, 0.5);
    expect(s.buildings.find((b) => b.id === archive.id)?.workerIds).toEqual([s.units[1].id]);
  });

  it('does not mint a harvest from a command at the boundary, a journey, or an invalid workplace', () => {
    const instantaneous = order(village(270));
    seasonalCore(instantaneous);
    expect(instantaneous.resources.food).toBe(0);
    for (const state of ['far', 'inactive', 'incomplete'] as const) {
      let s = order(village());
      if (state === 'far') farm(s).x = HOME.x + 300;
      if (state === 'inactive') farm(s).active = false;
      if (state === 'incomplete') farm(s).completed = false;
      s = advance(s, 90);
      expect(s.resources.food, state).toBe(0);
    }
  });

  it('keeps the earned work of the elapsed season across an overshooting public frame', () => {
    let s = order(village(210));
    s = advance(s, 59.9);
    s = advance(s, 0.2);
    expect(s.time).toBeCloseTo(270.1);
    expect(s.resources.food).toBeCloseTo(25);
    expect(farm(s).seasonWork?.['2'].efficiencySeconds).toBeCloseTo(30);
    expect(s.eventTimes[`legal-work:2:${s.units[0].id}:V_09:O_04`]).toBeCloseTo(25 / 3);
  });

  it('does not let stale reservations or a full building prevent idle units from eating', () => {
    let s = village(200);
    farm(s).workerIds = s.units.map((u) => u.id);
    for (const u of s.units) u.hunger = 80;
    s = order(s, ['C_02', 'S_01', 'V_09', 'O_04']);
    s = advance(s, 0.5);
    expect(s.units.every((u) => u.hunger < 30)).toBe(true);
    expect(farm(s).workerIds).toHaveLength(3);
  });

  it('saves actual work and suspended jobs and validates their optional nested fields', () => {
    let s = advance(order(village(235)), 10);
    const loaded = parseGame(serializeGame(s))!;
    expect(loaded).not.toBeNull();
    expect(loaded.units[0].suspendedJob).toEqual(s.units[0].suspendedJob);
    expect(farm(loaded).seasonWork).toEqual(farm(s).seasonWork);
    s = structuredClone(s);
    s.units[0].suspendedJob!.command = ['missing-word'];
    expect(parseGame(serializeGame(s))).toBeNull();
    const invalid = structuredClone(loaded);
    farm(invalid).seasonWork!['2'].commandSeconds![invalid.units[0].id]['S_01|V_09|missing-word'] =
      1;
    expect(parseGame(serializeGame(invalid))).toBeNull();
  });
});
