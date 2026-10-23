import { RESOURCE_ORDER, RESOURCE_SPECS } from '../game/content';
import { groundPileLocation, sameGroundPile } from '../game/groundPiles';
import type { GameState, MapEntity, Resource } from '../game/types';

export interface GroundPile {
  entity: MapEntity;
  entityIds: string[];
  resource: Resource;
  amount: number;
  /** Visual position only: the simulation continues to use entity.x/y. */
  x: number;
  y: number;
}
const known = (s: GameState, id: string) => (s.words[id]?.retention ?? 0) > 0;
export function resourceKnown(s: GameState, resource: Resource) {
  if (resource === 'food') return known(s, 'O_04');
  if (['ore', 'ingot', 'metalArms'].includes(resource) && !known(s, 'O_07')) return false;
  const word = RESOURCE_SPECS[resource].wordId;
  return !word || known(s, word);
}

/** Several extraction cycles at the same spot form one readable visual pile.
 * Every entity ID and quantity stays in the simulation; nothing is merged there.
 */
export function getGroundPiles(s: GameState): GroundPile[] {
  const locations = new Map<string, Map<Resource, GroundPile>>();
  for (const entity of s.entities) {
    if (entity.kind !== 'ground' || !entity.resource || entity.amount <= 0) continue;
    const location = groundPileLocation(entity);
    let materials = locations.get(location);
    if (!materials) {
      materials = new Map();
      locations.set(location, materials);
    }
    const pile = materials.get(entity.resource);
    if (pile) {
      pile.entityIds.push(entity.id);
      pile.amount += entity.amount;
      if (entity.amount > pile.entity.amount) pile.entity = entity;
    } else
      materials.set(entity.resource, {
        entity,
        entityIds: [entity.id],
        resource: entity.resource,
        amount: entity.amount,
        x: entity.x,
        y: entity.y,
      });
  }
  const piles: GroundPile[] = [];
  for (const materials of locations.values()) {
    const group = [...materials.values()].sort(
      (a, b) => RESOURCE_ORDER.indexOf(a.resource) - RESOURCE_ORDER.indexOf(b.resource),
    );
    const origin = group[0].entity;
    const besideSource = s.entities.some(
      (e) =>
        e.kind !== 'ground' &&
        e.kind !== 'corpse' &&
        (e.amount > 0 || e.kind === 'tree' || e.kind === 'stone') &&
        Math.hypot(e.x - origin.x, e.y - origin.y) <= 3,
    );
    for (let i = 0; i < group.length; i++) {
      const pile = group[i];
      if (besideSource || group.length > 1) {
        const column = i % 2 === 0 ? 1 : -1;
        pile.x = Math.max(1, Math.min(499, pile.x + column * (5 + Math.floor(i / 4) * 5)));
        pile.y = Math.max(1, Math.min(499, pile.y + 4 + Math.floor(i / 2) * 6));
      }
      piles.push(pile);
    }
  }
  return piles;
}
export function groundPileFor(
  s: GameState,
  entityId: string | undefined,
  piles = getGroundPiles(s),
) {
  if (!entityId) return undefined;
  const existing = piles.find((p) => p.entityIds.includes(entityId));
  if (existing) return existing;
  const old = s.entities.find((e) => e.id === entityId && e.kind === 'ground');
  return old ? piles.find((p) => sameGroundPile(p.entity, old)) : undefined;
}
export function resourcePileLabel(s: GameState, pile: GroundPile) {
  const material = resourceKnown(s, pile.resource)
    ? RESOURCE_SPECS[pile.resource].label
    : 'Materiale';
  const quantity = known(s, 'O_08')
    ? new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(pile.amount)
    : pile.amount >= 8
      ? 'abbondante'
      : pile.amount >= 3
        ? 'un piccolo cumulo'
        : 'poco';
  return `${material} a terra · ${quantity}`;
}
