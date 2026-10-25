import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import type { Building, MapEntity } from '../game/types';
import { getAtmosphereFrame, isFoundryProducing } from './mapAtmosphere';

const fire: Building = {
  id: 'warm-fire',
  kind: 'campfire',
  x: 250,
  y: 250,
  hp: 100,
  active: true,
};
const remains: MapEntity = {
  id: 'unburied',
  kind: 'corpse',
  x: 251,
  y: 251,
  hp: 0,
  maxHp: 1,
  amount: 1,
};
const view = { minX: 230, minY: 230, maxX: 270, maxY: 270 };

describe('world atmosphere follows the real simulation', () => {
  it('reflects active weather without changing state or consuming simulation randomness', () => {
    const state = createGame(6842);
    state.disasters.blizzard = true;
    state.buildings = [{ ...fire }];
    state.entities = [{ ...remains }];
    state.units[0].plagueUntil = 30;
    const before = structuredClone(state);
    const frame = getAtmosphereFrame(state, 10, view);
    expect(frame.weather).toBe('blizzard');
    expect(frame.particles.length).toBeGreaterThan(0);
    expect(frame.sources.map((s) => s.kind)).toEqual(['plague', 'corpse', 'campfire']);
    expect(state).toEqual(before);
    state.disasters.blizzard = false;
    state.disasters.storm = true;
    expect(getAtmosphereFrame(state, 10).weather).toBe('storm');
    state.disasters.storm = false;
    state.disasters.drought = true;
    expect(getAtmosphereFrame(state, 10).weather).toBe('drought');
  });

  it('removes extinguished, buried and recovered sources immediately, and never marks dead units as sick', () => {
    const state = createGame(6842);
    state.time = 10;
    state.buildings = [
      { ...fire, active: false },
      { ...fire, id: 'unfinished', completed: false },
    ];
    state.entities = [{ ...remains, amount: 0 }];
    state.units[0].plagueUntil = 10;
    state.units[1].plagueUntil = 30;
    state.units[1].hp = 0;
    expect(getAtmosphereFrame(state, 10).sources).toEqual([]);
  });

  it('freezes every visual phase during pause and preserves warnings with reduced motion', () => {
    const state = createGame(6842);
    state.time = 91.3;
    state.paused = true;
    state.disasters.storm = true;
    state.buildings = [{ ...fire }];
    expect(getAtmosphereFrame(state, 100, view)).toEqual(getAtmosphereFrame(state, 200, view));
    state.paused = false;
    expect(getAtmosphereFrame(state, 100, view).particles).not.toEqual(
      getAtmosphereFrame(state, 101, view).particles,
    );
    const options = { reducedMotion: true };
    const frame = getAtmosphereFrame(state, 100, view, options);
    expect(frame.weather).toBe('storm');
    expect(frame.particles).toEqual([]);
    expect(frame.sources[0].kind).toBe('campfire');
    expect(frame).toEqual(getAtmosphereFrame(state, 200, view, options));
  });

  it('culls sources in unexplored sectors and distant screens before drawing their plumes', () => {
    const state = createGame(6842);
    state.buildings = [{ ...fire }, { ...fire, id: 'hidden', x: 150 }];
    state.entities = [{ ...remains, id: 'far-body', y: 299 }];
    expect(getAtmosphereFrame(state, 10, view).sources.map((s) => s.id)).toEqual(['warm-fire']);
    const center = state.sectors.find((s) => s.x === 2 && s.y === 2)!;
    center.explored = false;
    expect(getAtmosphereFrame(state, 10, view).sources).toEqual([]);
    state.tier = 4;
    expect(getAtmosphereFrame(state, 10, view).sources.map((s) => s.id)).toEqual(['warm-fire']);
  });

  it('bounds particles by screen budget rather than world population and retains nearby danger sources', () => {
    const state = createGame(6842);
    state.disasters.storm = true;
    state.buildings = Array.from({ length: 300 }, (_, i) => ({ ...fire, id: `fire-${i}` }));
    state.entities = [{ ...remains }];
    state.units[0].plagueUntil = 10;
    const frame = getAtmosphereFrame(state, 2, view, { screenWidth: 10000, screenHeight: 10000 });
    expect(frame.particles.length).toBeLessThanOrEqual(180);
    expect(frame.sources.length).toBeLessThanOrEqual(32);
    expect(frame.sources.slice(0, 2).map((s) => s.kind)).toEqual(['plague', 'corpse']);
  });

  it('shows a furnace only with a real eligible worker, usable inputs and output capacity', () => {
    const state = createGame(6842);
    const worker = state.units[0];
    const foundry: Building = { ...fire, id: 'furnace', kind: 'foundry', workerIds: [worker.id] };
    Object.assign(worker, {
      x: 250,
      y: 250,
      action: 'working',
      jobBuildingId: foundry.id,
      command: ['S_01', 'V_12'],
    });
    state.buildings = [foundry];
    Object.assign(state.resources, { ore: 1, wood: 2, food: 0 });
    expect(isFoundryProducing(state, foundry)).toBe(true);
    expect(getAtmosphereFrame(state, 1).sources.some((s) => s.kind === 'foundry')).toBe(true);
    worker.action = 'sleeping';
    expect(isFoundryProducing(state, foundry)).toBe(false);
    worker.action = 'working';
    worker.x += 4;
    expect(isFoundryProducing(state, foundry)).toBe(false);
    worker.x -= 4;
    state.resources.ore = 0;
    expect(isFoundryProducing(state, foundry)).toBe(false);
    state.resources.ore = 1;
    state.resources.wood = 30;
    expect(isFoundryProducing(state, foundry)).toBe(false);
    worker.command = ['S_01', 'V_12', 'O_08'];
    state.resources.ingot = 1;
    // Coins have no storage limit; this is a different real foundry recipe.
    expect(isFoundryProducing(state, foundry)).toBe(true);
    foundry.completed = false;
    expect(isFoundryProducing(state, foundry)).toBe(false);
  });

  it('aggregates staffed city furnaces at the visible settlement and uses local inputs', () => {
    const state = createGame(6842);
    const city = state.cities[0];
    expect(city).toBeDefined();
    state.urbanized = true;
    state.tier = 4;
    state.buildings = [
      { ...fire, kind: 'foundry', cityId: city.id, lastEfficiency: 1, x: 50, y: 50 },
    ];
    Object.assign(city.resources, { ore: 1, wood: 2 });
    const frame = getAtmosphereFrame(state, 1);
    expect(frame.sources[0]).toMatchObject({ kind: 'foundry', x: city.x, y: city.y });
    Object.assign(city.resources, { ore: 0.5, wood: 1 });
    expect(isFoundryProducing(state, state.buildings[0])).toBe(true);
    city.resources.ore = 0;
    expect(getAtmosphereFrame(state, 1).sources).toEqual([]);
  });

  it('draws a single localized summer strike only when the real tree ignites, including later years', () => {
    const state = createGame(6842);
    state.paused = false;
    state.time = 450.3;
    state.seasonIndex = 5;
    state.disasters.lightning = true;
    state.entities = [
      {
        id: 'struck-tree',
        kind: 'tree',
        x: 252,
        y: 252,
        hp: 100,
        maxHp: 100,
        amount: 10,
        burning: true,
      },
    ];
    expect(getAtmosphereFrame(state, 450.3, view).lightning).toMatchObject({ x: 252, y: 252 });
    expect(
      getAtmosphereFrame(state, 450.3, view, { reducedMotion: true }).lightning,
    ).toBeUndefined();
    state.time = 451;
    expect(getAtmosphereFrame(state, 451, view).lightning).toBeUndefined();
    state.time = 450.3;
    state.entities[0].burning = false;
    expect(getAtmosphereFrame(state, 450.3, view).lightning).toBeUndefined();
    state.entities[0].burning = true;
    state.sectors.find((s) => s.x === 2 && s.y === 2)!.explored = false;
    expect(getAtmosphereFrame(state, 450.3, view).lightning).toBeUndefined();
  });
});
