import type { MapEntity } from './types';

/** One physical pile uses the same position in the simulation and on the map.
 * Display offsets never affect its reach or the quantities available to carry.
 */
export function groundPileLocation(entity: MapEntity) {
  return `${entity.x.toFixed(1)}:${entity.y.toFixed(1)}`;
}

export function sameGroundPile(a: MapEntity, b: MapEntity) {
  return (
    a.kind === 'ground' &&
    b.kind === 'ground' &&
    !!a.resource &&
    a.resource === b.resource &&
    groundPileLocation(a) === groundPileLocation(b)
  );
}
