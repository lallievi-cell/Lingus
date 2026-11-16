import type { GameState } from './types';

/** Physical state belongs to one region; language, time and identity stay global. */
export const WORLD_LOCAL_KEYS = [
  'mapGeneration',
  'home',
  'resources',
  'units',
  'entities',
  'buildings',
  'boats',
  'sectors',
  'explored',
  'cities',
  'factions',
  'battalions',
  'caravans',
  'regionalRoutes',
  'foreignPolicy',
  'disasters',
  'burntWood',
  'nightSleeping',
] as const satisfies readonly (keyof GameState)[];

export type RegionState = Pick<GameState, (typeof WORLD_LOCAL_KEYS)[number]>;

export interface WorldRegion {
  id: string;
  x: number;
  y: number;
  discovered: boolean;
  /** The active region lives in GameState itself, without a second copy here. */
  snapshot?: RegionState;
}

export interface WorldTransfer {
  id: string;
  from: string;
  to: string;
  kind: 'boat' | 'people';
  actorIds: string[];
  exit: { x: number; y: number };
  entry: { x: number; y: number };
}

export interface WorldState {
  version: 1;
  seed: number;
  width: 4;
  height: 4;
  activeRegionId: string;
  homeRegionId: string;
  regions: Record<string, WorldRegion>;
  transfers: WorldTransfer[];
}
