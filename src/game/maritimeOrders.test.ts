import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, emptyInventory, RESOURCE_ORDER, WORD_ORDER } from './content';
import { createCoastGeometry, isSeaPoint } from './coastGeometry';
import { compileSentence, createGame, issueCommand } from './engine';
import { isDryLandPoint } from './landNavigation';
import { getOrderPreview } from './orderPreview';
import { BOAT_BUILD_COST } from './maritimeConfig';
import { findShoreAccess } from './shoreAccess';
import { allAdultsAnchor } from './tribeSelection';
import { snapshotTaskResultInputs } from './taskResults';
import { observeTaskOutcomes } from './taskOutcomes';
import { processWork } from './simulation';
import { updateMaritime } from './maritime';
import type { Boat, GameState, Target } from './types';

const BUILD = ['S_01', 'V_06', 'O_03', 'O_01'];
const BOARD = ['S_01', 'V_01'];
const SAIL = ['S_01', 'V_01', 'O_01'];
const LOAD = ['S_01', 'V_04', 'O_03', 'M_02'];
const UNLOAD = ['S_01', 'V_04', 'O_03', 'O_01'];

/** Paid coastal records isolate order acceptance; no campaign progress or
 * construction is fabricated by the command under test. */
function scene(count = 3) {
  const state = createGame(42, 'classic', 'random', 1000);
  state.started = true;
  state.paused = false;
  state.tier = 5;
  state.time = 15;
  state.voice = 5;
  state.entities = [];
  state.cities = [];
  state.factions = [];
  state.buildings = [];
  state.resources = { ...emptyInventory(), wood: 50, stone: 30, tool: 4, food: 10 };
  state.units = state.units.slice(0, count);
  for (const id of WORD_ORDER)
    state.words[id] = { retention: 100, uses: 0, custodians: state.units.map((unit) => unit.id) };
  for (const sector of state.sectors) sector.explored = true;
  const coast = createCoastGeometry(state)!;
  const inward = {
    x: coast.side === 'west' ? 1 : coast.side === 'east' ? -1 : 0,
    y: coast.side === 'north' ? 1 : coast.side === 'south' ? -1 : 0,
  };
  const land = coast.points
    .slice(2, -2)
    .map((point) => ({
      x: point.x + inward.x * 8,
      y: point.y + inward.y * 8,
    }))
    .find((point) => isDryLandPoint(state, point) && findShoreAccess(state, point))!;
  if (!land) throw new Error('The order fixture needs a real physical shore.');
  const water = findShoreAccess(state, land)!.water;
  const harbor = {
    id: 'harbor',
    kind: 'harbor' as const,
    ...land,
    hp: BUILDING_SPECS.harbor.maxHp,
    active: true,
    completed: true,
    seaAccess: { ...water },
  };
  const boat: Boat = {
    id: 'boat',
    ...water,
    hp: 150,
    maxHp: 150,
    ownerId: 'player',
    harborId: harbor.id,
    status: 'moored',
    passengerIds: [],
    resources: emptyInventory(),
    paidMaterials: { ...emptyInventory(), ...BOAT_BUILD_COST },
    progress: 20,
    accessLand: { ...land },
  };
  state.buildings.push(harbor);
  state.boats = [boat];
  for (const unit of state.units)
    Object.assign(unit, {
      ...land,
      age: 8,
      hp: 100,
      hunger: 0,
      temp: 100,
      action: 'idle',
      knows: [...WORD_ORDER],
    });
  return {
    state,
    boat,
    harbor,
    land,
    water,
    inward,
    anchor: { type: 'point', ...land } as Target,
    target: { type: 'boat', id: boat.id, ...water } as Target,
    harborTarget: { type: 'building', id: harbor.id, ...land } as Target,
  };
}
function embark(state: GameState, boat: Boat, count = 1) {
  for (const unit of state.units.slice(0, count)) {
    Object.assign(unit, { x: boat.x, y: boat.y, boatId: boat.id, action: 'sailing' });
    boat.passengerIds.push(unit.id);
  }
}
function unchangedOrder(before: GameState, after: GameState) {
  expect(after.voice).toBe(before.voice);
  expect(after.stats.commands).toBe(before.stats.commands);
  expect(after.resources).toEqual(before.resources);
  expect(after.units).toEqual(before.units);
  expect(after.boats).toEqual(before.boats);
  expect(after.entities).toEqual(before.entities);
  expect(after.words).toEqual(before.words);
}
function advancePhysicalWork(state: GameState, done: () => boolean) {
  for (let step = 0; step < 4000 && !done(); step++) {
    state.time += 0.25;
    for (const unit of state.units) processWork(state, unit, 0.25);
    updateMaritime(state, 0.25);
  }
  expect(done()).toBe(true);
}

