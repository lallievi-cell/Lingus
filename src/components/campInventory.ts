import { RESOURCE_ORDER, RESOURCE_SPECS } from '../game/content';
import { freeCapacity, hasWord } from '../game/runtime';
import type { GameState, Inventory, Resource } from '../game/types';

export type StockLevel = 0 | 1 | 2 | 3;
export type CampStockGroup = 'food' | 'wood' | 'stone' | 'pelt' | 'goods';
export interface InventoryEntry {
  resource: Resource;
  label: string;
  amount: number;
  incoming: number;
  quantity: string;
  level: StockLevel;
}
export interface CampStockSlot {
  id: string;
  group: CampStockGroup;
  x: number;
  y: number;
  level: StockLevel;
  resources: Resource[];
}
export interface CampStockCapacity {
  id: 'shared' | 'food' | 'material';
  label: string;
  capacity: number;
  stored: number;
  reserved: number;
  available: number;
  dedicated: boolean;
}

const positive = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0);
const numberFormat = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
const observable = new Set<Resource>(['food', 'meat', 'wood', 'stone', 'pelt']);

export function getStockLevel(value: number): StockLevel {
  return !(value > 0) ? 0 : value < 5 ? 1 : value < 20 ? 2 : 3;
}

/** Presence stays visible even when the remaining fraction rounds below a tenth. */
export function describeStockQuantity(value: number, numbered: boolean, compact = false) {
  if (!(value > 0)) return numbered ? '0' : compact ? 'Assente' : 'Nessuna scorta';
  if (numbered) return value < 0.1 ? '<0,1' : numberFormat.format(value);
  return value < 5 ? 'Poco' : value < 20 ? (compact ? 'Discreta' : 'Una discreta scorta') : 'Molto';
}

function incomingAtCamp(state: GameState): Inventory {
  const incoming = Object.fromEntries(RESOURCE_ORDER.map((r) => [r, 0])) as Inventory;
  for (const unit of state.units) {
    // The individual returning state deposits at state.home. Caravans, foreign
    // carriers and cargo merely held during other actions are not deliveries.
    if (
      unit.hp <= 0 ||
      (unit.factionId !== undefined && unit.factionId !== 'player') ||
      unit.action !== 'returning' ||
      !unit.carry
    )
      continue;
    incoming[unit.carry.resource] += positive(unit.carry.amount);
  }
  return incoming;
}

/** Owned goods are observable even if their associated word has been forgotten. */
export function getInventoryEntries(
  state: GameState,
  inventory: Inventory = state.resources,
): InventoryEntry[] {
  // A provincial inventory must never inherit the capital's incoming loads.
  const incoming = inventory === state.resources ? incomingAtCamp(state) : undefined;
  const numbered = hasWord(state, 'O_08');
  return RESOURCE_ORDER.flatMap((resource) => {
    const amount = positive(inventory[resource]);
    const arriving = incoming?.[resource] ?? 0;
    const word = RESOURCE_SPECS[resource].wordId;
    const observed = observable.has(resource) || !word || !!state.words[word];
    if (!observed && amount === 0 && arriving === 0) return [];
    return [
      {
        resource,
        label: RESOURCE_SPECS[resource].label,
        amount,
        incoming: arriving,
        quantity: describeStockQuantity(amount, numbered),
        level: getStockLevel(amount),
      },
    ];
  });
}

