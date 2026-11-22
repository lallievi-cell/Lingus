import { describe, expect, it } from 'vitest';
import { createGame, dismissCampfire, tick } from './engine';
import { getCalendar } from './calendar';
import { emptyInventory } from './content';
import { dogmaTargetPresent, updateWorldDogmasSeason } from './dogmas';
import {
  activateRegion,
  allWorldUnits,
  captureRegion,
  currentWorldRegionId,
  globalWorldProjection,
  regionProjection,
  runInRegion,
  regionOfUnit,
  switchWorldRegion,
} from './worldRuntime';
import type { GameState } from './types';

/** Small real simulations isolate conservation from expensive geography generation. */
function twoRegions(): GameState {
  const state = createGame(6842);
  const remote = createGame(81);
  remote.units = [{ ...structuredClone(state.units[0]), id: 'remote-person', hunger: 20 }];
  remote.entities = [];
  remote.buildings = [];
  remote.cities = [];
  remote.factions = [];
  remote.resources = emptyInventory();
  state.entities = [];
  state.cities = [];
  state.factions = [];
  state.started = true;
  state.world = {
    version: 1,
    seed: 6842,
    width: 4,
    height: 4,
    activeRegionId: '0:0',
    homeRegionId: '0:0',
    regions: {
      '0:0': { id: '0:0', x: 0, y: 0, discovered: true },
      '1:0': { id: '1:0', x: 1, y: 0, discovered: true, snapshot: captureRegion(remote) },
    },
    transfers: [],
  };
  return state;
}

describe('persistent region ownership', () => {
  it('changes observation without duplicating people or sharing camp stocks', () => {
    const state = twoRegions();
    state.resources.wood = 7;
    const homePerson = state.units[0];
    const next = switchWorldRegion(state, '1:0');
    expect(next).not.toBe(state);
    expect(state.world!.activeRegionId).toBe('0:0');
    expect(next.units.map((unit) => unit.id)).toEqual(['remote-person']);
    expect(next.resources.wood).toBe(0);
    expect(next.world!.regions['1:0'].snapshot).toBeUndefined();
    expect(allWorldUnits(next)).toHaveLength(8);
    expect(activateRegion(next, '0:0')).toBe(true);
    expect(next.resources.wood).toBe(7);
    expect(next.units[0]).toEqual(homePerson);
    expect(next.time).toBe(state.time);
    expect(next.voice).toBe(state.voice);
  });

  it('drops optional local fields and commits local and global results separately', () => {
    const state = twoRegions();
    state.boats = [];
    runInRegion(state, '1:0', (local) => {
      expect(currentWorldRegionId(local)).toBe('1:0');
      expect(regionOfUnit(local, 'remote-person')).toBe('1:0');
      expect(regionOfUnit(local, state.units[0].id)).toBe('0:0');
      expect(local.boats).toBeUndefined();
      local.resources.stone = 4;
      local.voice = 1;
      local.units = [...local.units, { ...local.units[0], id: 'remote-child', age: 0 }];
      expect(allWorldUnits(local).filter((unit) => unit.id === 'remote-child')).toHaveLength(1);
    });
    expect(state.voice).toBe(1);
    expect(state.resources.stone).toBe(0);
    expect(regionProjection(state, '1:0')!.resources.stone).toBe(4);
    expect(globalWorldProjection(state).units).toHaveLength(9);
    expect(state.boats).toEqual([]);
  });
});