describe('physical maritime orders', () => {
  it('keeps ships and harbors unavailable in worlds without maritime metadata', () => {
    const { state, harborTarget, target } = scene();
    delete state.mapGeneration!.maritimeRules;
    delete state.boats;
    for (const [tokens, selected] of [
      [BUILD, harborTarget],
      [['S_01', 'V_08', 'O_03', 'M_02'], { type: 'point', ...state.home }],
      [BOARD, target],
    ] as [string[], Target][]) {
      expect(compileSentence(state, tokens, selected).valid).toBe(false);
      unchangedOrder(state, issueCommand(state, tokens, selected));
    }
  });

  it('rejects missing Voice and words before paying a hull or interrupting a task', () => {
    const { state, harborTarget, anchor } = scene();
    state.boats = [];
    state.units[0].action = 'cooking';
    state.units[0].cookInput = 'fish';
    state.units[0].command = ['S_01', 'V_07', 'O_04', 'O_05'];
    state.voice = 0;
    unchangedOrder(state, issueCommand(state, BUILD, harborTarget, undefined, anchor));
    state.voice = 5;
    delete state.words.V_06;
    unchangedOrder(state, issueCommand(state, BUILD, harborTarget, undefined, anchor));
  });

  it('rejects an unaffordable hull before refunding paid cooking or changing builders', () => {
    const { state, harborTarget, anchor } = scene();
    state.boats = [];
    state.resources.tool = 0;
    state.units[0].action = 'cooking';
    state.units[0].cookInput = 'fish';
    state.units[0].command = ['S_01', 'V_07', 'O_04', 'O_05'];
    const next = issueCommand(state, BUILD, harborTarget, undefined, anchor);
    unchangedOrder(state, next);
    expect(next.logs[0].text).toContain('utensile');
  });

  it('pays one hull once, assigns one real artisan and resumes that hull without another charge', () => {
    const { state, harborTarget, anchor } = scene();
    state.boats = [];
    const trace = { assignedUnitIds: [] as string[] };
    const next = issueCommand(state, BUILD, harborTarget, undefined, anchor, trace);
    expect(next.voice).toBe(4);
    expect(next.stats.commands).toBe(state.stats.commands + 1);
    expect(next.resources).toMatchObject({ wood: 35, tool: 3 });
    expect(trace.assignedUnitIds).toEqual([state.units[0].id]);
    expect(next.boats).toHaveLength(1);
    expect(next.boats![0]).toMatchObject({
      status: 'building',
      progress: 0,
      builderId: state.units[0].id,
    });
    const again = issueCommand(next, BUILD, harborTarget, undefined, anchor);
    expect(again.resources).toEqual(next.resources);
    expect(again.boats).toHaveLength(1);
    expect(again.voice).toBe(3);
  });

  it('does not silently split a group that cannot fit in the three-seat boat', () => {
    const { state, target, anchor } = scene(4);
    state.units[0].carry = { resource: 'wood', amount: 2 };
    state.units[0].action = 'returning';
    state.units[0].command = ['S_01', 'V_04', 'O_03'];
    const next = issueCommand(state, BOARD, target, undefined, anchor);
    unchangedOrder(state, next);
    expect(next.logs[0].text).toContain('posti');
  });

  it('boards only the explicit Io executor and leaves the other nearby adults alone', () => {
    const { state, target, anchor } = scene(4);
    const selected = state.units[2];
    const trace = { assignedUnitIds: [] as string[] };
    const next = issueCommand(state, ['S_02', 'V_01'], target, selected.id, anchor, trace);
    expect(trace.assignedUnitIds).toEqual([selected.id]);
    expect(next.units[2]).toMatchObject({ action: 'embarking', targetBoatId: target.id });
    expect(next.units.filter((unit) => unit.action === 'embarking')).toHaveLength(1);
    expect(next.units[0]).toEqual(state.units[0]);
    expect(next.voice).toBe(4);
    expect(next.words.V_01.uses).toBe(1);
  });

  it('refunds paid fish once on accepted boarding while keeping the personal load physical', () => {
    const { state, target, anchor } = scene(1);
    Object.assign(state.units[0], {
      action: 'cooking',
      cookInput: 'fish',
      command: ['S_01', 'V_07', 'O_04', 'O_05'],
      carry: { resource: 'wood', amount: 2 },
    });
    const next = issueCommand(state, BOARD, target, undefined, anchor);
    expect(next.units[0].carry).toEqual({ resource: 'wood', amount: 2 });
    expect(next.units[0].cookInput).toBeUndefined();
    expect(
      next.entities.filter((entity) => entity.resource === 'fish').map((entity) => entity.amount),
    ).toEqual([1]);
    const again = issueCommand(next, BOARD, target, undefined, anchor);
    unchangedOrder(next, again);
  });

  it('rejects oversized carried cargo and foreign ownership without replacing tasks', () => {
    const { state, boat, target, anchor } = scene(1);
    state.units[0].carry = { resource: 'wood', amount: 21 };
    unchangedOrder(state, issueCommand(state, BOARD, target, undefined, anchor));
    state.units[0].carry.amount = 2;
    boat.ownerId = 'foreign';
    unchangedOrder(state, issueCommand(state, BOARD, target, undefined, anchor));
  });

  it('prepares a read-only boarding preview with the actual crew and live boat destination', () => {
    const { state, boat, target, anchor } = scene(2);
    const original = structuredClone(state);
    const preview = getOrderPreview(state, BOARD, target, undefined, anchor);
    expect(preview.accepted).toBe(true);
    expect(preview.unitIds).toEqual(state.units.map((unit) => unit.id));
    expect(preview.destinations).toEqual([{ type: 'boat', id: boat.id, x: boat.x, y: boat.y }]);
    expect(preview.behaviour).toContain('3 posti');
    expect(preview.behaviour).toContain('20 unità');
    expect(preview.voice).toBe(1);
    expect(preview.costs).toEqual([]);
    expect(state).toEqual(original);
    delete state.words.O_08;
    expect(getOrderPreview(state, BOARD, target, undefined, anchor).behaviour).not.toMatch(/\d/);
  });

  it('requires a real adult aboard before checking legal sanctions or consuming Voice', () => {
    const { state, target, water, inward } = scene();
    state.buildings.push({
      id: 'court',
      kind: 'court',
      ...state.home,
      hp: 100,
      active: true,
      completed: true,
    });
    state.laws.push({
      id: 'sailing-law',
      tokens: ['S_01', 'V_01', 'O_01', 'M_01', 'C_03', 'V_03'],
      name: 'law',
      subjectId: 'S_01',
      verbId: 'V_01',
      objectId: 'O_01',
      modifierId: 'M_01',
      sanctionId: 'V_03',
      prohibitive: true,
      age: 0,
    });
    const destination: Target = {
      type: 'point',
      x: water.x - inward.x * 20,
      y: water.y - inward.y * 20,
    };
    const next = issueCommand(state, SAIL, destination, undefined, target);
    unchangedOrder(state, next);
    expect(next.logs[0].text).toContain('adulto vivo a bordo');
  });

  it('sails with the actual passengers rather than selecting nearby land workers', () => {
    const { state, boat, target, water, inward } = scene(3);
    embark(state, boat, 2);
    const destination: Target = {
      type: 'point',
      x: water.x - inward.x * 20,
      y: water.y - inward.y * 20,
    };
    expect(isSeaPoint(state, destination)).toBe(true);
    const preview = getOrderPreview(state, SAIL, destination, undefined, target);
    expect(preview.accepted).toBe(true);
    expect(preview.unitIds).toEqual(boat.passengerIds);
    expect(preview.destinations).toEqual([destination]);
    const trace = { assignedUnitIds: [] as string[] };
    const next = issueCommand(state, SAIL, destination, undefined, target, trace);
    expect(trace.assignedUnitIds).toEqual(boat.passengerIds);
    expect(next.boats![0]).toMatchObject({
      status: 'sailing',
      destination: { x: destination.x, y: destination.y },
    });
    expect(next.units[2]).toEqual(state.units[2]);
    expect(next.voice).toBe(4);
  });

  it('requires explicit navigation words and an observed dry landing', () => {
    const { state, boat, target, land } = scene(1);
    embark(state, boat);
    const destination: Target = { type: 'point', ...land };
    unchangedOrder(state, issueCommand(state, BOARD, destination, undefined, target));
    state.tier = 3;
    for (const sector of state.sectors) sector.explored = false;
    state.explored = [];
    unchangedOrder(state, issueCommand(state, SAIL, destination, undefined, target));
    expect(issueCommand(state, SAIL, destination, undefined, target).logs[0].text).toContain(
      'Esplora',
    );
  });

  it('does not use an aboard Io for land orders or consume Voice on an ineffective walk', () => {
    const { state, boat, land } = scene(1);
    embark(state, boat);
    const unit = state.units[0];
    const next = issueCommand(state, ['S_02', 'V_01'], { type: 'point', ...land }, unit.id);
    unchangedOrder(state, next);
    expect(next.logs[0].text).toContain('Sbarca');
  });

  it('registers cargo work but moves no stock until the physical worker completes a trip', () => {
    const { state, boat, target, anchor } = scene(1);
    const next = issueCommand(state, LOAD, target, undefined, anchor);
    expect(next.units[0]).toMatchObject({
      action: 'loadingBoat',
      targetBoatId: boat.id,
      cargoResources: ['wood'],
    });
    expect(next.resources).toEqual(state.resources);
    expect(next.boats![0].resources).toEqual(boat.resources);
    expect(next.voice).toBe(4);
    expect(getOrderPreview(state, LOAD, target, undefined, anchor).behaviour).toContain('viaggi');
    unchangedOrder(state, issueCommand(state, UNLOAD, target, undefined, anchor));
    boat.resources.wood = 4;
    const unload = issueCommand(state, UNLOAD, target, undefined, anchor);
    expect(unload.units[0].action).toBe('unloadingBoat');
    expect(unload.boats![0].resources.wood).toBe(4);
    expect(unload.resources).toEqual(state.resources);
  });

  it('rejects cargo with no reachable source, wrong personal load, or a full hold', () => {
    const { state, boat, target, anchor } = scene(1);
    state.resources.wood = 0;
    unchangedOrder(state, issueCommand(state, LOAD, target, undefined, anchor));
    state.resources.wood = 4;
    state.units[0].carry = { resource: 'stone', amount: 1 };
    unchangedOrder(state, issueCommand(state, LOAD, target, undefined, anchor));
    state.units[0].carry = undefined;
    boat.resources.food = 20;
    unchangedOrder(state, issueCommand(state, LOAD, target, undefined, anchor));
  });

  it('selects a construction worker together with reachable inputs and the building site', () => {
    const { state } = scene(2);
    const island = createCoastGeometry(state)!.islands![0];
    const site = island.points.reduce(
      (sum, point) => ({
        x: sum.x + point.x / island.points.length,
        y: sum.y + point.y / island.points.length,
      }),
      { x: 0, y: 0 },
    );
    Object.assign(state.units[0], state.home);
    Object.assign(state.units[1], site);
    state.entities.push({
      id: 'local-stone',
      kind: 'ground',
      resource: 'stone',
      ...site,
      amount: 12,
      maxAmount: 12,
      hp: 0,
      maxHp: 1,
    });
    const trace = { assignedUnitIds: [] as string[] };
    const next = issueCommand(
      state,
      ['S_01', 'V_05', 'O_04', 'M_02'],
      { type: 'point', ...site },
      undefined,
      allAdultsAnchor(state),
      trace,
    );
    expect(next.voice).toBe(4);
    expect(trace.assignedUnitIds).toEqual([state.units[1].id]);
    expect(next.units[1]).toMatchObject({
      action: 'building',
      buildingKind: 'storage',
      paidConstruction: { stone: 10 },
    });
    expect(next.resources).toEqual(state.resources);
    expect(next.entities[0].amount).toBe(2);
  });

  it('chooses a cook with both ingredients and fire, rather than combining two disconnected adults', () => {
    const { state, land } = scene(2);
    const island = createCoastGeometry(state)!.islands![0];
    const isolated = island.points.reduce(
      (sum, point) => ({
        x: sum.x + point.x / island.points.length,
        y: sum.y + point.y / island.points.length,
      }),
      { x: 0, y: 0 },
    );
    Object.assign(state.units[0], isolated);
    Object.assign(state.units[1], land);
    state.resources.meat = 0;
    state.resources.fish = 0;
    state.entities.push({
      id: 'island-meat',
      kind: 'ground',
      resource: 'meat',
      ...isolated,
      amount: 1,
      maxAmount: 1,
      hp: 0,
      maxHp: 1,
    });
    state.buildings.push({
      id: 'mainland-fire',
      kind: 'campfire',
      ...land,
      hp: 100,
      active: true,
      completed: true,
    });
    const tokens = ['S_01', 'V_07', 'O_04', 'O_05'];
    unchangedOrder(
      state,
      issueCommand(state, tokens, undefined, undefined, allAdultsAnchor(state)),
    );
    state.resources.fish = 1;
    const trace = { assignedUnitIds: [] as string[] };
    const next = issueCommand(state, tokens, undefined, undefined, allAdultsAnchor(state), trace);
    expect(trace.assignedUnitIds).toEqual([state.units[1].id]);
    expect(next.units[1]).toMatchObject({
      action: 'cooking',
      cookInput: 'fish',
      tx: land.x,
      ty: land.y,
    });
    expect(next.units[0]).toEqual(state.units[0]);
    expect(next.entities[0].amount).toBe(1);
    expect(next.resources.fish).toBe(0);
    expect(next.voice).toBe(4);
  });
});

