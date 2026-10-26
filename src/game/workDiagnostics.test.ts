import { describe, expect, it } from 'vitest';
import { createGame, issueCommand, tick } from './engine';
import { BUILDING_SPECS, HOME, WORD_ORDER } from './content';
import {
  getBuildingWorkStatus,
  getUnitWorkStatus,
  matchesTribeFilter,
  matchesTribeTask,
} from './workDiagnostics';
import type { Building } from './types';

function fixture() {
  const s = createGame(6842, 'guided');
  s.started = true;
  s.tier = 3;
  s.units = s.units.slice(0, 2);
  s.entities = [];
  s.cities = [];
  s.factions = [];
  s.buildings = [];
  for (const u of s.units)
    Object.assign(u, { ...HOME, age: 6, hunger: 0, temp: 100, action: 'idle' });
  for (const id of WORD_ORDER)
    s.words[id] = { retention: 100, custodians: s.units.map((u) => u.id), uses: 0 };
  const farm: Building = {
    id: 'farm',
    kind: 'farm',
    ...HOME,
    active: true,
    completed: true,
    hp: BUILDING_SPECS.farm.maxHp,
    workerIds: [],
  };
  s.buildings.push(farm);
  return s;
}

describe('work diagnostics observe actual assignment and needs', () => {
  it('distinguishes idle, minors, a real assignment and travel before contribution', () => {
    let s = fixture();
    expect(getUnitWorkStatus(s, s.units[0]).category).toBe('idle');
    s.units[1].age = 1;
    expect(getUnitWorkStatus(s, s.units[1]).category).toBe('young');
    s = issueCommand(s, ['S_01', 'V_09', 'O_04', 'O_01'], {
      type: 'building',
      id: 'farm',
      ...HOME,
    });
    s.units[0].x = 230;
    expect(getUnitWorkStatus(s, s.units[0]).title).toContain('Raggiunge');
    expect(getBuildingWorkStatus(s, s.buildings[0])).toMatchObject({
      assigned: 1,
      contributing: 0,
      required: 3,
    });
    s.units[0].x = 250;
    expect(getBuildingWorkStatus(s, s.buildings[0]).contributing).toBe(1);
  });
  it('explains an actual night suspension and preserves the saved job', () => {
    let s = fixture();
    s.time = 59.8;
    s = issueCommand(s, ['S_01', 'V_09', 'O_04', 'O_01'], {
      type: 'building',
      id: 'farm',
      ...HOME,
    });
    s = tick(s, 0.25);
    const before = structuredClone(s),
      status = getUnitWorkStatus(s, s.units[0]);
    expect(status.assignment?.state).toBe('suspended');
    expect(status.detail).toContain('fuori turno');
    expect(getBuildingWorkStatus(s, s.buildings[0]).suspended).toBe(2);
    expect(s).toEqual(before);
  });
  it('counts hungry, cold and walking staff as assigned but not productive', () => {
    const s = fixture();
    const [a, b] = s.units;
    for (const u of [a, b]) {
      u.jobBuildingId = 'farm';
      u.action = 'working';
    }
    s.buildings[0].workerIds = [a.id, b.id];
    a.hunger = 76;
    b.temp = 20;
    expect(getBuildingWorkStatus(s, s.buildings[0])).toMatchObject({
      assigned: 2,
      contributing: 0,
    });
    expect(getUnitWorkStatus(s, a).tone).toBe('warning');
  });
  it('does not call an unfinished building a maintained workplace', () => {
    const s = fixture();
    s.buildings[0].completed = false;
    expect(getBuildingWorkStatus(s, s.buildings[0]).reasons).toContain(
      'Costruzione in corso: non produce ancora.',
    );
    expect(getBuildingWorkStatus(s, s.buildings[0]).healthy).toBe(false);
  });
  it('checks actual foundry mode inputs and livestock rather than a generic inactive label', () => {
    const s = fixture();
    const b = s.buildings[0];
    b.kind = 'foundry';
    s.resources.ore = 0;
    expect(getBuildingWorkStatus(s, b).reasons.join(' ')).toContain('minerale e legna');
    b.kind = 'pen';
    b.livestock = 0;
    expect(getBuildingWorkStatus(s, b).reasons.join(' ')).toContain('non contiene bestiame');
  });
  it('lets a player filter observable urgency separately from current work', () => {
    const s = fixture(),
      u = s.units[0];
    u.hunger = 80;
    expect(matchesTribeFilter(s, u, 'urgent', new Set())).toBe(true);
    expect(matchesTribeFilter(s, u, 'idle', new Set())).toBe(true);
    expect(matchesTribeFilter(s, u, 'custodians', new Set([u.id]))).toBe(true);
    expect(matchesTribeFilter(s, u, 'young', new Set())).toBe(false);
  });
  it('keeps a real transport and a paused building assignment findable by activity', () => {
    const s = fixture(),
      unit = s.units[0];
    unit.command = ['S_01', 'V_04', 'O_03'];
    unit.action = 'gathering';
    expect(matchesTribeTask(unit, 'transport')).toBe(true);
    unit.command = undefined;
    unit.action = 'eating';
    unit.suspendedJob = { buildingId: 'farm', command: ['S_01', 'V_09', 'O_04', 'O_01'] };
    expect(matchesTribeTask(unit, 'assigned')).toBe(true);
    expect(matchesTribeTask(unit, 'transport')).toBe(false);
  });
});
