import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import { updateAnimals } from '../game/simulation';
import type { MapEntity } from '../game/types';
import { createAnimalAnimationObserver } from './animalAnimation';

const animal = (kind: MapEntity['kind'] = 'deer'): MapEntity => ({
  id: 'animal-1',
  kind,
  x: 252,
  y: 250,
  originX: 252,
  originY: 250,
  hp: 100,
  maxHp: 100,
  amount: 2,
});

describe('animal action presentation', () => {
  it('shows the real deer escape as running, freezes in pause and does not edit the world', () => {
    const state = createGame(6842);
    state.units = state.units.slice(0, 1);
    Object.assign(state.units[0], { x: 250, y: 250 });
    const deer = animal();
    state.entities = [deer];
    const observe = createAnimalAnimationObserver();
    const context = () => ({ units: state.units, simulationTime: state.time });
    expect(observe(deer, state.time, context()).moving).toBe(false);
    state.time += 0.1;
    updateAnimals(state, 0.1);
    const before = structuredClone(state);
    const moving = observe(deer, state.time, context());
    expect(moving).toMatchObject({ moving: true, fleeing: true, attacking: false, facing: 1 });
    expect(observe(deer, state.time, context())).toEqual(moving);
    expect(state).toEqual(before);
  });

  it('requires an actual fresh bite rather than the durable attacked flag', () => {
    const state = createGame(6842);
    state.time = 65;
    state.units = state.units.slice(0, 1);
    Object.assign(state.units[0], { x: 250, y: 250, isolation: 0 });
    const wolf = { ...animal('wolf'), x: 251, attacked: true };
    state.entities = [wolf];
    const observe = createAnimalAnimationObserver();
    const context = () => ({ units: state.units, simulationTime: state.time });
    expect(observe(wolf, state.time, context()).attacking).toBe(false);
    updateAnimals(state, 0.1);
    expect(state.units[0].lastCombatSource?.id).toBe(wolf.id);
    expect(observe(wolf, state.time, context())).toMatchObject({ attacking: true, facing: -1 });
    state.time += 1;
    expect(observe(wolf, state.time, context()).attacking).toBe(false);
    expect(wolf.attacked).toBe(true);
  });

  it('does not reuse motion and recoil after a new game or time rewind', () => {
    const observe = createAnimalAnimationObserver();
    const deer = animal();
    const session = {};
    observe(deer, 10, { units: [], simulationTime: 10, sessionKey: session });
    deer.x += 1;
    deer.hp -= 10;
    expect(
      observe(deer, 10.1, { units: [], simulationTime: 10.1, sessionKey: session }).moving,
    ).toBe(true);
    expect(observe(deer, 10.1, { units: [], simulationTime: 10.1, sessionKey: {} })).toMatchObject({
      moving: false,
      hurt: 0,
    });
    expect(observe(deer, 0, { units: [], simulationTime: 0, sessionKey: session })).toMatchObject({
      moving: false,
      hurt: 0,
    });
  });

  it('keeps a real carcass still even if movement and combat were observed immediately before', () => {
    const observe = createAnimalAnimationObserver();
    const wolf = animal('wolf');
    observe(wolf, 0);
    wolf.x++;
    observe(wolf, 0.1);
    wolf.hp = 0;
    expect(observe(wolf, 0.2)).toMatchObject({
      dead: true,
      moving: false,
      attacking: false,
      gait: 0,
      hurt: 0,
    });
  });
});