describe('one world clock with material local simulation', () => {
  it('advances time and Voice once while needs continue off screen', () => {
    const state = twoRegions();
    state.voice = 0;
    state.voiceProgress = 9.75;
    const rootHunger = state.units[0].hunger;
    const next = tick(state, 0.5);
    expect(next.time).toBe(0.5);
    expect(next.voice).toBe(1);
    expect(next.voiceProgress).toBeCloseTo(0.25);
    expect(next.units[0].hunger).toBeCloseTo(rootHunger + 0.4);
    expect(regionProjection(next, '1:0')!.units[0].hunger).toBeCloseTo(20.4);
    expect(state.time).toBe(0);
    expect(state.units[0].hunger).toBe(rootHunger);
  });

  it('does not extinguish the tribe when observing an empty region', () => {
    const state = twoRegions();
    state.world!.regions['1:0'].snapshot!.units = [];
    activateRegion(state, '1:0');
    const next = tick(state, 0.25);
    expect(next.gameOver).toBeNull();
    expect(next.units).toHaveLength(0);
    expect(allWorldUnits(next).filter((unit) => unit.hp > 0)).toHaveLength(7);
  });

  it('settles seasonal counters and dogma age only once for multiple regions', () => {
    const state = twoRegions();
    state.dogmas = [
      {
        id: 'belief',
        targetId: 'O_03',
        vectorId: 'M_04',
        name: 'Proprietà',
        description: '',
        age: 2,
        weight: 10,
      },
    ];
    state.laws = [
      {
        id: 'law',
        tokens: ['S_01', 'V_09', 'O_04', 'C_02', 'C_03', 'M_04'],
        name: 'Riforma',
        subjectId: 'S_01',
        verbId: 'V_09',
        objectId: 'O_04',
        modifierId: 'C_02',
        sanctionId: 'M_04',
        prohibitive: false,
        age: 2,
      },
    ];
    state.time = getCalendar(state).seasonEnd - 0.125;
    const next = tick(state, 0.25);
    expect(next.seasonIndex).toBe(1);
    expect(next.stats.seasonsSurvived).toBe(1);
    expect(next.nightCount).toBe(1);
    expect(next.dogmas[0].age).toBe(3);
    expect(next.laws[0].age).toBe(3);
    expect(next.units[0].age).toBe(state.units[0].age + 1);
    expect(regionProjection(next, '1:0')!.units[0].age).toBe(9);
  });

  it('produces the same physical result regardless of the observed region', () => {
    const state = twoRegions();
    const away = switchWorldRegion(state, '1:0');
    const homeTick = tick(state, 0.5);
    const awayTick = tick(away, 0.5);
    expect(awayTick.time).toBe(homeTick.time);
    expect(awayTick.seed).toBe(homeTick.seed);
    expect(awayTick.voice).toBe(homeTick.voice);
    expect(allWorldUnits(awayTick)).toEqual(allWorldUnits(homeTick));
    expect(regionProjection(awayTick, '0:0')!.resources).toEqual(homeTick.resources);
  });

  it('holds one council at a distant fire and preserves the ensuing ritual attention', () => {
    const state = twoRegions();
    const remote = state.world!.regions['1:0'].snapshot!;
    remote.buildings = [
      {
        id: 'remote-fire',
        kind: 'campfire',
        x: remote.home.x,
        y: remote.home.y,
        hp: 100,
        active: true,
      },
    ];
    remote.resources.wood = 10;
    state.resources.wood = 0;
    state.dogmas = [
      {
        id: 'offering',
        targetId: 'S_01',
        vectorId: 'O_05',
        name: 'Offerta',
        description: '',
        age: 0,
        weight: 10,
      },
    ];
    state.time = getCalendar(state).seasonEnd - 0.125;
    const next = tick(state, 0.25);
    expect(next.campfirePending).toBe(true);
    expect(next.attention).toBeGreaterThanOrEqual(30);
    expect(next.stats.deaths).toBe(1);
    expect(next.world!.regions['1:0'].snapshot!.units[0].hp).toBe(0);
    expect(next.world!.regions['1:0'].snapshot!.entities.some((e) => e.kind === 'corpse')).toBe(
      true,
    );
    expect(next.entities.some((e) => e.kind === 'corpse')).toBe(false);
  });

  it('retains distant intuitions and custodians when finishing global memory', () => {
    const state = twoRegions();
    state.playMode = 'guided';
    state.sparks.push({
      id: 'remote-spark',
      wordId: 'O_03',
      unitId: 'remote-person',
      eventLabel: 'Esperienza lontana',
      hint: '',
      recipe: ['V_03'],
      expiresAt: 45,
    });
    state.words.O_03 = {
      retention: 60,
      custodians: ['remote-person'],
      uses: 0,
      investment: 0,
      support: 0,
    };
    const next = tick(state, 0.25);
    expect(next.sparks.some((spark) => spark.id === 'remote-spark')).toBe(true);
    next.campfirePending = true;
    const closed = dismissCampfire(next);
    expect(closed.words.O_03.custodians).toEqual(['remote-person']);
    expect(allWorldUnits(closed).some((unit) => unit.id === 'remote-person')).toBe(true);
  });
});

describe('regional ritual materials', () => {
  it('immolates one real distant person and leaves the corpse in that region', () => {
    const state = twoRegions();
    const remote = state.world!.regions['1:0'].snapshot!;
    remote.buildings = [
      { id: 'remote-fire', kind: 'campfire', x: 250, y: 250, hp: 100, active: true },
    ];
    state.dogmas = [
      {
        id: 'offering',
        targetId: 'S_01',
        vectorId: 'O_05',
        name: 'Offerta',
        description: '',
        age: 0,
        weight: 10,
      },
    ];
    updateWorldDogmasSeason(state);
    expect(state.dogmas[0].age).toBe(1);
    expect(state.units.every((unit) => unit.hp > 0)).toBe(true);
    expect(remote.units[0].hp).toBe(0);
    expect(state.entities.filter((entity) => entity.kind === 'corpse')).toHaveLength(0);
    expect(remote.entities.filter((entity) => entity.kind === 'corpse')).toHaveLength(1);
    expect(state.stats.deaths).toBe(1);
  });

  it('does not burn a distant corpse using another region’s wood', () => {
    const state = twoRegions();
    const remote = state.world!.regions['1:0'].snapshot!;
    state.resources.wood = 10;
    remote.entities.push({
      id: 'remote-corpse',
      kind: 'corpse',
      x: remote.home.x,
      y: remote.home.y,
      hp: 0,
      maxHp: 1,
      amount: 1,
    });
    state.dogmas = [
      {
        id: 'cremation',
        targetId: 'O_06',
        vectorId: 'O_05',
        name: 'Cremazione',
        description: '',
        age: 0,
        weight: 10,
      },
    ];
    updateWorldDogmasSeason(state);
    expect(state.resources.wood).toBe(10);
    expect(remote.entities[0].amount).toBe(1);
    remote.resources.wood = 5;
    updateWorldDogmasSeason(state);
    expect(state.resources.wood).toBe(10);
    expect(remote.resources.wood).toBe(0);
    expect(remote.entities[0].amount).toBe(0);
  });

  it('checks geographic presence in each region without superimposing coordinates', () => {
    const state = twoRegions();
    state.units = [];
    const remote = state.world!.regions['1:0'].snapshot!;
    remote.home = { x: 400, y: 400 };
    remote.units[0].x = state.home.x;
    remote.units[0].y = state.home.y;
    expect(dogmaTargetPresent(globalWorldProjection(state), 'O_01')).toBe(false);
    remote.units[0].x = 400;
    remote.units[0].y = 400;
    expect(dogmaTargetPresent(globalWorldProjection(state), 'O_01')).toBe(true);
  });
});
