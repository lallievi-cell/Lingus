import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import { getGroundLight, getGroundShadows } from './mapLighting';

describe('ground lighting', () => {
  it('never reveals unknown ore, unexplored objects or an offscreen settlement', () => {
    const state = createGame(6842);
    state.entities = [
      { id: 'tree', kind: 'tree', x: 250, y: 250, hp: 100, maxHp: 100, amount: 10 },
      { id: 'ore', kind: 'ore', x: 250, y: 250, hp: 100, maxHp: 100, amount: 10 },
      { id: 'hidden', kind: 'tree', x: 150, y: 150, hp: 100, maxHp: 100, amount: 10 },
    ];
    state.buildings = [{ id: 'far', kind: 'hut', x: 290, y: 290, hp: 100, active: true }];
    state.words.O_07 = { retention: 0, custodians: [], uses: 0 };
    const view = { minX: 230, minY: 230, maxX: 270, maxY: 270 };
    expect(getGroundShadows(state, view).map((shadow) => shadow.id)).toEqual(['tree']);
    state.words.O_07.retention = 100;
    expect(getGroundShadows(state, view).map((shadow) => shadow.id)).toEqual(['tree', 'ore']);
    state.entities[1].amount = 0;
    expect(getGroundShadows(state, view).map((shadow) => shadow.id)).toEqual(['tree']);
  });

  it('removes tall shadows as a tree is cut and does not mutate the world', () => {
    const state = createGame(6842);
    state.entities = [
      { id: 'tree', kind: 'tree', x: 250, y: 250, hp: 100, maxHp: 100, amount: 10 },
    ];
    state.buildings = [];
    const snapshot = structuredClone(state);
    const width = getGroundShadows(state)[0].width;
    expect(state).toEqual(snapshot);
    state.entities[0].amount = 0;
    expect(getGroundShadows(state)[0].width).toBeLessThan(width / 2);
  });

  it('follows daylight and softens during storms without animation-clock drift', () => {
    const state = createGame(6842);
    state.playMode = 'classic';
    state.time = 25;
    const daylight = getGroundLight(state);
    state.paused = true;
    expect(getGroundLight(state)).toEqual(daylight);
    state.disasters.storm = true;
    expect(getGroundLight(state).opacity).toBeLessThan(daylight.opacity);
    state.time = 70;
    expect(getGroundLight(state).opacity).toBe(0);
    state.time = 89;
    expect(getGroundLight(state).opacity).toBeGreaterThan(0);
  });
});
