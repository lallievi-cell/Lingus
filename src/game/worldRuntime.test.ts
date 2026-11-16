import { describe, expect, it } from 'vitest';
import { createGame, dismissCampfire, tick } from './engine';
import { getCalendar } from './calendar';
import { emptyInventory } from './content';
import {
  activateRegion,
  allWorldUnits,
  captureRegion,
  globalWorldProjection,
  regionProjection,
  runInRegion,
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
    state.time = getCalendar(state).seasonEnd - 0.125;
    const next = tick(state, 0.25);
    expect(next.seasonIndex).toBe(1);
    expect(next.stats.seasonsSurvived).toBe(1);
    expect(next.nightCount).toBe(1);
    expect(next.units[0].age).toBe(state.units[0].age + 1);
    expect(regionProjection(next, '1:0')!.units[0].age).toBe(9);
  });

  it('retains distant intuitions and custodians when finishing global memory', () => {
    const state = twoRegions();
    state.playMode = 'guided';
    state.sparks.push({
      id: 'remote-spark', wordId: 'O_03', unitId: 'remote-person',
      eventLabel: 'Esperienza lontana', hint: '', recipe: ['V_03'],
      expiresAt: 45,
    });
    state.words.O_03 = {
      retention: 60, custodians: ['remote-person'], uses: 0, investment: 0, support: 0,
    };
    const next = tick(state, 0.25);
    expect(next.sparks.some((spark) => spark.id === 'remote-spark')).toBe(true);
    next.campfirePending = true;
    const closed = dismissCampfire(next);
    expect(closed.words.O_03.custodians).toEqual(['remote-person']);
    expect(allWorldUnits(closed).some((unit) => unit.id === 'remote-person')).toBe(true);
  });
});
