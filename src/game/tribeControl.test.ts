import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, HOME, WORD_ORDER, emptyInventory } from './content';
import { createGame, inscribeDogma, issueCommand, tick } from './engine';
import {
  allAdultsAnchor,
  recallTribe,
  selectableTribeAdults,
  tribeRecallDestination,
} from './tribeControl';

function village(mode: 'guided' | 'classic' = 'guided') {
  const s = createGame(6842, mode);
  Object.assign(s, {
    started: true,
    paused: false,
    tier: 3,
    time: 20,
    cities: [],
    factions: [],
    entities: [],
    buildings: [],
    resources: emptyInventory(),
  });
  s.units = s.units.slice(0, 4);
  for (const unit of s.units)
    Object.assign(unit, {
      ...HOME,
      age: 6,
      hp: 100,
      hunger: 0,
      temp: 100,
      action: 'idle',
      progress: 0,
    });
  for (const id of WORD_ORDER)
    s.words[id] = { retention: 100, custodians: s.units.map((u) => u.id), uses: 0 };
  return s;
}

describe('explicit village selection and physical recall', () => {
  it('preserves the nearby radius and permits an explicit whole-adult scope', () => {
    const s = village();
    s.units[1].x = 290;
    s.units[2].x = 320;
    s.units[3].age = 1;
    const near = issueCommand(s, ['S_01', 'V_01'], { type: 'point', x: 250, y: 250 });
    const all = issueCommand(
      s,
      ['S_01', 'V_01'],
      { type: 'point', x: 250, y: 250 },
      undefined,
      allAdultsAnchor(s),
    );
    expect(near.units.filter((u) => u.command).map((u) => u.id)).toEqual([s.units[0].id]);
    expect(all.units.filter((u) => u.command).map((u) => u.id)).toEqual(
      s.units.slice(0, 3).map((u) => u.id),
    );
  });
  it('never calls children, visitors, city residents or people on real missions away from their roles', () => {
    const s = village();
    const original = s.units[0];
    s.units = [
      original,
      ...[
        'child',
        'visitor',
        'city',
        'delegate',
        'frontline',
        'returning-soldier',
        'settler',
        'merchant',
      ].map((id) => ({ ...structuredClone(original), id })),
    ];
    s.units[1].age = 1;
    s.units[2].factionId = 'foreign';
    s.units[3].cityId = 'capital';
    s.units[4].action = 'delegating';
    s.units[5].action = 'frontline';
    s.units[6].action = 'frontline-returning';
    s.units[7].action = 'colonizing';
    s.units[8].action = 'trading';
    expect(selectableTribeAdults(s).map((u) => u.id)).toEqual([original.id]);
    const called = recallTribe(s);
    expect(called.units.slice(1)).toEqual(s.units.slice(1));
  });
  it('pays one real Voice and moves all eligible adults without requiring the unknown word Qui', () => {
    const s = village();
    delete s.words.O_01;
    for (const [index, unit] of s.units.entries()) unit.x = 280 + index * 5;
    const called = recallTribe(s);
    expect(called.voice).toBe(s.voice - 1);
    expect(called.stats.commands).toBe(1);
    expect(called.units.every((u) => u.action === 'moving')).toBe(true);
    expect(called.units.map((u) => u.x)).toEqual(s.units.map((u) => u.x));
    const walked = tick(called, 0.25);
    expect(walked.units.every((u, i) => u.x < called.units[i].x && u.x > HOME.x)).toBe(true);
    expect(walked.resources).toEqual(s.resources);
  });
  it('leaves interrupted cargo on the real ground, without crediting delivered supplies', () => {
    const s = village();
    Object.assign(s.units[0], {
      x: 290,
      action: 'returning',
      carry: { resource: 'wood', amount: 3 },
      command: ['S_01', 'V_04', 'O_03'],
    });
    const called = recallTribe(s);
    expect(called.resources.wood).toBe(0);
    expect(called.units[0].carry).toBeUndefined();
    expect(called.entities).toContainEqual(
      expect.objectContaining({ kind: 'ground', resource: 'wood', amount: 3, x: 290, y: 250 }),
    );
    expect(s.units[0].carry?.amount).toBe(3);
  });
  it('uses actual warm protection near camp instead of an inactive or distant fake refuge', () => {
    const s = village();
    s.time = 335;
    s.buildings = [
      {
        id: 'warm',
        kind: 'campfire',
        x: 260,
        y: 250,
        hp: BUILDING_SPECS.campfire.maxHp,
        active: true,
        completed: true,
      },
      { id: 'cold', kind: 'house', ...HOME, hp: 400, active: false, completed: true },
      { id: 'far', kind: 'house', x: 350, y: 250, hp: 400, active: true, completed: true },
    ];
    const target = tribeRecallDestination(s);
    expect(target).toMatchObject({ type: 'point', x: 260, y: 250 });
    const called = recallTribe(s);
    expect(called.units.every((u) => u.tx === 260 && u.ty === 250)).toBe(true);
  });
  it('respects real Voice exhaustion, a pending council and urban controls', () => {
    const s = village();
    s.voice = 0;
    const rejected = recallTribe(s);
    expect(rejected.stats.commands).toBe(0);
    expect(rejected.units).toEqual(s.units);
    s.voice = 3;
    s.campfirePending = true;
    expect(recallTribe(s)).toBe(s);
    s.campfirePending = false;
    s.urbanized = true;
    expect(selectableTribeAdults(s)).toEqual([]);
    expect(recallTribe(s)).toBe(s);
  });
  it('does not bypass an actual movement prohibition through the recall shortcut', () => {
    let s = village();
    s.buildings = [
      { id: 'menhir', kind: 'menhir', ...HOME, hp: 500, active: true, completed: true },
    ];
    s = inscribeDogma(s, 'S_01', 'M_01');
    expect(s.dogmas).toHaveLength(1);
    const rejected = recallTribe(s);
    expect(rejected.stats.commands).toBe(s.stats.commands);
    expect(rejected.voice).toBe(s.voice);
    expect(rejected.units).toEqual(s.units);
  });
  it('keeps a cold safe retreat controllable and physical', () => {
    let s = village();
    s.time = 335;
    s.units = s.units.slice(0, 1);
    Object.assign(s.units[0], { x: 270, temp: 14, hp: 100 });
    s.buildings = [
      { id: 'fire', kind: 'campfire', ...HOME, hp: 100, active: true, completed: true },
    ];
    s = recallTribe(s);
    const oldX = s.units[0].x;
    s = tick(s, 0.25);
    expect(s.units[0].x).toBeLessThan(oldX);
    expect(s.units[0].x).toBeGreaterThan(250);
    expect(s.units[0].command).toEqual(['S_01', 'V_01']);
  });
});
