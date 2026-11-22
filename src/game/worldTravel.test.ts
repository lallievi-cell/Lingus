import { describe, expect, it } from 'vitest';
import { emptyInventory } from './content';
import { createGame, issueCommand, parseGame, serializeGame, tick } from './engine';
import { isDryLandPoint } from './landNavigation';
import { updateMaritime } from './maritime';
import { BOAT_BUILD_COST } from './maritimeConfig';
import { processWork } from './simulation';
import { getOrderPreview } from './orderPreview';
import { advanceWorldTransfers, worldBoundaryTargets } from './worldTravel';
import { allWorldUnits, regionProjection } from './worldRuntime';
import { validSave } from './saveValidation';
import type { Boat, GameState, Target } from './types';

const template = createGame(42, 'classic', 'random', 1000, true);
const words = ['S_01', 'V_01', 'O_01'];
function scene() {
  const state = structuredClone(template);
  state.started = true;
  state.paused = false;
  state.tier = 1;
  state.voice = 5;
  for (const id of words) {
    state.words[id] = { retention: 100, custodians: state.units.map((unit) => unit.id), uses: 0 };
    for (const unit of state.units) if (!unit.knows.includes(id)) unit.knows.push(id);
  }
  for (const unit of state.units) Object.assign(unit, { hunger: 0, temp: 100, action: 'idle' });
  return state;
}
function walker(state: GameState) {
  const unit = state.units[0];
  Object.assign(unit, { x: 980, y: 550, carry: { resource: 'fish', amount: 3 } });
  const anchor: Target = { type: 'point', x: unit.x, y: unit.y };
  const target = worldBoundaryTargets(state, '1:0', undefined, anchor)[0];
  expect(target).toBeDefined();
  return { unit, anchor, target };
}
function walkToBorder(state: GameState, unitId: string, region = '0:0') {
  const unit = state.units.find((candidate) => candidate.id === unitId)!;
  for (
    let step = 0;
    step < 100 && Math.hypot(unit.x - unit.tx!, unit.y - unit.ty!) > 1e-6;
    step++
  ) {
    const before = { x: unit.x, y: unit.y };
    processWork(state, unit, 0.25);
    expect(Math.hypot(unit.x - before.x, unit.y - before.y)).toBeLessThanOrEqual(1.000001);
    expect(state.world!.activeRegionId).toBe(region);
  }
  expect(Math.hypot(unit.x - unit.tx!, unit.y - unit.ty!)).toBeLessThan(1e-6);
}

