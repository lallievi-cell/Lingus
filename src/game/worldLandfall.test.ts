import { describe, expect, it } from 'vitest';
import { emptyInventory } from './content';
import { coastEdges, createCoastGeometry } from './coastGeometry';
import { createGame } from './engine';
import { BOAT_BUILD_COST } from './maritime';
import { hasPhysicalCamp } from './physicalCamp';
import { findShoreAccess } from './shoreAccess';
import { processWork } from './simulation';
import { generateWorldRegion } from './worldRegions';
import { activateRegion } from './worldRuntime';
import { villageHousing } from './growthReadiness';
import type { Boat } from './types';

describe('first physical landfall in another region', () => {
  it('establishes a dry bivouac only on landing without granting supplies or housing', () => {
    const state = createGame(42, 'classic', 'random', 1000, true);
    const person = state.units.pop()!;
    generateWorldRegion(state, 2, 0);
    activateRegion(state, '2:0');
    state.units = [person];
    const access = coastEdges(createCoastGeometry(state)!).flatMap(({ a, b, inward }) => {
      const dx = b.x - a.x,
        dy = b.y - a.y,
        length = Math.hypot(dx, dy);
      const land = {
        x: (a.x + b.x) / 2 - (dy * inward * 10) / length,
        y: (a.y + b.y) / 2 + (dx * inward * 10) / length,
      };
      if (land.x < 5 || land.y < 5 || land.x > 995 || land.y > 995) return [];
      const shore = findShoreAccess(state, land);
      return shore ? [shore] : [];
    })[0];
    expect(access).toBeDefined();
    const boat: Boat = {
      id: 'landfall-vessel',
      ...access.water,
      hp: 150,
      maxHp: 150,
      ownerId: 'player',
      status: 'landing',
      passengerIds: [person.id],
      resources: emptyInventory(),
      paidMaterials: { ...emptyInventory(), ...BOAT_BUILD_COST },
      progress: 20,
      landing: access.land,
    };
    state.boats = [boat];
    Object.assign(person, access.water, {
      boatId: boat.id,
      action: 'disembarking',
      embarkFrom: access.water,
      progress: 0,
      carry: undefined,
    });
    expect(hasPhysicalCamp(state)).toBe(false);
    const placeholder = { ...state.home };
    processWork(state, person, 0.25);
    expect(state.home).toEqual(placeholder);
    for (let step = 0; person.boatId && step < 100; step++) processWork(state, person, 0.25);
    expect(person.boatId).toBeUndefined();
    expect(state.home).toEqual(access.land);
    expect(hasPhysicalCamp(state)).toBe(true);
    expect(villageHousing(state)).toBe(0);
    expect(state.resources).toEqual(emptyInventory());
    expect(state.buildings).toHaveLength(0);
  });
});
