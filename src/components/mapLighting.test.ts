import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import { seasonLength, seasonStart } from '../game/calendar';
import { getGroundLight, getGroundShadows } from './mapLighting';

describe('ground lighting', () => {
  it('never reveals unknown ore, unexplored objects or an offscreen settlement', () => {
    const state = createGame(6842);
    state.entities = [
      { id: 'tree', kind: 'tree', x: 250, y: 250, hp: 100, maxHp: 100, amount: 10 },
      { id: 'ore', kind: 'ore', x: 250, y: 250, hp: 100, maxHp: 100, amount: 10 },
      { id: 'hidden', kind: 'tree', x: 150, y: 150, hp: 100, maxHp: 100, amount: 10 },
    ];
    state.buildings = [{ id: 'far', kind: 'hut', x: 310, y: 310, hp: 100, active: true }];
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

  it('casts west in the morning, shortens at noon and casts east in the evening', () => {
    const state = createGame(6842, 'classic');
    state.time = 6;
    const morning = getGroundLight(state);
    state.time = 30;
    const noon = getGroundLight(state);
    state.time = 54;
    const evening = getGroundLight(state);
    expect(Math.cos(morning.angle)).toBeLessThan(-0.9);
    expect(Math.cos(evening.angle)).toBeGreaterThan(0.9);
    expect(Math.cos(noon.angle)).toBeCloseTo(0);
    expect(Math.sin(noon.angle)).toBeCloseTo(-1);
    expect(noon.stretch).toBeLessThan(morning.stretch / 2);
    expect(noon.stretch).toBeLessThan(evening.stretch / 2);
    expect(morning.stretch).toBeCloseTo(evening.stretch);
    expect(morning.opacity).toBeGreaterThan(0);
    expect(evening.opacity).toBeGreaterThan(0);
  });

  it('fades continuously at dawn and dusk and never casts solar shadows at night', () => {
    const state = createGame(6842, 'classic');
    for (const time of [0, 60, 65, 75, 84, 89.999, 90]) {
      state.time = time;
      expect(getGroundLight(state).opacity).toBe(0);
    }
    for (const time of [0.001, 59.999, 90.001]) {
      state.time = time;
      expect(getGroundLight(state).opacity).toBeGreaterThan(0);
      expect(getGroundLight(state).opacity).toBeLessThan(0.0001);
    }
    const angles = Array.from({ length: 601 }, (_, index) => {
      state.time = index / 10;
      return getGroundLight(state).angle;
    });
    for (let index = 1; index < angles.length; index++) {
      expect(angles[index] - angles[index - 1]).toBeGreaterThan(0);
      expect(angles[index] - angles[index - 1]).toBeLessThan(0.01);
    }
  });

  it('uses the same solar cycle in the slower Guided opening and later seasons', () => {
    const classic = createGame(6842, 'classic');
    const guided = createGame(6842, 'guided');
    for (const season of [0, 3, 4, 9]) {
      for (const phase of [0, 3, 8, 30, 52, 59, 60, 75, 89]) {
        classic.time = seasonStart(classic, season) + (phase * seasonLength(classic, season)) / 90;
        guided.time = seasonStart(guided, season) + (phase * seasonLength(guided, season)) / 90;
        const a = getGroundLight(classic);
        const b = getGroundLight(guided);
        expect(b.angle).toBeCloseTo(a.angle);
        expect(b.opacity).toBeCloseTo(a.opacity);
        expect(b.stretch).toBeCloseTo(a.stretch);
      }
    }
  });

  it('softens during storms and uses only simulation time without mutating the world', () => {
    const state = createGame(6842, 'classic');
    state.time = 25;
    const before = structuredClone(state);
    const daylight = getGroundLight(state);
    expect(state).toEqual(before);
    state.paused = true;
    expect(getGroundLight(state)).toEqual(daylight);
    state.disasters.storm = true;
    expect(getGroundLight(state).opacity).toBeLessThan(daylight.opacity);
    state.disasters.storm = false;
    state.disasters.blizzard = true;
    expect(getGroundLight(state).opacity).toBeLessThan(daylight.opacity);
  });
});
