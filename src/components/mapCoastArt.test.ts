import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import { createCoastGeometry, isSeaPoint } from '../game/coastGeometry';
import { getCoastHighlights, paintCoastSand, paintCoastWater } from './mapCoastArt';
import { getRiverHighlights } from './mapSurfaceMotion';
import { createRiverArtGeometry } from './mapRiverGeometry';

function coastalWorld(seed = 42) {
  const state = createGame(seed, 'guided', 'random', 1000);
  state.tier = 4;
  return state;
}

describe('physical coastal art', () => {
  it('freezes waves on pause and respects reduced motion, fog and the camera', () => {
    const state = coastalWorld();
    const before = structuredClone(state);
    const marks = getCoastHighlights(state, 3);
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.length).toBeLessThanOrEqual(20);
    expect(getCoastHighlights(state, 4)).not.toEqual(marks);
    expect(state).toEqual(before);
    for (const mark of marks) {
      expect(isSeaPoint(state, mark.a)).toBe(true);
      expect(isSeaPoint(state, mark.b)).toBe(true);
    }
    state.paused = true;
    state.time = 17;
    expect(getCoastHighlights(state, 100)).toEqual(getCoastHighlights(state, 200));
    expect(getCoastHighlights(state, 100, undefined, true)).toEqual([]);
    expect(getCoastHighlights(state, 100, { minX: 490, minY: 490, maxX: 560, maxY: 560 })).toEqual(
      [],
    );
    state.tier = 0;
    state.sectors.forEach((sector) => (sector.explored = false));
    expect(getCoastHighlights(state, 100)).toEqual([]);
  });

  it('uses the navigation vertices for sand and the sea clip in all four orientations', () => {
    const orientations = new Set<string>();
    // Real seeds cover each deterministic coastline without mutating geography.
    for (const seed of [0, 1, 2, 5]) {
      const state = coastalWorld(seed);
      const coast = createCoastGeometry(state)!;
      orientations.add(coast.side);
      const paths: number[][][] = [];
      let path: number[][] = [];
      const context = {
        save() {},
        restore() {},
        beginPath() {
          path = [];
        },
        moveTo(x: number, y: number) {
          path.push([x, y]);
        },
        lineTo(x: number, y: number) {
          path.push([x, y]);
        },
        closePath() {},
        stroke() {
          paths.push(path);
        },
        clip() {
          paths.push(path);
        },
        fillRect() {},
        createLinearGradient() {
          return { addColorStop() {} };
        },
      } as unknown as CanvasRenderingContext2D;
      paintCoastSand(context, state, false);
      paintCoastWater(context, state, false);
      const vertices = coast.points.map(({ x, y }) => [x, y]);
      // The first three strokes are beach bands, the fourth path is the sea clip.
      for (const shore of paths.slice(0, 3)) expect(shore).toEqual(vertices);
      expect(paths[3].slice(0, vertices.length)).toEqual(vertices);
    }
    expect([...orientations].sort()).toEqual(['east', 'north', 'south', 'west']);
  });

  it('does not paint new coasts in legacy worlds or let river glints expose a hidden river at sea', () => {
    const state = coastalWorld();
    for (const mark of getRiverHighlights(createRiverArtGeometry(state), state, 8)) {
      expect(isSeaPoint(state, { x: mark.x1, y: mark.y1 })).toBe(false);
      expect(isSeaPoint(state, { x: mark.x2, y: mark.y2 })).toBe(false);
    }
    delete state.mapGeneration!.coastalRules;
    expect(getCoastHighlights(state, 8)).toEqual([]);
    // Without the metadata these functions return before touching a canvas.
    paintCoastSand({} as CanvasRenderingContext2D, state, false);
    paintCoastWater({} as CanvasRenderingContext2D, state, false);
  });
});