/** The exact storage pools used by runtime.freeCapacity, including reservations. */
export function getCampStockCapacity(state: GameState): CampStockCapacity[] {
  const stores = state.buildings.filter(
    (building) =>
      building.hp > 0 &&
      building.completed !== false &&
      (!building.cityId ||
        state.cities.some(
          (city) => city.id === building.cityId && city.factionId === 'player' && city.capital,
        )),
  );
  const foodStores = stores.filter((building) => building.kind === 'storage').length;
  const materialStores = stores.filter((building) => building.kind === 'depot').length;
  const shared = foodStores === 0 && materialStores === 0;
  const pool = (
    id: CampStockCapacity['id'],
    label: string,
    capacity: number,
    dedicated: boolean,
  ): CampStockCapacity => {
    const includes = (resource: Resource) =>
      resource !== 'coin' && (id === 'shared' || RESOURCE_SPECS[resource].category === id);
    const stored = RESOURCE_ORDER.filter(includes).reduce(
      (sum, resource) => sum + positive(state.resources[resource]),
      0,
    );
    // Match the engine's reservations, rather than treating them as delivered.
    const reserved = state.units.reduce(
      (sum, unit) =>
        sum +
        (unit.hp > 0 && unit.carry && includes(unit.carry.resource)
          ? positive(unit.carry.amount)
          : 0),
      0,
    );
    return {
      id,
      label,
      capacity,
      stored,
      reserved,
      available: freeCapacity(state, id === 'material' ? 'wood' : 'food'),
      dedicated,
    };
  };
  return shared
    ? [pool('shared', 'Spazio comune al campo', 30, false)]
    : [
        pool('food', 'Spazio per gli alimenti', foodStores * 200 || 30, foodStores > 0),
        pool('material', 'Spazio per i materiali', materialStores * 500 || 30, materialStores > 0),
      ];
}

const stockGroups: { group: CampStockGroup; resources: Resource[]; offset: [number, number] }[] = [
  { group: 'food', resources: ['food', 'meat', 'cooked', 'seed'], offset: [-10, 7] },
  { group: 'wood', resources: ['wood'], offset: [-12, -4] },
  { group: 'stone', resources: ['stone'], offset: [12, -4] },
  { group: 'pelt', resources: ['pelt'], offset: [10, 7] },
  {
    group: 'goods',
    resources: ['ore', 'ingot', 'tool', 'spear', 'pottery', 'metalArms', 'coin'],
    offset: [0, 13],
  },
];

/** Decorative stock anchors: no ground entities, collisions or inventory writes. */
export function getCampStockSlots(state: GameState): CampStockSlot[] {
  if (state.urbanized) return [];
  const allocated: { x: number; y: number }[] = [];
  const buildings = state.buildings.filter((building) => building.hp > 0);
  // Reserve all five positions, including empty groups, so a new material never
  // rearranges existing piles. Buildings may move a slot aside when built.
  return stockGroups.flatMap(({ group, resources, offset }) => {
    const baseAngle = Math.atan2(offset[1], offset[0]);
    const candidates = [
      { x: state.home.x + offset[0], y: state.home.y + offset[1] },
      ...[14, 12, 10, 8].flatMap((radius) =>
        [0, 1, -1, 2, -2, 3, -3, 4, -4, 6].map((step) => {
          const angle = baseAngle + (step * Math.PI) / 6;
          return {
            x: state.home.x + Math.cos(angle) * radius,
            y: state.home.y + Math.sin(angle) * radius,
          };
        }),
      ),
    ].filter((point) => point.x >= 2 && point.x <= 498 && point.y >= 2 && point.y <= 498);
    const clearance = (point: { x: number; y: number }) =>
      Math.min(
        ...buildings.map(
          (building) =>
            Math.hypot(building.x - point.x, building.y - point.y) -
            (building.kind === 'campfire' ? 6 : 7),
        ),
        ...allocated.map((other) => Math.hypot(other.x - point.x, other.y - point.y) - 5),
      );
    const point =
      candidates.find((candidate) => clearance(candidate) >= 0) ??
      candidates.reduce((best, candidate) =>
        clearance(candidate) > clearance(best) ? candidate : best,
      );
    allocated.push(point);
    const present = resources.filter((resource) => state.resources[resource] > 0);
    if (present.length === 0) return [];
    const amount = present.reduce((sum, resource) => sum + state.resources[resource], 0);
    return [
      {
        id: `camp-stock-${group}`,
        group,
        ...point,
        level: getStockLevel(amount),
        resources: present,
      },
    ];
  });
}
