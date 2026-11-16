import type { Inventory } from './types';

/** Version-one coastal craft: real places, cargo and work, shared by all callers. */
export const BOAT_PASSENGER_CAPACITY = 3;
export const BOAT_CARGO_CAPACITY = 20;
export const BOAT_SPEED = 8;
export const BOAT_BUILD_SECONDS = 20;
export const BOAT_BUILD_COST: Readonly<Partial<Inventory>> = Object.freeze({ wood: 15, tool: 1 });
