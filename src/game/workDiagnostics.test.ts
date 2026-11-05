import { describe, expect, it } from 'vitest';
import { createGame, issueCommand, tick } from './engine';
import { BUILDING_SPECS, HOME, WORD_ORDER } from './content';
import {
  getBuildingWorkStatus,
  getUnitWorkStatus,
  matchesTribeFilter,
  matchesTribeTask,
} from './workDiagnostics';
import type { Building, MapEntity, Resource } from './types';
import { resolveInteractionPosition } from './interactionPositions';

function fixture() {
  const s = createGame(6842, 'guided');
  // Prepared 90-second scenes preserve the legacy Guided save rules.
  delete s.openingBalanceVersion;
  delete s.openingCouncilsCompleted;
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
  it('follows a real haul from walking to gathering and carrying without crediting stocks early', () => {
    let state = fixture();
    state.units = state.units.slice(0, 1);
    state.units[0].knows = [...WORD_ORDER];
    state.paused = false;
    state.time = 20;
    state.resources.wood = 0;
    state.entities = [
      { id: 'haul-tree', kind: 'tree', x: HOME.x + 15, y: HOME.y, amount: 20, hp: 100, maxHp: 100 },
    ];
    state = issueCommand(state, ['S_01', 'V_04', 'O_03'], {
      type: 'entity',
      ...state.entities[0],
    });
    expect(getUnitWorkStatus(state, state.units[0]).title).toBe('Va a raccogliere legno');
    let worked = false;
    let carried = false;
    for (let i = 0; i < 120; i++) {
      state = tick(state, 0.25);
      const unit = state.units[0];
      if (unit.action === 'gathering' && unit.progress > 0) {
        expect(getUnitWorkStatus(state, unit).title).toBe('Raccoglie legno');
        expect(state.resources.wood).toBe(0);
        worked = true;
      }
      if (unit.action === 'returning' && unit.carry) {
        expect(getUnitWorkStatus(state, unit).title).toBe('Porta legno al campo');
        expect(state.resources.wood).toBe(0);
        carried = true;
        break;
      }
    }
    expect(worked).toBe(true);
    expect(carried).toBe(true);
  });

  it.each([
    ['tree', 'wood', 'V_03', 'Estrae legno'],
    ['stone', 'stone', 'V_03', 'Estrae pietra'],
    ['ore', 'ore', 'V_03', 'Estrae minerale'],
    ['tree', 'wood', 'V_04', 'Raccoglie legno'],
    ['ground', 'stone', 'V_04', 'Raccoglie pietra'],
    ['berries', 'food', 'V_04', 'Raccoglie bacche'],
    ['deer', 'meat', 'V_04', 'Raccoglie carne cruda'],
  ] as const)(
    'names the actual %s work and distinguishes its travel phase',
    (kind, resource, verb, title) => {
      const state = fixture();
      const unit = state.units[0];
      const source: MapEntity = {
        id: 'source',
        kind,
        resource,
        x: HOME.x + 10,
        y: HOME.y,
        amount: 20,
        maxAmount: 20,
        hp: kind === 'deer' ? 0 : 100,
        maxHp: 100,
      };
      state.entities.push(source);
      Object.assign(unit, { action: 'gathering', targetId: source.id, command: ['S_01', verb] });
      const before = structuredClone(state);
      const travelling = getUnitWorkStatus(state, unit);
      expect(travelling.title).toMatch(/^Va a /);
      expect(travelling.target?.id).toBe(source.id);
      expect(state).toEqual(before);
      const positionKind =
        kind === 'tree' ? 'tree' : ['stone', 'ore'].includes(kind) ? 'stone' : 'forage';
      const place = resolveInteractionPosition(state, unit, source, {
        kind: positionKind,
        key: `${positionKind}:${source.id}`,
      });
      Object.assign(unit, { x: place.x, y: place.y });
      const working = getUnitWorkStatus(state, unit);
      expect(working.title).toBe(title);
      expect(working.detail).toContain(verb === 'V_03' ? 'resta a terra' : 'alla consegna');
    },
  );

  it('uses the actual cargo, including before Numero, and does not claim an empty return delivers goods', () => {
    const state = fixture();
    delete state.words.O_08;
    const unit = state.units[0];
    unit.action = 'returning';
    unit.command = ['S_01', 'V_04', 'O_02'];
    unit.carry = { resource: 'wood', amount: 3 };
    expect(getUnitWorkStatus(state, unit).title).toBe('Porta legno al campo');
    expect(getUnitWorkStatus(state, unit).detail).not.toMatch(/\d|pietra/);
    unit.carry = { resource: 'wood', amount: 0 };
    expect(getUnitWorkStatus(state, unit).title).toBe('Torna al campo');
    unit.carry = undefined;
    expect(getUnitWorkStatus(state, unit).title).toBe('Torna al campo');
  });

  it.each([
    ['wood', 'O_03'],
    ['stone', 'O_02'],
    ['food', 'O_04'],
    ['meat', 'O_04'],
    ['ore', 'O_07'],
    ['ingot', 'O_07'],
    ['metalArms', 'V_12'],
  ] as const)(
    'keeps unknown %s anonymous in both gathering and carried cargo',
    (resource, word) => {
      const state = fixture();
      delete state.words[word];
      const unit = state.units[0];
      const source: MapEntity = {
        id: 'pile',
        kind: 'ground',
        resource: resource as Resource,
        ...HOME,
        amount: 5,
        maxAmount: 5,
        hp: 1,
        maxHp: 1,
      };
      state.entities.push(source);
      Object.assign(unit, { action: 'gathering', command: ['S_01', 'V_04'], targetId: source.id });
      expect(getUnitWorkStatus(state, unit).title).toBe('Va a raccogliere materiale');
      unit.action = 'returning';
      unit.carry = { resource, amount: 2 };
      expect(getUnitWorkStatus(state, unit).title).toBe('Porta materiale al campo');
      expect(getUnitWorkStatus(state, unit).detail).toContain('Carico in viaggio: materiale.');
    },
  );

  it('does not reveal an auto-selected source or its fullness beyond explored land', () => {
    const state = fixture();
    const source: MapEntity = {
      id: 'hidden-ore',
      kind: 'ore',
      x: 410,
      y: 410,
      amount: 0,
      hp: 0,
      maxHp: 100,
    };
    state.entities.push(source);
    Object.assign(state.units[0], {
      action: 'gathering',
      targetId: source.id,
      command: ['S_01', 'V_04', 'O_03'],
    });
    const status = getUnitWorkStatus(state, state.units[0]);
    expect(status.title).toBe('Raggiunge una fonte');
    expect(status.detail).toContain('terre inesplorate');
    expect(status.target).toBeUndefined();
    expect(JSON.stringify(status)).not.toMatch(/legno|minerale|esaurito|410/);
  });

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
  it('asks a repeating cook for actual meat instead of describing a stone craft', () => {
    const state = fixture();
    const unit = state.units[0];
    unit.action = 'cooking';
    unit.command = ['S_01', 'V_07', 'O_04', 'O_05'];
    unit.craftNeedsPayment = true;
    const before = structuredClone(state);
    const status = getUnitWorkStatus(state, unit);
    expect(status.title).toBe('Prepara il prossimo pasto');
    expect(status.detail).toContain('carne');
    expect(status.detail).toContain('Falò acceso');
    expect(status.detail).not.toContain('pietra');
    expect(state).toEqual(before);
  });
});
