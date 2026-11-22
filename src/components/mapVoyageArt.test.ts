import { describe, expect, it } from 'vitest';
import { emptyInventory } from '../game/content';
import { createGame } from '../game/engine';
import type { Boat } from '../game/types';
import { observedVoyage } from './mapVoyageArt';

function sailingBoat(): Boat {
  const route = [
    { x: 20, y: 20 },
    { x: 68, y: 72 },
    { x: 258, y: 72 },
  ];
  return {
    id: 'voyage',
    x: 50,
    y: 50,
    hp: 100,
    maxHp: 100,
    status: 'sailing',
    ownerId: 'player',
    passengerIds: [],
    progress: 1,
    resources: emptyInventory(),
    paidMaterials: emptyInventory(),
    route,
    routeIndex: 1,
    destination: route[2],
  };
}

describe('the active voyage on the chart', () => {
  it('follows remaining physical bends and ends at the first unknown sector', () => {
    const state = createGame(6842);
    for (const sector of state.sectors) sector.explored = sector.y === 0 && sector.x !== 1;
    const boat = sailingBoat();
    const before = structuredClone(boat);
    expect(observedVoyage(state, boat)).toEqual({
      points: [
        { x: 50, y: 50 },
        { x: 68, y: 72 },
        { x: 100, y: 72 },
      ],
      destination: undefined,
    });
    state.sectors.find((sector) => sector.x === 1 && sector.y === 0)!.explored = true;
    expect(observedVoyage(state, boat)).toEqual({
      points: [
        { x: 50, y: 50 },
        { x: 68, y: 72 },
        { x: 258, y: 72 },
      ],
      destination: { x: 258, y: 72 },
    });
    expect(boat).toEqual(before);
  });

  it('only exposes a live voyage of the player’s vessel', () => {
    const state = createGame(6842);
    for (const sector of state.sectors) sector.explored = true;
    const boat = sailingBoat();
    expect(observedVoyage(state, { ...boat, ownerId: 'visitor' })).toBeNull();
    expect(observedVoyage(state, { ...boat, status: 'moored' })).toBeNull();
    expect(observedVoyage(state, { ...boat, hp: 0 })).toBeNull();
  });
});
