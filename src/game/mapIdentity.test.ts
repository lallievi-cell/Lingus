import { describe, expect, it } from 'vitest';
import { createGame, parseGame, serializeGame, tick } from './engine';

describe('saved map identity and backward compatibility', () => {
  it('uses the same generated geography in both difficulties without consuming simulation draws', () => {
    const guided = createGame(42, 'guided', 'random');
    const classic = createGame(42, 'classic', 'random');
    expect(guided.seed).toBe(42);
    expect(guided.mapGeneration).toEqual({ mode: 'random', seed: 42, version: 1 });
    expect(guided.entities).toEqual(classic.entities);
    expect(guided.sectors).toEqual(classic.sectors);
    expect(guided.cities).toEqual(classic.cities);
    expect(guided.units.find((unit) => unit.name === 'Uma')!.age).toBe(12);
    expect(classic.units.find((unit) => unit.name === 'Uma')!.age).toBe(14);
  });

  it('keeps the original seed and actual saved geometry after the simulation RNG advances', () => {
    let state = { ...createGame(0, 'guided', 'random'), started: true };
    for (let i = 0; i < 10; i++) state = tick(state, 0.173);
    expect(state.seed).not.toBe(0);
    expect(state.mapGeneration?.seed).toBe(0);
    const saved = structuredClone(state);
    expect(parseGame(serializeGame(state))).toEqual({ ...saved, paused: true });
    expect(createGame(0, 'guided', 'random').entities).not.toEqual(state.entities);
  });

  it('keeps the existing canonical API and never regenerates legacy saved coordinates', () => {
    const canonical = createGame();
    expect(canonical.entities.find((entity) => entity.kind === 'berries')).toMatchObject({
      x: 243,
      y: 244,
      amount: 20,
    });
    expect(canonical.entities.find((entity) => entity.kind === 'tree')).toMatchObject({
      x: 223,
      y: 229,
      amount: 20,
    });
    expect(canonical.mapGeneration?.mode).toBe('seed-zero');
    delete canonical.mapGeneration;
    canonical.entities[0].x = 247;
    canonical.entities[0].amount = 7;
    expect(parseGame(serializeGame(canonical))).toEqual({ ...canonical, paused: true });
  });

  it.each([
    { mode: 'random', seed: -1, version: 1 },
    { mode: 'random', seed: 1.25, version: 1 },
    { mode: 'random', seed: 4294967296, version: 1 },
    { mode: 'unknown', seed: 1, version: 1 },
    { mode: 'random', seed: 1, version: 2 },
    { mode: 'random', seed: '1', version: 1 },
    null,
  ])('rejects malformed optional map metadata: %j', (metadata) => {
    const state = createGame();
    state.mapGeneration = metadata as never;
    expect(parseGame(serializeGame(state))).toBeNull();
  });

  it('accepts both unsigned seed boundaries without treating zero as a missing seed', () => {
    for (const seed of [0, 4294967295]) {
      const state = createGame(seed, 'guided', 'random');
      expect(state.mapGeneration?.seed).toBe(seed);
      expect(parseGame(serializeGame(state))).not.toBeNull();
    }
    expect(createGame(0, 'guided', 'random').entities).not.toEqual(
      createGame(42, 'guided', 'random').entities,
    );
  });
});
