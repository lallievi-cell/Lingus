import type { GameState, WorldTarget } from '../game/types';
import { getCalendar } from '../game/calendar';
import { BUILDING_NAMES } from '../game/content';
import { getGroundPiles, resourcePileLabel } from './mapResourceLayout';
import { isVisibleAt, hasConcept } from './mapDrawing';
import { getBattalionDisplayPoint } from './regionalLayout';
import { entityTargetPresentation } from './targetPresentation';
import { lifeStageLabel, visibleUnitName } from './unitReadability';

export type VisibleTargetCategory =
  | 'people'
  | 'resources'
  | 'buildings'
  | 'settlements'
  | 'travel'
  | 'places';
export interface MapViewport {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface VisibleWorldTarget {
  key: string;
  category: VisibleTargetCategory;
  label: string;
  detail: string;
  target: WorldTarget;
}

export const VISIBLE_TARGET_CATEGORIES: { id: VisibleTargetCategory; label: string }[] = [
  { id: 'people', label: 'Persone' },
  { id: 'resources', label: 'Risorse' },
  { id: 'buildings', label: 'Edifici' },
  { id: 'settlements', label: 'Città' },
  { id: 'travel', label: 'In viaggio' },
  { id: 'places', label: 'Luoghi' },
];

function relativePlace(point: { x: number; y: number }, home: { x: number; y: number }) {
  const dx = point.x - home.x,
    dy = point.y - home.y;
  if (Math.hypot(dx, dy) <= 10) return 'Al campo';
  const vertical = Math.abs(dy) > 4 ? (dy < 0 ? 'nord' : 'sud') : '',
    horizontal = Math.abs(dx) > 4 ? (dx < 0 ? 'ovest' : 'est') : '';
  return `A ${[vertical, horizontal].filter(Boolean).join('-')}`;
}

/** List exactly the selectable, revealed actors whose anchors are in the camera.
 * Display offsets never replace authoritative coordinates in the returned order target.
 */
export function getVisibleWorldTargets(
  state: GameState,
  viewport: MapViewport,
): VisibleWorldTarget[] {
  const entries: VisibleWorldTarget[] = [];
  const inView = (point: { x: number; y: number }) =>
    point.x >= viewport.minX &&
    point.x <= viewport.maxX &&
    point.y >= viewport.minY &&
    point.y <= viewport.maxY;
  const add = (
    category: VisibleTargetCategory,
    label: string,
    target: WorldTarget,
    detail = relativePlace(target, state.home),
    display: { x: number; y: number } = target,
  ) => {
    if (!inView(display) || !isVisibleAt(state, target.x, target.y)) return;
    entries.push({ key: `${target.type}:${target.id ?? 'home'}`, category, label, detail, target });
  };
  for (const unit of state.units) {
    if (
      unit.hp <= 0 ||
      (state.urbanized &&
        (!unit.factionId || unit.factionId === 'player') &&
        !unit.isKing &&
        !['delegating', 'frontline', 'frontline-returning'].includes(unit.action))
    )
      continue;
    add(
      'people',
      visibleUnitName(state, unit),
      { type: 'unit', id: unit.id, x: unit.x, y: unit.y },
      `${lifeStageLabel(unit)} · ${relativePlace(unit, state.home)}`,
    );
  }
  const piles = getGroundPiles(state);
  for (const pile of piles) {
    add(
      'resources',
      resourcePileLabel(state, pile),
      { type: 'entity', id: pile.entity.id, x: pile.entity.x, y: pile.entity.y },
      'A terra · da portare',
      pile,
    );
  }
  const night = getCalendar(state).isNight;
  for (const entity of state.entities) {
    if (
      entity.kind === 'ground' ||
      (entity.amount <= 0 && !['tree', 'stone'].includes(entity.kind)) ||
      (entity.kind === 'ore' && !hasConcept(state, 'O_07'))
    )
      continue;
    if (
      entity.kind === 'wolf' &&
      !night &&
      !entity.attacked &&
      !state.units.some(
        (unit) => unit.hp > 0 && Math.hypot(unit.x - entity.x, unit.y - entity.y) < 20,
      )
    )
      continue;
    const presentation = entityTargetPresentation(state, entity);
    if (!presentation) continue;
    add(
      entity.kind === 'corpse' || entity.kind === 'seedling' ? 'places' : 'resources',
      presentation.label,
      { type: 'entity', id: entity.id, x: entity.x, y: entity.y },
      `${presentation.stage} · ${relativePlace(entity, state.home)}`,
    );
  }
  if (!state.urbanized) {
    for (const building of state.buildings) {
      if (building.hp <= 0) continue;
      const label = BUILDING_NAMES[building.kind];
      const status =
        building.completed === false ? 'In costruzione' : building.active ? 'Attivo' : 'Inattivo';
      add(
        'buildings',
        label,
        { type: 'building', id: building.id, x: building.x, y: building.y },
        `${status} · ${relativePlace(building, state.home)}`,
      );
    }
    add(
      'places',
      'Giaciglio della tribù',
      { type: 'point', ...state.home },
      'Riposo e ritorno al campo',
    );
  }
  for (const city of state.cities) {
    if (city.factionId === 'ruins') continue;
    add(
      'settlements',
      city.name,
      { type: 'city', id: city.id, x: city.x, y: city.y },
      city.factionId === 'player' ? 'La nostra comunità' : 'Insediamento straniero',
    );
  }
  for (const army of state.battalions) {
    if (army.hp <= 0) continue;
    add(
      'travel',
      army.name,
      { type: 'battalion', id: army.id, x: army.x, y: army.y },
      army.factionId === 'player' ? 'Il nostro esercito' : 'Esercito straniero',
      getBattalionDisplayPoint(state, army),
    );
  }
  for (const caravan of state.caravans) {
    if (caravan.hp <= 0 || caravan.arrived) continue;
    const label =
      caravan.kind === 'colonists'
        ? 'Coloni in viaggio'
        : caravan.kind === 'delegate'
          ? 'Saggi in viaggio'
          : caravan.kind === 'tax'
            ? 'Convoglio tributario'
            : 'Carovana commerciale';
    add('travel', label, { type: 'caravan', id: caravan.id, x: caravan.x, y: caravan.y });
  }
  const order = VISIBLE_TARGET_CATEGORIES.map((category) => category.id);
  return entries.sort(
    (a, b) =>
      order.indexOf(a.category) - order.indexOf(b.category) ||
      a.label.localeCompare(b.label, 'it') ||
      a.key.localeCompare(b.key),
  );
}
