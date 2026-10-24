import { describe, expect, it } from 'vitest';
import { emptyInventory, HOME } from './content';
import { createGame, issueCommand, parseGame, serializeGame, tick } from './engine';
import { processWork } from './simulation';

function scene() {
  const s = createGame(6842, 'guided');
  Object.assign(s, {
    started: true,
    cities: [],
    factions: [],
    entities: [],
    resources: emptyInventory(),
  });
  return s;
}

describe('physical action staging', () => {
  it('chooses an eligible group artisan with materials in reach, while keeping the exact paid site', () => {
    let s = scene();
    s.units = s.units.slice(0, 2);
    s.tier = 1;
    for (const id of ['V_06', 'O_02']) {
      s.words[id] = { retention: 100, custodians: s.units.map((u) => u.id), uses: 0 };
      for (const u of s.units) u.knows.push(id);
    }
    Object.assign(s.units[0], { x: 245, y: 250 });
    Object.assign(s.units[1], { x: 259, y: 250 });
    s.entities.push({
      id: 'real-stone',
      kind: 'ground',
      resource: 'stone',
      x: 274,
      y: 250,
      amount: 1,
      hp: 0,
      maxHp: 1,
    });
    s = issueCommand(s, ['S_01', 'V_06', 'O_02']);
    expect(s.stats.commands).toBe(1);
    expect(s.units[0].action).toBe('idle');
    expect(s.units[1]).toMatchObject({ action: 'crafting', x: 259, y: 250, tx: 259, ty: 250 });
    expect(s.entities[0].amount).toBe(0);
    expect(s.resources.tool).toBe(0);
  });

  it('keeps the requested construction and planting anchors distinct from the worker feet', () => {
    const s = scene(),
      u = s.units[0];
    Object.assign(u, {
      x: 270,
      y: 260,
      action: 'building',
      buildingKind: 'storage',
      paidConstruction: { wood: 10 },
      command: ['S_01', 'V_05', 'O_04'],
      tx: 270,
      ty: 260,
      progress: 0,
    });
    processWork(s, u, 5);
    expect(s.buildings.find((b) => b.kind === 'storage')).toMatchObject({ x: 270, y: 260 });
    expect(Math.hypot(u.x - 270, u.y - 260)).toBeGreaterThan(0.5);
    Object.assign(u, {
      action: 'planting',
      command: ['S_01', 'V_09', 'O_03'],
      tx: 278,
      ty: 253,
      progress: 0,
    });
    processWork(s, u, 5);
    expect(s.entities.find((e) => e.kind === 'tree')).toMatchObject({
      x: 278,
      y: 253,
      originX: 278,
      originY: 253,
    });
    expect(Math.hypot(u.x - 278, u.y - 253)).toBeGreaterThan(0.5);
  });

  it('separates an older stacked camp into real sleeping places without losing the night cluster', () => {
    let s = scene();
    s.time = 61;
    s.resources.food = 20;
    for (const u of s.units)
      Object.assign(u, { ...HOME, action: 'sleeping', hunger: 10, temp: 100 });
    for (let i = 0; i < 20; i++) s = tick(s, 0.25);
    expect(
      s.units.every(
        (u) =>
          u.action === 'sleeping' &&
          u.sleptThisNight &&
          Math.hypot(u.x - HOME.x, u.y - HOME.y) <= 10,
      ),
    ).toBe(true);
    for (let i = 0; i < s.units.length; i++)
      for (const other of s.units.slice(i + 1))
        expect(Math.hypot(s.units[i].x - other.x, s.units[i].y - other.y)).toBeGreaterThan(0.7);
    expect(parseGame(serializeGame(s))).not.toBeNull();
  });
});
