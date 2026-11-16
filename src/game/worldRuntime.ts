import type { City, GameState, Unit } from './types';
import { WORLD_LOCAL_KEYS, type RegionState } from './worldTypes';

export const REGION_STATE_KEYS = WORLD_LOCAL_KEYS;
const localKeys = new Set<string>(WORLD_LOCAL_KEYS);
type RegionContext = { root: GameState; regionId: string; aggregate?: boolean };
const contexts = new WeakMap<GameState, RegionContext>();

/** Capture references inside an already isolated command/tick transaction. */
export function captureRegion(state: GameState): RegionState {
  return Object.fromEntries(
    WORLD_LOCAL_KEYS.filter((key) => state[key] !== undefined).map((key) => [key, state[key]]),
  ) as unknown as RegionState;
}

/** Optional local fields must disappear when the destination does not own them. */
export function applyRegion(state: GameState, snapshot: RegionState): void {
  const target = state as unknown as Record<string, unknown>;
  for (const key of WORLD_LOCAL_KEYS) delete target[key];
  Object.assign(state, snapshot);
}

export function regionProjection(state: GameState, regionId: string): GameState | undefined {
  const world = state.world;
  if (!world) return undefined;
  if (regionId === world.activeRegionId) return state;
  const snapshot = world.regions[regionId]?.snapshot;
  if (!snapshot) return undefined;
  const projection = { ...state };
  applyRegion(projection, snapshot);
  contexts.set(projection, { root: state, regionId });
  return projection;
}

/** Only global results flow back; physical inventories never cross this boundary. */
export function syncGlobalState(root: GameState, projection: GameState): void {
  if (root === projection) return;
  const source = projection as unknown as Record<string, unknown>;
  const target = root as unknown as Record<string, unknown>;
  for (const key of new Set([...Object.keys(root), ...Object.keys(projection)])) {
    if (localKeys.has(key) || key === 'world') continue;
    if (Object.hasOwn(source, key)) target[key] = source[key];
    else delete target[key];
  }
}

/** Run synchronously while keeping one owner for each local payload. */
export function runInRegion(
  state: GameState,
  regionId: string,
  operation: (projection: GameState) => void,
): boolean {
  const projection = regionProjection(state, regionId);
  if (!projection) return false;
  operation(projection);
  syncGlobalState(state, projection);
  if (projection !== state) state.world!.regions[regionId].snapshot = captureRegion(projection);
  return true;
}

/** Change the observed region without cloning, regenerating or moving any actor. */
export function activateRegion(state: GameState, regionId: string): boolean {
  const world = state.world;
  if (!world || !world.regions[regionId]) return false;
  if (world.activeRegionId === regionId) return true;
  const destination = world.regions[regionId];
  if (!destination.snapshot) return false;
  const source = world.regions[world.activeRegionId];
  if (!source) return false;
  source.snapshot = captureRegion(state);
  applyRegion(state, destination.snapshot);
  delete destination.snapshot;
  destination.discovered = true;
  world.activeRegionId = regionId;
  return true;
}

/** Public immutable UI action: observing a known place does not simulate a journey. */
export function switchWorldRegion(state: GameState, regionId: string): GameState {
  if (!state.world || state.world.activeRegionId === regionId) return state;
  if (!state.world.regions[regionId]?.snapshot) return state;
  const next = structuredClone(state);
  return activateRegion(next, regionId) ? next : state;
}

function regionalPayloads(state: GameState): RegionState[] {
  const context = contexts.get(state);
  if (context?.aggregate) return [state];
  const root = context?.root ?? state;
  const world = root.world;
  if (!world) return [state];
  return Object.keys(world.regions)
    .sort()
    .flatMap((id) => {
      if (context?.regionId === id) return [state];
      if (world.activeRegionId === id) return [root];
      const snapshot = world.regions[id].snapshot;
      return snapshot ? [snapshot] : [];
    });
}

export function allWorldUnits(state: GameState): Unit[] {
  return regionalPayloads(state).flatMap((region) => region.units);
}

export function allWorldCities(state: GameState): City[] {
  return regionalPayloads(state).flatMap((region) => region.cities);
}

export function regionOfUnit(state: GameState, unitId: string): string | undefined {
  const world = state.world;
  if (!world) return undefined;
  if (state.units.some((unit) => unit.id === unitId)) return world.activeRegionId;
  return Object.keys(world.regions).find((id) =>
    world.regions[id].snapshot?.units.some((unit) => unit.id === unitId),
  );
}

/** A global census for memory/progression, never for distance-based work or movement. */
export function globalWorldProjection(state: GameState): GameState {
  if (!state.world) return state;
  const home = regionProjection(state, state.world.homeRegionId) ?? state;
  const projection = { ...home };
  const regions = regionalPayloads(state);
  projection.units = regions.flatMap((region) => region.units);
  projection.entities = regions.flatMap((region) => region.entities);
  projection.buildings = regions.flatMap((region) => region.buildings);
  projection.boats = regions.flatMap((region) => region.boats ?? []);
  projection.cities = regions.flatMap((region) => region.cities);
  projection.factions = regions.flatMap((region) => region.factions);
  projection.battalions = regions.flatMap((region) => region.battalions);
  projection.caravans = regions.flatMap((region) => region.caravans);
  contexts.set(projection, { root: state, regionId: state.world.homeRegionId, aggregate: true });
  return projection;
}
