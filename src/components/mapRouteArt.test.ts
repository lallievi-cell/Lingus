import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import type { RegionalRoadSegment } from '../game/types';
import { drawRegionalRoutes, getRegionalRouteStyle } from './mapRouteArt';

/** Capture emitted road strokes without depending on a browser pixel rasterizer. */
function painter() {
  let start = { x: 0, y: 0 },
    end = start;
  const strokes: { from: typeof start; to: typeof end; color: string }[] = [];
  const brush = {
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    setLineDash() {},
    getTransform() {
      return { a: 1, b: 0 };
    },
    moveTo(x: number, y: number) {
      start = { x, y };
    },
    lineTo(x: number, y: number) {
      end = { x, y };
    },
    stroke() {
      strokes.push({ from: start, to: end, color: this.strokeStyle });
    },
  };
  return { ctx: brush as unknown as CanvasRenderingContext2D, strokes };
}

const road: RegionalRoadSegment = {
  key: 'test-route',
  from: { x: 250, y: 250 },
  to: { x: 262.5, y: 250 },
  travelled: 12.5,
};

describe('regional ground traces', () => {
  it('keeps future and offscreen paths empty, and leaves the saved simulation untouched', () => {
    const state = createGame(6842);
    state.tier = 4;
    const { ctx, strokes } = painter();
    drawRegionalRoutes(ctx, state);
    expect(strokes).toEqual([]);
    state.regionalRoutes = [structuredClone(road)];
    const before = structuredClone(state);
    drawRegionalRoutes(ctx, state, { minX: 0, maxX: 100, minY: 0, maxY: 100 });
    expect(strokes).toEqual([]);
    drawRegionalRoutes(ctx, state);
    expect(strokes.length).toBeGreaterThan(0);
    expect(
      strokes.every((stroke) => stroke.from.x >= 250 * 2.4 && stroke.to.x <= 262.5 * 2.4),
    ).toBe(true);
    expect(state).toEqual(before);
  });

  it('does not draw a paved bridge across the real canonical river crossing', () => {
    const state = createGame(6842);
    state.tier = 5;
    state.regionalRoutes = Array.from({ length: 4 }, (_, i) => ({
      key: `crossing-${i}`,
      from: { x: 325 + i * 12.5, y: 250 },
      to: { x: 337.5 + i * 12.5, y: 250 },
      travelled: 125,
    }));
    const { ctx, strokes } = painter();
    drawRegionalRoutes(ctx, state);
    expect(strokes.some((stroke) => stroke.to.x < 345 * 2.4)).toBe(true);
    expect(strokes.some((stroke) => stroke.to.x > 365 * 2.4)).toBe(true);
    expect(strokes.some((stroke) => stroke.from.x < 354 * 2.4 && stroke.to.x > 354 * 2.4)).toBe(
      false,
    );
  });

  it('requires both repeated real wear and the final era for a paved surface', () => {
    const firstPass = getRegionalRouteStyle({ tier: 5 }, road);
    const repeated = { ...road, travelled: 100 };
    expect(firstPass.stage).toBe('trail');
    expect(getRegionalRouteStyle({ tier: 4 }, repeated).stage).toBe('dirt');
    expect(getRegionalRouteStyle({ tier: 5 }, repeated).stage).toBe('paved');
    expect(getRegionalRouteStyle({ tier: 5 }, repeated).width).toBeGreaterThan(firstPass.width);
  });
});
