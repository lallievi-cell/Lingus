import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, HOME, WORD_ORDER, emptyInventory } from './content';
import { createGame, issueCommand, tick } from './engine';
import { appendTaskOutcomes, observeTaskOutcomes, type TaskOutcome } from './taskOutcomes';

function fixture(mode: 'guided' | 'classic' = 'guided', people = 1) {
  const s = createGame(6842, mode);
  // Prepared 90-second scenes preserve the legacy Guided save rules.
  delete s.openingBalanceVersion;
  delete s.openingCouncilsCompleted;
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
  s.units = s.units.slice(0, people);
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

describe('task feedback observes real transitions without inventing work or restarting it', () => {
  it('reports a real completed Classic craft exactly once', () => {
    let s = fixture('classic');
    s.resources.stone = 2;
    s = issueCommand(s, ['S_01', 'V_06', 'O_02']);
    for (let i = 0; i < 19; i++) s = tick(s, 0.25);
    const before = structuredClone(s),
      next = tick(s, 0.25);
    const events = observeTaskOutcomes(s, next);
    expect(next.resources.tool).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0].reason).toBe('completed');
    expect(events[0].tokens).toEqual(['S_01', 'V_06', 'O_02']);
    expect(s).toEqual(before);
    expect(observeTaskOutcomes(next, tick(next, 0.25))).toEqual([]);
  });
  it('recognizes exhaustion after the final physical delivery rather than at extraction', () => {
    let s = fixture();
    s.entities = [{ id: 'tree', kind: 'tree', x: 254, y: 250, amount: 1, hp: 100, maxHp: 100 }];
    s = issueCommand(s, ['S_01', 'V_04', 'O_03'], { type: 'entity', id: 'tree', x: 254, y: 250 });
    let events: TaskOutcome[] = [];
    for (let step = 0; step < 100 && !events.length; step++) {
      const next = tick(s, 0.25);
      events = observeTaskOutcomes(s, next);
      s = next;
    }
    expect(events).toHaveLength(1);
    expect(events[0].reason).toBe('exhausted');
    expect(s.resources.wood).toBe(1);
    expect(s.units[0].carry).toBeUndefined();
  });
  it('groups an actual night suspension and preserves the saved job', () => {
    let s = fixture('guided', 3);
    s.time = 59.75;
    s.buildings = [
      {
        id: 'farm',
        kind: 'farm',
        ...HOME,
        hp: BUILDING_SPECS.farm.maxHp,
        active: true,
        completed: true,
        workerIds: [],
      },
    ];
    s = issueCommand(s, ['S_01', 'V_09', 'O_04', 'O_01'], {
      type: 'building',
      id: 'farm',
      ...HOME,
    });
    const next = tick(s, 0.25),
      events = observeTaskOutcomes(s, next);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      reason: 'rest',
      suspended: true,
      unitIds: s.units.map((u) => u.id),
    });
    expect(next.units.every((u) => u.suspendedJob?.buildingId === 'farm')).toBe(true);
  });
  it('explains real starvation interruption and never treats a cancelled builder as completed', () => {
    let s = fixture();
    s.resources.stone = 20;
    s.resources.wood = 10;
    s = issueCommand(s, ['S_01', 'V_08', 'O_02', 'O_01'], { type: 'point', ...HOME });
    s.units[0].hunger = 99;
    const next = tick(s, 0.25),
      events = observeTaskOutcomes(s, next);
    expect(next.buildings).toHaveLength(0);
    expect(events[0]?.reason).not.toBe('completed');
  });
  it('does not report manual reassignment, dead actors or an idle unit alone', () => {
    const initial = fixture();
    expect(observeTaskOutcomes(initial, tick(initial, 0.25))).toEqual([]);
    const s = issueCommand(initial, ['S_01', 'V_01'], { type: 'point', x: 260, y: 250 });
    expect(
      observeTaskOutcomes(s, issueCommand(s, ['S_01', 'V_01'], { type: 'point', x: 240, y: 250 })),
    ).toEqual([]);
    const next = structuredClone(s);
    next.time += 0.25;
    next.units[0].hp = 0;
    next.units[0].command = undefined;
    expect(observeTaskOutcomes(s, next)).toEqual([]);
  });
  it('explains actual early cold rescues at the warning threshold of each mode', () => {
    for (const mode of ['guided', 'classic'] as const) {
      let s = fixture(mode);
      s.time = 335;
      s.resources.stone = 2;
      s.units[0].x = 270;
      s.units[0].temp = mode === 'guided' ? 39 : 29;
      s.buildings = [
        { id: 'fire', kind: 'campfire', ...HOME, hp: 100, active: true, completed: true },
      ];
      s = issueCommand(s, ['S_01', 'V_06', 'O_02'], undefined, undefined, {
        type: 'point',
        x: 270,
        y: 250,
      });
      expect(s.units[0].command).toEqual(['S_01', 'V_06', 'O_02']);
      const next = tick(s, 0.25);
      expect(next.units[0].action).toBe('resting');
      expect(next.units[0].x).toBeLessThan(s.units[0].x);
      expect(next.resources.tool).toBe(0);
      expect(observeTaskOutcomes(s, next)[0]?.reason).toBe('cold');
    }
  });
  it('keeps local history bounded and deduplicates the same observed event', () => {
    let s = fixture('classic');
    s.resources.stone = 2;
    s = issueCommand(s, ['S_01', 'V_06', 'O_02']);
    for (let i = 0; i < 19; i++) s = tick(s, 0.25);
    const incoming = observeTaskOutcomes(s, tick(s, 0.25));
    expect(incoming).toHaveLength(1);
    expect(appendTaskOutcomes(incoming, incoming)).toHaveLength(1);
    const many = Array.from({ length: 20 }, (_, index) => ({
      ...incoming[0],
      id: `event-${index}`,
    }));
    expect(appendTaskOutcomes([], many)).toHaveLength(8);
  });
});