describe('physical world border journeys', () => {
  it('prepares the actual selected group and generates no neighbour or charge', () => {
    const state = scene();
    const original = structuredClone(state);
    const { anchor, target } = walker(state);
    const before = structuredClone(state);
    expect(worldBoundaryTargets(state, '1:0', undefined, anchor)).toContainEqual(target);
    expect(
      worldBoundaryTargets(state, '1:0', undefined, { type: 'point', x: 990, y: 990 }),
    ).toEqual([]);
    expect(worldBoundaryTargets(state, '3:0', undefined, anchor)).toEqual([]);
    const preview = getOrderPreview(state, words, target, undefined, anchor);
    expect(preview.accepted).toBe(true);
    expect(preview.destinations).toEqual([target]);
    expect(preview.destinations[0].regionId).toBe('1:0');
    expect(preview.cargoDrops).toEqual([]);
    expect(preview.costs).toEqual([]);
    expect(preview.voice).toBe(1);
    expect(preview.behaviour).toContain('carichi');
    expect(preview.behaviour).toContain('soltanto all’arrivo');
    expect(preview.behaviour).toContain('le scorte lasciate qui restano qui');
    expect(state).toEqual(before);
    expect(Object.keys(state.world!.regions)).toEqual(['0:0']);
    expect(state.voice).toBe(original.voice);
  });

  it('crosses through public ticks only after walking and freezes the journey while paused', () => {
    const initial = scene();
    initial.resources.wood = 17;
    const { unit, target } = walker(initial);
    unit.x = 998;
    const anchor: Target = { type: 'point', x: unit.x, y: unit.y };
    const identities = allWorldUnits(initial)
      .map((person) => person.id)
      .sort();
    let current = issueCommand(initial, words, target, undefined, anchor);
    current = tick(current, 0.25);
    const firstStep = current.units.find((person) => person.id === unit.id)!;
    expect(firstStep.x).toBeGreaterThan(998);
    expect(firstStep.x).toBeLessThan(1000);
    expect(current.world!.activeRegionId).toBe('0:0');
    expect(Object.keys(current.world!.regions)).toEqual(['0:0']);
    current = { ...current, paused: true };
    const stopped = structuredClone(current);
    expect(tick(current, 5)).toBe(current);
    expect(current).toEqual(stopped);
    current = { ...current, paused: false };
    for (let step = 0; step < 16 && current.world!.activeRegionId === '0:0'; step++) {
      const previous = current.units.find((person) => person.id === unit.id)!;
      const globalX = previous.x + current.mapGeneration!.regionX! * 1000;
      current = tick(current, 0.25);
      const after = current.units.find((person) => person.id === unit.id)!;
      const nextGlobalX = after.x + current.mapGeneration!.regionX! * 1000;
      expect(nextGlobalX - globalX).toBeGreaterThanOrEqual(0);
      expect(nextGlobalX - globalX).toBeLessThanOrEqual(1.000001);
    }
    expect(current.world!.activeRegionId).toBe('1:0');
    expect(current.world!.transfers).toEqual([]);
    expect(current.units.find((person) => person.id === unit.id)).toMatchObject({
      x: 0,
      y: target.y,
      action: 'idle',
      carry: { resource: 'fish', amount: 3 },
    });
    expect(current.resources).toEqual(emptyInventory());
    expect(regionProjection(current, '0:0')!.resources.wood).toBe(17);
    expect(
      allWorldUnits(current)
        .map((person) => person.id)
        .sort(),
    ).toEqual(identities);
    expect(current.stats.commands).toBe(initial.stats.commands + 1);
    expect(current.voice).toBe(initial.voice - 1);
    expect(validSave(current)).toBe(true);
  });

  it('charges one accepted order, waits for real walking, then preserves identities and carried fish', () => {
    const initial = scene();
    initial.resources.wood = 17;
    const { unit, anchor, target } = walker(initial);
    const beforeIds = allWorldUnits(initial)
      .map((person) => person.id)
      .sort();
    const trace = { assignedUnitIds: [] as string[] };
    const ordered = issueCommand(initial, words, target, undefined, anchor, trace);
    expect(trace.assignedUnitIds).toEqual([unit.id]);
    expect(ordered.stats.commands).toBe(initial.stats.commands + 1);
    expect(ordered.voice).toBe(initial.voice - 1);
    expect(Object.keys(ordered.world!.regions)).toEqual(['0:0']);
    expect(validSave(ordered)).toBe(true);
    advanceWorldTransfers(ordered);
    expect(Object.keys(ordered.world!.regions)).toEqual(['0:0']);
    walkToBorder(ordered, unit.id);
    advanceWorldTransfers(ordered);
    expect(ordered.world!.activeRegionId).toBe('1:0');
    expect(ordered.world!.transfers).toEqual([]);
    expect(ordered.units.map((person) => person.id)).toEqual([unit.id]);
    expect(ordered.units[0]).toMatchObject({
      x: 0,
      y: target.y,
      action: 'idle',
      carry: { resource: 'fish', amount: 3 },
    });
    expect(ordered.home).toEqual({ x: 0, y: target.y });
    expect(isDryLandPoint(ordered, ordered.home)).toBe(true);
    expect(ordered.resources).toEqual(emptyInventory());
    expect(ordered.buildings).toEqual([]);
    expect(regionProjection(ordered, '0:0')!.resources.wood).toBe(17);
    expect(
      allWorldUnits(ordered)
        .map((person) => person.id)
        .sort(),
    ).toEqual(beforeIds);
    expect(validSave(ordered)).toBe(true);
    expect(initial.world!.activeRegionId).toBe('0:0');
  });

  it('cancels an interrupted or dead traveller without generating or granting a region', () => {
    for (const cancel of ['order', 'death'] as const) {
      const state = scene();
      const { unit, target, anchor } = walker(state);
      const ordered = issueCommand(state, words, target, undefined, anchor);
      expect(ordered.world!.transfers).toHaveLength(1);
      const person = ordered.units.find((candidate) => candidate.id === unit.id)!;
      if (cancel === 'order') person.action = 'idle';
      else person.hp = 0;
      advanceWorldTransfers(ordered);
      expect(ordered.world!.transfers).toEqual([]);
      expect(Object.keys(ordered.world!.regions)).toEqual(['0:0']);
      expect(ordered.units.find((candidate) => candidate.id === unit.id)!.carry).toEqual({
        resource: 'fish',
        amount: 3,
      });
    }
  });

  it('releases the remaining boundary order when one member of the travelling group dies', () => {
    const state = scene();
    const { unit, target, anchor } = walker(state);
    const companion = state.units[1];
    Object.assign(companion, { x: unit.x, y: unit.y + 2 });
    const ordered = issueCommand(state, words, target, undefined, anchor);
    expect(ordered.world!.transfers[0].actorIds).toEqual([unit.id, companion.id]);
    ordered.units.find((person) => person.id === unit.id)!.hp = 0;
    advanceWorldTransfers(ordered);
    expect(ordered.world!.transfers).toEqual([]);
    expect(ordered.units.find((person) => person.id === companion.id)).toMatchObject({
      action: 'idle',
      targetId: undefined,
      command: undefined,
    });
    expect(Object.keys(ordered.world!.regions)).toEqual(['0:0']);
  });

  it('releases companions omitted from a replacement journey while preserving the new order', () => {
    const state = scene();
    const { unit, target, anchor } = walker(state);
    const companion = state.units[1];
    Object.assign(companion, { x: unit.x, y: unit.y + 2 });
    state.words.S_02 = { retention: 100, custodians: [unit.id], uses: 0 };
    unit.knows.push('S_02');
    const ordered = issueCommand(state, words, target, undefined, anchor);
    expect(ordered.world!.transfers[0].actorIds).toEqual([unit.id, companion.id]);
    const nextAnchor: Target = { ...anchor, id: 'selection:custom', unitIds: [unit.id] };
    const changed = issueCommand(ordered, words, target, undefined, nextAnchor);
    expect(changed.world!.transfers).toHaveLength(1);
    expect(changed.world!.transfers[0].actorIds).toEqual([unit.id]);
    expect(changed.units.find((person) => person.id === unit.id)).toMatchObject({
      action: 'moving',
      targetId: 'world-boundary:1:0',
    });
    expect(changed.units.find((person) => person.id === companion.id)).toMatchObject({
      action: 'idle',
      targetId: undefined,
    });
  });

  it('resumes a saved crossing and returns without regenerating finite nodes or merging camp inventories', () => {
    const state = scene();
    state.resources.wood = 17;
    const { unit, target, anchor } = walker(state);
    const ordered = issueCommand(state, words, target, undefined, anchor);
    processWork(ordered, ordered.units.find((person) => person.id === unit.id)!, 0.25);
    const restored = parseGame(serializeGame(ordered));
    expect(restored).not.toBeNull();
    walkToBorder(restored!, unit.id);
    advanceWorldTransfers(restored!);
    expect(restored!.world!.activeRegionId).toBe('1:0');
    restored!.resources.fish = 5;
    const node = restored!.entities.find((entity) => entity.amount > 7)!;
    node.amount -= 7;
    const reduced = { id: node.id, amount: node.amount };
    const person = restored!.units[0];
    person.x = 20;
    const backAnchor: Target = { type: 'point', x: person.x, y: person.y };
    const back = worldBoundaryTargets(restored!, '0:0', undefined, backAnchor)[0];
    expect(back).toBeDefined();
    const returning = issueCommand(restored!, words, back, undefined, backAnchor);
    expect(returning.world!.transfers).toHaveLength(1);
    walkToBorder(returning, person.id, '1:0');
    advanceWorldTransfers(returning);
    expect(returning.world!.activeRegionId).toBe('0:0');
    expect(returning.resources.wood).toBe(17);
    expect(returning.resources.fish).toBe(state.resources.fish);
    const remote = regionProjection(returning, '1:0')!;
    expect(remote.resources.fish).toBe(5);
    expect(remote.entities.find((entity) => entity.id === reduced.id)!.amount).toBe(reduced.amount);
    expect(allWorldUnits(returning).filter((candidate) => candidate.id === person.id)).toHaveLength(
      1,
    );
    expect(validSave(returning)).toBe(true);
  });

  it('moves the paid vessel, every passenger and its exact cargo only at the actual sea edge', () => {
    const state = scene();
    const person = state.units[0];
    const boat: Boat = {
      id: 'world-test-vessel',
      x: 980,
      y: 10,
      hp: 100,
      maxHp: 100,
      ownerId: 'player',
      status: 'moored',
      passengerIds: [person.id],
      resources: { ...emptyInventory(), fish: 7, wood: 4, coin: 100 },
      paidMaterials: { ...emptyInventory(), ...BOAT_BUILD_COST },
      progress: 20,
    };
    state.boats!.push(boat);
    Object.assign(person, { x: boat.x, y: boat.y, boatId: boat.id, action: 'sailing' });
    const target = worldBoundaryTargets(state, '1:0', boat.id)[0];
    expect(target).toBeDefined();
    const ordered = issueCommand(state, words, target, undefined, {
      type: 'boat',
      id: boat.id,
      x: boat.x,
      y: boat.y,
    });
    expect(ordered.stats.commands).toBe(state.stats.commands + 1);
    expect(validSave(ordered)).toBe(true);
    advanceWorldTransfers(ordered);
    expect(Object.keys(ordered.world!.regions)).toEqual(['0:0']);
    for (let step = 0; ordered.boats![0].status === 'sailing' && step < 50; step++)
      updateMaritime(ordered, 0.25);
    expect(ordered.boats![0]).toMatchObject({ x: 1000, y: target.y, status: 'moored' });
    advanceWorldTransfers(ordered);
    expect(ordered.world!.activeRegionId).toBe('1:0');
    expect(ordered.boats).toHaveLength(1);
    expect(ordered.boats![0]).toMatchObject({
      id: boat.id,
      x: 0,
      y: target.y,
      passengerIds: [person.id],
      resources: boat.resources,
      paidMaterials: boat.paidMaterials,
    });
    expect(ordered.units).toHaveLength(1);
    expect(ordered.units[0]).toMatchObject({ id: person.id, x: 0, y: target.y, boatId: boat.id });
    expect(regionProjection(ordered, '0:0')!.boats).toEqual([]);
    expect(ordered.resources).toEqual(emptyInventory());
    expect(ordered.buildings).toEqual([]);
    expect(validSave(ordered)).toBe(true);
  });
});
