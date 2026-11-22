import { describe, expect, it } from 'vitest';
import { emptyInventory } from './content';
import { isDryLandPoint } from './landNavigation';
import { coastEdges, createCoastGeometry, isSeaPoint } from './coastGeometry';
import { hasPhysicalCamp } from './physicalCamp';
import { createInitialState } from './state';
import { getCampStockSlots } from '../components/campInventory';

function remoteRegion() {
  const state = createInitialState();
  state.mapGeneration = {
    mode: 'random',
    seed: 42,
    version: 1,
    worldSize: 1000,
    landNavigation: 1,
    biomeRules: 1,
    coastalRules: 1,
    maritimeRules: 1,
    worldRules: 1,
    worldSeed: 42,
    regionX: 1,
    regionY: 0,
  };
  state.units = [];
  state.buildings = [];
  state.cities = [];
  state.resources = emptyInventory();
  return state;
}

describe('physical camps in a connected world', () => {
  it('preserves the original camp without turning a regional placeholder into one', () => {
    const legacy = createInitialState();
    expect(hasPhysicalCamp(legacy)).toBe(true);
    const state = remoteRegion();
    expect(hasPhysicalCamp(state)).toBe(false);
    expect(getCampStockSlots(state)).toEqual([]);
    state.mapGeneration!.regionX = 0;
    expect(hasPhysicalCamp(state)).toBe(true);
  });

  it('shows the real dry bivouac after arrival but never the home underneath a boat', () => {
    const state = remoteRegion();
    const sites = Array.from({ length: 100 }, (_, index) => ({
      x: (index % 10) * 100 + 50,
      y: Math.floor(index / 10) * 100 + 50,
    }));
    const dry = sites.find((point) => isDryLandPoint(state, point))!;
    const sea = sites.find((point) => isSeaPoint(state, point))!;
    expect(dry).toBeDefined();
    expect(sea).toBeDefined();
    const unit = structuredClone(createInitialState().units[0]);
    state.home = { ...dry };
    state.units = [{ ...unit, ...dry, boatId: 'travelling-boat' }];
    expect(hasPhysicalCamp(state)).toBe(false);
    state.units[0].boatId = undefined;
    expect(hasPhysicalCamp(state)).toBe(true);
    // A bivouac supplies neither a house nor a decorative pile of free goods.
    expect(state.resources).toEqual(emptyInventory());
    expect(getCampStockSlots(state)).toEqual([]);
    state.resources.wood = 3;
    expect(getCampStockSlots(state).map((slot) => slot.group)).toEqual(['wood']);
    state.home = { ...sea };
    state.units[0].x = sea.x;
    state.units[0].y = sea.y;
    expect(hasPhysicalCamp(state)).toBe(false);
    expect(getCampStockSlots(state)).toEqual([]);
  });

  it('keeps delivered stock art on dry land when a bivouac is close to shore', () => {
    const state = remoteRegion();
    const shore = coastEdges(createCoastGeometry(state)!)
      .map(({ a, b, inward }) => {
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        return {
          x: (a.x + b.x) / 2 - ((b.y - a.y) * inward) / length,
          y: (a.y + b.y) / 2 + ((b.x - a.x) * inward) / length,
        };
      })
      .find(
        (point) =>
          point.x > 20 &&
          point.x < 980 &&
          point.y > 20 &&
          point.y < 980 &&
          isDryLandPoint(state, point),
      )!;
    expect(shore).toBeDefined();
    state.home = shore;
    state.resources.wood = 3;
    state.resources.food = 3;
    state.resources.stone = 3;
    const before = structuredClone(state.resources);
    const slots = getCampStockSlots(state);
    expect(slots).toHaveLength(3);
    expect(slots.every((slot) => isDryLandPoint(state, slot))).toBe(true);
    expect(state.resources).toEqual(before);
  });
});
