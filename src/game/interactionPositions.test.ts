import { describe, expect, it } from 'vitest';
import { createGame } from './engine';
import { resolveInteractionPosition } from './interactionPositions';

describe('physical work and arrival positions', () => {
  it('gives the six initial adults distinct reachable front/flank positions without changing state', () => {
    const state = createGame(6842);
    const before = JSON.stringify(state);
    const anchor = { id: 'tree', kind: 'tree', x: 223, y: 229 };
    const positions = state.units
      .slice(0, 6)
      .map((unit) => resolveInteractionPosition(state, unit, anchor, { kind: 'tree' }));
    for (const [i, position] of positions.entries()) {
      expect(Math.hypot(position.x - anchor.x, position.y - anchor.y)).toBeLessThanOrEqual(3.6);
      expect(position.y).toBeGreaterThan(anchor.y);
      for (const other of positions.slice(i + 1))
        expect(Math.hypot(position.x - other.x, position.y - other.y)).toBeGreaterThan(1.2);
    }
    expect(JSON.stringify(state)).toBe(before);
  });

  it('keeps destinations fixed when a coworker finishes, dies, or a child is appended', () => {
    const state = createGame(6842);
    const unit = state.units[3];
    const anchor = { id: 'rock', kind: 'stone', x: 230, y: 236 };
    const before = resolveInteractionPosition(state, unit, anchor);
    state.units[0].action = 'idle';
    state.units[1].hp = 0;
    state.units[1].action = 'dead';
    state.units.push({ ...state.units[6], id: 'new-child', age: 0 });
    expect(resolveInteractionPosition(state, unit, anchor)).toEqual(before);
    const loaded = structuredClone(state);
    expect(resolveInteractionPosition(loaded, loaded.units[3], anchor)).toEqual(before);
  });

  it('does not push a hunter outside the real melee or spear range', () => {
    const state = createGame(6842);
    const prey = { id: 'prey', kind: 'deer', x: 250, y: 250 };
    for (const range of [1.5, 3]) {
      for (const unit of state.units) {
        const position = resolveInteractionPosition(state, unit, prey, {
          kind: 'hunt',
          maxRadius: range,
        });
        expect(Math.hypot(position.x - prey.x, position.y - prey.y)).toBeLessThan(range);
      }
    }
    const old = resolveInteractionPosition(state, state.units[0], prey, { kind: 'hunt' });
    const moved = resolveInteractionPosition(
      state,
      state.units[0],
      { ...prey, x: 253, y: 251 },
      {
        kind: 'hunt',
      },
    );
    expect(moved.x - old.x).toBeCloseTo(3);
    expect(moved.y - old.y).toBeCloseTo(1);
  });

  it('keeps rest and delivery inside the home and permits the stricter night taboo radius', () => {
    const state = createGame(6842);
    for (const kind of ['rest', 'return'] as const) {
      const positions = state.units.map((unit) =>
        resolveInteractionPosition(state, unit, state.home, { kind }),
      );
      expect(new Set(positions.map((p) => `${p.x},${p.y}`)).size).toBe(7);
      for (const position of positions)
        expect(
          Math.hypot(position.x - state.home.x, position.y - state.home.y),
        ).toBeLessThanOrEqual(6.5);
    }
    for (const unit of state.units) {
      const position = resolveInteractionPosition(state, unit, state.home, {
        kind: 'rest',
        maxRadius: 3.5,
      });
      expect(Math.hypot(position.x - state.home.x, position.y - state.home.y)).toBeLessThanOrEqual(
        3.5 + 1e-10,
      );
    }
  });

  it('preserves the exact artisan position so a material at the 15m boundary remains payable', () => {
    const state = createGame(6842);
    const unit = state.units[0];
    const anchor = { x: 252, y: 235.2 };
    const position = resolveInteractionPosition(state, unit, anchor, { kind: 'craft' });
    expect({ x: position.x, y: position.y }).toEqual(anchor);
  });

  it('turns edge positions into the map without stacking them on a clamped boundary', () => {
    const state = createGame(6842);
    for (const anchor of [
      { x: 0, y: 0 },
      { x: 500, y: 500 },
      { x: 0, y: 500 },
    ]) {
      const positions = state.units.map((unit) =>
        resolveInteractionPosition(state, unit, anchor, { kind: 'work' }),
      );
      expect(new Set(positions.map((p) => `${p.x},${p.y}`)).size).toBe(7);
      for (const position of positions) {
        expect(position.x).toBeGreaterThanOrEqual(0);
        expect(position.x).toBeLessThanOrEqual(500);
        expect(position.y).toBeGreaterThanOrEqual(0);
        expect(position.y).toBeLessThanOrEqual(500);
        expect(Math.hypot(position.x - anchor.x, position.y - anchor.y)).toBeLessThanOrEqual(
          2.7 + 1e-10,
        );
      }
    }
  });
});