describe('pointed physical cargo', () => {
  it.each(RESOURCE_ORDER)(
    'selects the actual %s inventory without inventing a new word',
    (resource) => {
      const { state, boat, target, anchor } = scene(1);
      const chosen: Target = { ...target, cargoResource: resource };
      boat.resources[resource] = 1;
      const tokens = ['S_01', 'V_04', 'O_01'];
      expect(compileSentence(state, tokens, chosen).valid).toBe(true);
      const next = issueCommand(state, tokens, chosen, undefined, anchor);
      expect(next.units[0]).toMatchObject({ action: 'unloadingBoat', cargoResources: [resource] });
      expect(next.boats![0].resources).toEqual(boat.resources);
      expect(next.resources).toEqual(state.resources);
      expect(next.voice).toBe(4);
    },
  );

  it('uses the pointed resource precisely even when the phrase also names a broad class', () => {
    const { state, boat, target, anchor } = scene(1);
    boat.resources = { ...emptyInventory(), meat: 3, cooked: 4, fish: 5, cookedFish: 6 };
    const chosen: Target = { ...target, cargoResource: 'fish' };
    const next = issueCommand(state, ['S_01', 'V_04', 'O_04', 'O_01'], chosen, undefined, anchor);
    expect(next.units[0].cargoResources).toEqual(['fish']);
    advancePhysicalWork(next, () => next.units[0].carry?.resource === 'fish');
    expect(next.boats![0].resources).toMatchObject({ meat: 3, cooked: 4, fish: 0, cookedFish: 6 });
    expect(next.units[0].carry).toEqual({ resource: 'fish', amount: 5 });
    expect(next.resources).toEqual(state.resources);
  });

  it('prepares a selected unknown material without naming it or spending Voice, and rejects an absent source atomically', () => {
    const { state, target, anchor } = scene(1);
    delete state.words.V_06;
    delete state.words.O_02;
    const chosen: Target = { ...target, cargoResource: 'tool' };
    const tokens = ['S_01', 'V_04', 'M_02'];
    const original = structuredClone(state);
    const preview = getOrderPreview(state, tokens, chosen, undefined, anchor);
    expect(preview.accepted).toBe(true);
    expect(preview.costs).toEqual([]);
    expect(preview.message).not.toMatch(/utensil|pietra/i);
    expect(state).toEqual(original);
    state.resources.tool = 0;
    unchangedOrder(state, issueCommand(state, tokens, chosen, undefined, anchor));
    expect(issueCommand(state, tokens, chosen, undefined, anchor).logs[0].text).not.toMatch(
      /utensil|pietra/i,
    );
  });

  it('rejects an invalid selected cargo and a generic transfer without a selected material', () => {
    const { state, target, anchor } = scene(1);
    const tokens = ['S_01', 'V_04', 'M_02'];
    const invalid = { ...target, cargoResource: 'unobtainium' } as unknown as Target;
    expect(compileSentence(state, tokens, invalid).valid).toBe(false);
    unchangedOrder(state, issueCommand(state, tokens, invalid, undefined, anchor));
    expect(compileSentence(state, tokens, target).valid).toBe(false);
    unchangedOrder(state, issueCommand(state, tokens, target, undefined, anchor));
  });

  it('applies a material taboo to pointed cargo without requiring the material word in the phrase', () => {
    const { state, target, anchor } = scene(1);
    const chosen: Target = { ...target, cargoResource: 'wood' };
    state.dogmas.push({
      id: 'wood-taboo',
      targetId: 'O_03',
      vectorId: 'M_01',
      name: 'Il bosco sacro',
      age: 0,
      weight: 100,
      description: 'Il legno è tabù.',
    });
    const tokens = ['S_01', 'V_04', 'M_02'];
    expect(compileSentence(state, tokens, chosen).valid).toBe(false);
    const next = issueCommand(state, tokens, chosen, undefined, anchor);
    unchangedOrder(state, next);
    expect(next.logs[0].text).toContain('Il bosco sacro');
  });

  it('matches material laws against the real pointed cargo before accepting the transfer', () => {
    const { state, target, anchor } = scene(1);
    const chosen: Target = { ...target, cargoResource: 'wood' };
    state.buildings.push({
      id: 'court',
      kind: 'court',
      ...state.home,
      hp: 100,
      active: true,
      completed: true,
    });
    state.laws.push({
      id: 'wood-law',
      tokens: ['S_01', 'V_04', 'O_03', 'M_01', 'C_03', 'V_03'],
      name: 'Trasporto del legno vietato',
      subjectId: 'S_01',
      verbId: 'V_04',
      objectId: 'O_03',
      modifierId: 'M_01',
      sanctionId: 'V_03',
      prohibitive: true,
      age: 0,
    });
    const next = issueCommand(state, ['S_01', 'V_04', 'M_02'], chosen, undefined, anchor);
    expect(next.voice).toBe(state.voice);
    expect(next.stats.commands).toBe(state.stats.commands);
    expect(next.resources).toEqual(state.resources);
    expect(next.boats).toEqual(state.boats);
    expect(next.units[0].action).toBe('idle');
    expect(next.units[0].hp).toBeLessThan(state.units[0].hp);
    expect(next.words.V_04.uses).toBe(0);
  });

  it('carries one tool from home to the boat and unloads it as a real island pile after sailing and landing', () => {
    const prepared = scene(1);
    let state = prepared.state;
    state.resources.tool = 1;
    let target: Target = { ...prepared.target, cargoResource: 'tool' };
    state = issueCommand(state, ['S_01', 'V_04', 'M_02'], target, undefined, prepared.anchor);
    expect(state.resources.tool).toBe(1);
    expect(state.boats![0].resources.tool).toBe(0);
    advancePhysicalWork(state, () => state.units[0].action === 'idle');
    expect(state.resources.tool).toBe(0);
    expect(state.boats![0].resources.tool).toBe(1);
    expect(state.units[0].carry).toBeUndefined();
    state = issueCommand(state, BOARD, prepared.target, undefined, prepared.anchor);
    advancePhysicalWork(state, () => state.units[0].boatId === prepared.target.id);
    const island = createCoastGeometry(state)!.islands![0];
    const center = island.points.reduce(
      (sum, point) => ({
        x: sum.x + point.x / island.points.length,
        y: sum.y + point.y / island.points.length,
      }),
      { x: 0, y: 0 },
    );
    const shore = island.points
      .map((point) => ({
        x: (center.x + point.x) / 2,
        y: (center.y + point.y) / 2,
      }))
      .find((point) => isDryLandPoint(state, point) && findShoreAccess(state, point))!;
    expect(shore).toBeDefined();
    state = issueCommand(state, SAIL, { type: 'point', ...shore }, undefined, prepared.target);
    expect(state.boats![0].status).toBe('sailing');
    advancePhysicalWork(
      state,
      () =>
        state.boats![0].status === 'moored' &&
        !state.units[0].boatId &&
        state.boats![0].passengerIds.length === 0,
    );
    expect(state.resources.tool).toBe(0);
    expect(state.boats![0].resources.tool).toBe(1);
    expect(state.units[0].x).toBeCloseTo(shore.x, 6);
    expect(state.units[0].y).toBeCloseTo(shore.y, 6);
    target = {
      type: 'boat',
      id: state.boats![0].id,
      x: state.boats![0].x,
      y: state.boats![0].y,
      cargoResource: 'tool',
    };
    state = issueCommand(state, ['S_01', 'V_04', 'O_01'], target, undefined, {
      type: 'point',
      ...shore,
    });
    expect(state.units[0].action).toBe('unloadingBoat');
    advancePhysicalWork(state, () => state.units[0].action === 'idle');
    expect(state.resources.tool).toBe(0);
    expect(state.boats![0].resources.tool).toBe(0);
    expect(
      state.entities.filter((entity) => entity.kind === 'ground' && entity.resource === 'tool'),
    ).toEqual([expect.objectContaining({ amount: 1, x: shore.x, y: shore.y })]);
    expect(state.units[0].carry).toBeUndefined();
    expect(state.stats.commands).toBe(prepared.state.stats.commands + 4);
    expect(state.voice).toBe(1);
  });
});

