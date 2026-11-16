import { describe, expect, it } from 'vitest';
import { coastEdges, createCoastGeometry, isSeaPoint } from '../game/coastGeometry';
import { getCoastHighlights, paintCoastSand, paintCoastWater } from './mapCoastArt';

function worldRegion(x: number, y: number) {
  const state: Parameters<typeof getCoastHighlights>[0] = {
    mapGeneration: {
      mode: 'random',
      seed: 42,
      version: 1,
      worldSize: 1000,
      coastalRules: 1,
      maritimeRules: 1,
      worldRules: 1,
      worldSeed: 42,
      regionX: x,
      regionY: y,
    },
    sectors: Array.from({ length: 100 }, (_, index) => ({
      id: `sector-${index}`,
      x: index % 10,
      y: Math.floor(index / 10),
      explored: true,
      faunaCapacity: 0,
      biome: 'plain',
    })),
    tier: 4,
    disasters: {
      storm: false,
      drought: false,
      blizzard: false,
      lightning: false,
      lastSummerYear: 0,
      lastWinterYear: 0,
    },
    paused: false,
    time: 0,
  };
  return state;
}

type Point = [number, number];
function recordingContext() {
  const strokes: Point[][][] = [];
  const clips: { paths: Point[][]; rule?: CanvasFillRule }[] = [];
  const gradients: number[][] = [];
  let paths: Point[][] = [];
  const context = {
    save() {},
    restore() {},
    beginPath() {
      paths = [];
    },
    moveTo(x: number, y: number) {
      paths.push([[x, y]]);
    },
    lineTo(x: number, y: number) {
      paths.at(-1)!.push([x, y]);
    },
    closePath() {},
    stroke() {
      strokes.push(structuredClone(paths));
    },
    clip(rule?: CanvasFillRule) {
      clips.push({ paths: structuredClone(paths), rule });
    },
    fill() {},
    fillRect() {},
    createLinearGradient(...coordinates: number[]) {
      gradients.push(coordinates);
      return { addColorStop() {} };
    },
  } as unknown as CanvasRenderingContext2D;
  return { context, strokes, clips, gradients };
}

describe('connected world coastal art', () => {
  it('clips water around the exact continents, islands and inland sea rings', () => {
    const state = worldRegion(2, 2);
    const coast = createCoastGeometry(state)!;
    expect(coast.world).toBeDefined();
    expect(coast.points).toEqual([]);
    const { context, clips, strokes } = recordingContext();
    paintCoastSand(context, state, false);
    paintCoastWater(context, state, false);
    const physicalRings = coast.world!.landmasses.flatMap((landmass) => [
      landmass.points,
      ...landmass.holes,
    ]);
    expect(physicalRings.some((ring) => ring.some((point) => point.x < 0))).toBe(true);
    expect(coast.world!.landmasses.some((landmass) => landmass.holes.length > 0)).toBe(true);
    expect(clips).toEqual([
      {
        rule: 'evenodd',
        paths: [
          [
            [0, 0],
            [1000, 0],
            [1000, 1000],
            [0, 1000],
          ],
          ...physicalRings.map((ring) => ring.map(({ x, y }) => [x, y])),
        ],
      },
    ]);
    const shorePaths = coastEdges(coast).map(({ a, b }) => [
      [a.x, a.y],
      [b.x, b.y],
    ]);
    // Only actual shores receive sand: region clipping edges add no beach.
    expect(strokes.slice(0, 3)).toEqual([shorePaths, shorePaths, shorePaths]);
  });

  it('keeps the broad sea colour continuous across regional boundaries', () => {
    const left = recordingContext();
    const right = recordingContext();
    paintCoastWater(left.context, worldRegion(0, 0), false);
    paintCoastWater(right.context, worldRegion(1, 0), false);
    const [x1, y1, x2, y2] = right.gradients[0];
    expect([x1 + 1000, y1, x2 + 1000, y2]).toEqual(left.gradients[0]);
  });

  it('animates visible physical shores, including the inland sea, without changing the world', () => {
    const state = worldRegion(2, 2);
    const before = structuredClone(state);
    const marks = getCoastHighlights(state, 3);
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.length).toBeLessThan(80);
    // The basin at world(2730,2480) belongs to this local kilometre.
    expect(marks.some(({ a }) => Math.hypot(a.x - 730, a.y - 480) < 400)).toBe(true);
    for (const { a, b } of marks) {
      for (const point of [a, b]) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(1000);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(1000);
        expect(isSeaPoint(state, point)).toBe(true);
      }
    }
    expect(getCoastHighlights(state, 4)).not.toEqual(marks);
    expect(state).toEqual(before);
    expect(getCoastHighlights(state, 3, { minX: 0, minY: 0, maxX: 10, maxY: 10 })).toEqual([]);
    state.paused = true;
    state.time = 17;
    expect(getCoastHighlights(state, 100)).toEqual(getCoastHighlights(state, 200));
    expect(getCoastHighlights(state, 100, undefined, true)).toEqual([]);
    state.tier = 0;
    state.sectors.forEach((sector) => (sector.explored = false));
    expect(getCoastHighlights(state, 100)).toEqual([]);
  });
});
