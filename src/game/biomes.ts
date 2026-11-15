import type { GameState, Sector } from './types';
import { createCoastGeometry, coastInlandDistance, coastSegmentCuts } from './coastGeometry';
import { getWorldSectorCount, isWorldPoint, sectorIndex } from './worldDimensions';

type Point = { x: number; y: number };
export type BiomeWorld = Pick<GameState, 'mapGeneration' | 'sectors'>;
export const BIOME_PROFILES: Record<
  Sector['biome'],
  { label: string; description: string; farmYield: number; travelCost: number }
> = {
  coast: {
    label: 'Costa',
    description: 'Sabbia e vegetazione bassa lungo il mare.',
    farmYield: 0.75,
    travelCost: 1.1,
  },
  sea: {
    label: 'Mare',
    description: 'Acqua aperta: non attraversabile a piedi e non coltivabile.',
    farmYield: 0,
    travelCost: 1,
  },
  plain: {
    label: 'Prateria',
    description: 'Terreno aperto con pascoli e vegetazione bassa.',
    farmYield: 1,
    travelCost: 1,
  },
  forest: {
    label: 'Foresta',
    description: 'Vegetazione fitta; il sottobosco rallenta il cammino.',
    farmYield: 0.85,
    travelCost: 1.1,
  },
  mountain: {
    label: 'Montagna',
    description: 'Rilievi rocciosi e pendii; cammino faticoso.',
    farmYield: 0.55,
    travelCost: 1.3,
  },
  river: {
    label: 'Fiume',
    description: 'Il corso d’acqua si attraversa soltanto ai guadi.',
    farmYield: 1.15,
    travelCost: 1.1,
  },
  wetland: {
    label: 'Zona umida',
    description: 'Vegetazione bassa e suolo umido; il terreno cedevole rallenta il cammino.',
    farmYield: 1.25,
    travelCost: 1.2,
  },
  dryland: {
    label: 'Terra arida',
    description: 'Suolo asciutto e roccioso, con vegetazione rada.',
    farmYield: 0.65,
    travelCost: 1,
  },
};

export const biomeEffectsEnabled = (state: BiomeWorld) => state.mapGeneration?.biomeRules === 1;

const sectorMaps = new WeakMap<Sector[], Map<number, Sector>>();
export function terrainBiomeAt(state: BiomeWorld, point: Point): Sector['biome'] | undefined {
  if (!isWorldPoint(state, point)) return undefined;
  const coast = createCoastGeometry(state);
  const inland = coast ? coastInlandDistance(coast, point) : Infinity;
  if (inland <= 0.25) return 'sea';
  if (inland < 35) return 'coast';
  let sectors = sectorMaps.get(state.sectors);
  const count = getWorldSectorCount(state);
  if (!sectors) {
    sectors = new Map(state.sectors.map((sector) => [sector.y * count + sector.x, sector]));
    sectorMaps.set(state.sectors, sectors);
  }
  const biome = sectors.get(
    sectorIndex(state, point.y) * count + sectorIndex(state, point.x),
  )?.biome;
  return coast && biome === 'sea' ? 'coast' : biome;
}

export function farmYieldMultiplier(state: BiomeWorld, point: Point) {
  const biome = biomeEffectsEnabled(state) ? terrainBiomeAt(state, point) : undefined;
  return biome ? BIOME_PROFILES[biome].farmYield : 1;
}

export function terrainTravelCost(state: BiomeWorld, point: Point) {
  const biome = biomeEffectsEnabled(state) ? terrainBiomeAt(state, point) : undefined;
  return biome ? BIOME_PROFILES[biome].travelCost : 1;
}

/** Exact piecewise-constant integration: each interval lies in one 100 m sector. */
function segmentIntervals(a: Point, b: Point, state?: BiomeWorld) {
  const cuts = [0, 1];
  for (const axis of ['x', 'y'] as const) {
    const delta = b[axis] - a[axis];
    if (!delta) continue;
    const low = Math.min(a[axis], b[axis]),
      high = Math.max(a[axis], b[axis]);
    for (let boundary = (Math.floor(low / 100) + 1) * 100; boundary < high; boundary += 100)
      cuts.push((boundary - a[axis]) / delta);
  }
  const coast = state && createCoastGeometry(state);
  if (coast) cuts.push(...coastSegmentCuts(coast, a, b), ...coastSegmentCuts(coast, a, b, 35));
  return cuts.sort((left, right) => left - right);
}

export function terrainSegmentEffort(state: BiomeWorld, a: Point, b: Point) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (!biomeEffectsEnabled(state) || !length) return length;
  const cuts = segmentIntervals(a, b, state);
  let effort = 0;
  for (let index = 1; index < cuts.length; index++) {
    const middle = (cuts[index - 1] + cuts[index]) / 2;
    effort +=
      length *
      (cuts[index] - cuts[index - 1]) *
      terrainTravelCost(state, {
        x: a.x + (b.x - a.x) * middle,
        y: a.y + (b.y - a.y) * middle,
      });
  }
  return effort;
}

/** Inverse of the same integral, so crossing a boundary cannot create free movement. */
export function terrainPointAtEffort(state: BiomeWorld, a: Point, b: Point, budget: number): Point {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (!length) return { ...b };
  let remaining = Math.max(0, budget);
  const cuts = biomeEffectsEnabled(state) ? segmentIntervals(a, b, state) : [0, 1];
  for (let index = 1; index < cuts.length; index++) {
    const start = cuts[index - 1],
      end = cuts[index],
      middle = (start + end) / 2;
    const rate = terrainTravelCost(state, {
      x: a.x + (b.x - a.x) * middle,
      y: a.y + (b.y - a.y) * middle,
    });
    const effort = length * (end - start) * rate;
    if (remaining < effort) {
      const fraction = start + remaining / (length * rate);
      return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
    }
    remaining -= effort;
  }
  return { ...b };
}
