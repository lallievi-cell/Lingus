import { describe, expect, it } from 'vitest';
import { targetPresentation } from '../components/targetPresentation';
import { emptyInventory, HOME } from './content';
import { createGame } from './engine';
import { processWork } from './simulation';
import { combatEquipmentFor, gatheringEquipmentFor, visibleUnitEquipment } from './unitEquipment';
import type { GameState, MapEntity, Unit } from './types';

/** These task fixtures isolate scarce equipment; they are not campaign proofs. */
function world(people = 3) {
  const state = createGame(6842);
  Object.assign(state, {
    started: true,
    time: 10,
    entities: [],
    cities: [],
    factions: [],
    resources: emptyInventory(),
  });
  state.units = state.units.slice(0, people);
  state.units.forEach((unit, index) =>
    Object.assign(unit, {
      ...HOME,
      id: `person-${index}`,
      age: 6,
      hp: 100,
      hunger: 20,
      temp: 100,
      strength: 0,
      action: 'hunting',
      progress: 0,
      command: ['S_01', 'V_03', 'O_04'],
    }),
  );
  return state;
}

function target(state: GameState, unit: Unit, kind: 'deer' | 'tree' | 'stone') {
  const entity: MapEntity = {
    id: `target-${unit.id}`,
    kind,
    ...HOME,
    amount: 100,
    hp: 100,
    maxHp: 100,
  };
  state.entities.push(entity);
  unit.targetId = entity.id;
  return entity;
}