describe('maritime task results', () => {
  it('keeps the pointed cargo when a completed generic order is offered for recall', () => {
    const { state, boat, land } = scene(1);
    Object.assign(state.units[0], {
      action: 'unloadingBoat',
      targetBoatId: boat.id,
      cargoResources: ['tool'],
      command: ['S_01', 'V_04', 'O_01'],
    });
    boat.resources.tool = 1;
    const previous = snapshotTaskResultInputs(state)!;
    state.time += 0.25;
    Object.assign(state.units[0], {
      action: 'idle',
      targetBoatId: undefined,
      cargoResources: undefined,
      command: undefined,
    });
    boat.resources.tool = 0;
    state.entities.push({
      id: 'delivered-tool',
      kind: 'ground',
      resource: 'tool',
      ...land,
      amount: 1,
      maxAmount: 1,
      hp: 0,
      maxHp: 1,
    });
    const result = observeTaskOutcomes(previous, state)[0];
    expect(result).toMatchObject({
      reason: 'completed',
      target: { type: 'boat', id: boat.id, cargoResource: 'tool' },
    });
    expect(result.tokens).toEqual(['S_01', 'V_04', 'O_01']);
    expect(compileSentence(state, result.tokens, result.target).valid).toBe(true);
  });

  it('snapshots mutable vessel fields and recognizes a completed paid hull', () => {
    const { state, boat } = scene(1);
    boat.status = 'building';
    boat.progress = 19.75;
    boat.builderId = state.units[0].id;
    Object.assign(state.units[0], {
      action: 'boatbuilding',
      command: BUILD,
      targetBoatId: boat.id,
    });
    const previous = snapshotTaskResultInputs(state)!;
    boat.resources.wood = 1;
    boat.passengerIds.push('other');
    boat.progress = 20;
    boat.status = 'moored';
    boat.builderId = undefined;
    state.time += 0.25;
    state.units[0].action = 'idle';
    state.units[0].command = undefined;
    expect(previous.boats![0].resources.wood).toBe(0);
    expect(previous.boats![0].passengerIds).toEqual([]);
    expect(previous.boats![0].progress).toBe(19.75);
    expect(observeTaskOutcomes(previous, state)).toEqual([
      expect.objectContaining({
        reason: 'completed',
        target: expect.objectContaining({ type: 'building', id: 'harbor' }),
      }),
    ]);
  });

  it('records a landing only after the passenger is physically ashore', () => {
    const { state, boat, land } = scene(1);
    embark(state, boat);
    boat.status = 'landing';
    boat.landing = { ...land };
    Object.assign(state.units[0], { action: 'disembarking', command: SAIL });
    const previous = snapshotTaskResultInputs(state)!;
    state.time += 0.25;
    Object.assign(state.units[0], {
      ...land,
      boatId: undefined,
      action: 'idle',
      command: undefined,
    });
    boat.passengerIds = [];
    boat.status = 'moored';
    boat.accessLand = { ...land };
    boat.landing = undefined;
    expect(observeTaskOutcomes(previous, state)).toEqual([
      expect.objectContaining({ reason: 'completed', target: { type: 'point', ...land } }),
    ]);
  });
});
