export const LEGACY_WORLD_SIZE = 500;
export const REGION_WORLD_SIZE = 1000;
export const WORLD_SECTOR_SIZE = 100;
export type WorldSize = typeof LEGACY_WORLD_SIZE | typeof REGION_WORLD_SIZE;

type SizedWorld = { mapGeneration?: { worldSize?: WorldSize } };

/** Missing metadata always means the original valley, including older saves. */
export function getWorldSize(state: SizedWorld): WorldSize {
  return state.mapGeneration?.worldSize === REGION_WORLD_SIZE
    ? REGION_WORLD_SIZE
    : LEGACY_WORLD_SIZE;
}

export function getWorldSectorCount(state: SizedWorld) {
  return getWorldSize(state) / WORLD_SECTOR_SIZE;
}

/** Begin in the middle of a sector so all nearby starting resources are visible. */
export function getInitialWorldHome(size: WorldSize) {
  const coordinate =
    Math.floor(size / WORLD_SECTOR_SIZE / 2) * WORLD_SECTOR_SIZE + WORLD_SECTOR_SIZE / 2;
  return { x: coordinate, y: coordinate };
}

export function sectorIndex(state: SizedWorld, coordinate: number) {
  return Math.max(
    0,
    Math.min(getWorldSectorCount(state) - 1, Math.floor(coordinate / WORLD_SECTOR_SIZE)),
  );
}

export function isWorldPoint(state: SizedWorld, point: { x: number; y: number }) {
  const size = getWorldSize(state);
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.x <= size &&
    point.y >= 0 &&
    point.y <= size
  );
}
import type { GameState } from './types';

export function isWorldPointRevealed(
  state: Pick<GameState, 'mapGeneration' | 'sectors' | 'tier'>,
  x: number,
  y: number,
) {
  if (!isWorldPoint(state, { x, y })) return false;
  return (
    state.tier >= 4 ||
    state.sectors.some(
      (sector) =>
        sector.explored && sector.x === sectorIndex(state, x) && sector.y === sectorIndex(state, y),
    )
  );
}