describe('handheld equipment follows scarce real inventory', () => {
  it('uses a metal kit and a spear on different hunters, leaving the third unarmed', () => {
    const state = world();
    Object.assign(state.resources, { metalArms: 1, spear: 1 });
    const prey = state.units.map((unit) => target(state, unit, 'deer'));
    expect(state.units.map((unit) => visibleUnitEquipment(state, unit))).toEqual([
      { held: 'metal-blade', armor: 'metal' },
      { held: 'spear', armor: undefined },
      { held: undefined, armor: undefined },
    ]);
    state.units.forEach((unit) => processWork(state, unit, 1));
    expect(prey.map((entity) => entity.hp)).toEqual([60, 85, 95]);
  });

  it('reserves a tool for combat instead of accelerating a gatherer with that same tool', () => {
    const state = world(2);
    state.resources.tool = 1;
    const hunter = state.units[0],
      worker = state.units[1];
    target(state, hunter, 'deer');
    target(state, worker, 'tree');
    Object.assign(worker, { action: 'gathering', command: ['S_01', 'V_03'] });
    expect(visibleUnitEquipment(state, hunter).held).toBe('flint');
    expect(visibleUnitEquipment(state, worker).held).toBeUndefined();
    processWork(state, worker, 1.5);
    expect(state.entities.filter((entity) => entity.kind === 'ground')).toHaveLength(0);
    processWork(state, worker, 0.5);
    expect(state.entities.filter((entity) => entity.kind === 'ground')).toHaveLength(1);
    expect(state.resources.tool).toBe(1);
  });

  it('does not assign the same scarce tool to every two-word Colpire worker', () => {
    const state = world(2);
    state.resources.tool = 1;
    state.units.forEach((unit) => {
      target(state, unit, 'stone');
      Object.assign(unit, { action: 'gathering', command: ['S_01', 'V_03'] });
    });
    expect(state.units.map((unit) => visibleUnitEquipment(state, unit).held)).toEqual([
      'flint',
      undefined,
    ]);
    state.units.forEach((unit) => processWork(state, unit, 1.5));
    expect(state.entities.filter((entity) => entity.kind === 'ground')).toHaveLength(1);
    expect(state.resources.tool).toBeCloseTo(0.9);
    expect(state.units[1].progress).toBe(1.5);
  });

  it('does not show equipment for absent stock, fractional remains, children, dead or foreign people', () => {
    const state = world(1),
      unit = state.units[0];
    target(state, unit, 'deer');
    expect(visibleUnitEquipment(state, unit)).toEqual({ held: undefined, armor: undefined });
    Object.assign(state.resources, { metalArms: 0.9, spear: 0.9, tool: 0.9, pelt: 0.9 });
    expect(visibleUnitEquipment(state, unit)).toEqual({ held: undefined, armor: undefined });
    Object.assign(state.resources, { metalArms: 4, spear: 4, tool: 4, pelt: 4 });
    unit.age = 3;
    expect(visibleUnitEquipment(state, unit)).toEqual({});
    unit.age = 6;
    unit.hp = 0;
    expect(visibleUnitEquipment(state, unit)).toEqual({});
    unit.hp = 100;
    unit.factionId = 'foreign';
    expect(visibleUnitEquipment(state, unit)).toEqual({});
  });

  it('leaves idle people and food gatherers with empty hands even with tools in stock', () => {
    const state = world(1),
      unit = state.units[0],
      entity = target(state, unit, 'tree');
    Object.assign(state.resources, { metalArms: 2, spear: 2, tool: 2 });
    unit.action = 'idle';
    expect(visibleUnitEquipment(state, unit)).toEqual({});
    unit.action = 'gathering';
    Object.assign(entity, { kind: 'ground', resource: 'meat', hp: 0 });
    expect(gatheringEquipmentFor(state, unit).speed).toBe(1);
    expect(visibleUnitEquipment(state, unit)).toEqual({});
  });

  it('shows only the paid stone being worked, never a completed free tool', () => {
    const state = world(1),
      unit = state.units[0];
    Object.assign(unit, { action: 'crafting', command: ['S_01', 'V_06', 'O_02'] });
    expect(state.resources.tool).toBe(0);
    expect(visibleUnitEquipment(state, unit)).toEqual({ held: 'workpiece' });
    unit.craftNeedsPayment = true;
    expect(visibleUnitEquipment(state, unit)).toEqual({});
  });

  it('uses the hunter city inventory and charges spear wear to that real stock', () => {
    const state = world(1),
      unit = state.units[0];
    state.urbanized = true;
    unit.cityId = 'capital';
    const inventory = emptyInventory();
    inventory.spear = 2;
    state.cities.push({
      id: 'capital',
      name: 'Capital',
      ...HOME,
      sectorX: 2,
      sectorY: 2,
      factionId: 'player',
      cohorts: { workers: 1, warriors: 0, sages: 0, slaves: 0 },
      resources: inventory,
      words: [],
      dogmas: [],
      revoltTension: 0,
      housing: 10,
      buildingIds: [],
      vocations: [],
      loyalty: 100,
      assimilation: { delegateCount: 0, active: false },
      production: emptyInventory(),
      capital: true,
      garrisonHp: 0,
    });
    const prey = target(state, unit, 'deer');
    prey.hp = 10;
    expect(combatEquipmentFor(state, unit).inventory).toBe(inventory);
    expect(visibleUnitEquipment(state, unit).held).toBe('spear');
    processWork(state, unit, 1);
    expect(prey.hp).toBe(0);
    expect(inventory.spear).toBe(1.95);
    expect(state.resources.spear).toBe(0);
  });

  it('describes actual gear in target details without revealing unknown material names', () => {
    const state = world(1),
      unit = state.units[0];
    state.resources.spear = 1;
    const selected = { type: 'unit' as const, id: unit.id, x: unit.x, y: unit.y };
    expect(targetPresentation(state, selected)?.description).toContain('arma lunga');
    expect(targetPresentation(state, selected)?.description).not.toContain('lancia');
    for (const id of ['O_02', 'O_03', 'V_06'])
      state.words[id] = { retention: 100, custodians: [unit.id], uses: 0 };
    expect(targetPresentation(state, selected)?.description).toContain(
      'lancia con punta di pietra',
    );
    state.resources.spear = 0;
    expect(targetPresentation(state, selected)?.description).not.toContain(
      'Equipaggiamento in uso',
    );
  });
});
