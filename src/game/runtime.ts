import { BUILDING_SPECS, RESOURCE_SPECS, WORDS } from './content';
import type {
  Building,
  BuildingKind,
  GameState,
  Inventory,
  LogEntry,
  Resource,
  Unit,
} from './types';

export const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
export const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const copy = <T>(s: T): T => structuredClone(s);
export function random(s: GameState) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
export function nextId(s: GameState, prefix: string) {
  return `${prefix}-${s.revision++}`;
}
export function log(s: GameState, text: string, tone: LogEntry['tone'] = 'info') {
  s.logs.unshift({ id: nextId(s, 'log'), time: s.time, text, tone });
  s.logs = s.logs.slice(0, 180);
}
export function hasWord(s: GameState, id: string) {
  return !!s.words[id] && s.words[id].retention > 0;
}
export function activeUnits(s: GameState) {
  return s.units.filter((u) => u.hp > 0 && (u.factionId === undefined || u.factionId === 'player'));
}
export const adult = (u: Unit) => u.age >= 4;
export function isPlayerBuilding(s: GameState, b: Building) {
  return !b.cityId || s.cities.some((c) => c.id === b.cityId && c.factionId === 'player');
}
export function hasBuilding(s: GameState, kind: BuildingKind) {
  return s.buildings.some(
    (b) =>
      isPlayerBuilding(s, b) && b.kind === kind && b.hp > 0 && b.active && b.completed !== false,
  );
}
export function buildingWorkers(s: GameState, b: Building) {
  return (b.workerIds ?? []).filter((id) =>
    s.units.some(
      (u) =>
        u.id === id &&
        u.hp > 0 &&
        u.jobBuildingId === b.id &&
        distance(u, b) <= 3 &&
        u.hunger < 75 &&
        u.temp > 30,
    ),
  ).length;
}
export function buildingEfficiency(s: GameState, b: Building) {
  const max = BUILDING_SPECS[b.kind].workers;
  return !b.active || b.hp <= 0 || b.completed === false
    ? 0
    : max === 0
      ? 1
      : Math.min(1, buildingWorkers(s, b) / max);
}
export function canPay(inventory: Inventory, cost: Partial<Inventory>) {
  return Object.entries(cost).every(([r, n]) => inventory[r as Resource] + 1e-9 >= n);
}
export function pay(inventory: Inventory, cost: Partial<Inventory>) {
  for (const [r, n] of Object.entries(cost))
    inventory[r as Resource] = Math.max(0, inventory[r as Resource] - n);
}
export function totalFood(r: Inventory) {
  return r.food + r.meat + r.cooked;
}
export function resourceCategory(r: Resource) {
  return RESOURCE_SPECS[r].category;
}
export function freeCapacity(s: GameState, r: Resource) {
  if (r === 'coin') return Infinity;
  const food = resourceCategory(r) === 'food';
  const sharedStores = s.buildings.filter(
    (b) =>
      !b.cityId || s.cities.some((c) => c.id === b.cityId && c.factionId === 'player' && c.capital),
  );
  const stores = sharedStores.filter(
    (b) => b.hp > 0 && b.completed !== false && b.kind === 'storage',
  ).length;
  const depots = sharedStores.filter(
    (b) => b.hp > 0 && b.completed !== false && b.kind === 'depot',
  ).length;
  const keys = Object.keys(s.resources) as Resource[];
  const ground = keys.filter((k) => k !== 'coin').reduce((n, k) => n + s.resources[k], 0);
  const reserved = s.units
    .filter((u) => u.hp > 0 && u.carry && u.carry.resource !== 'coin')
    .reduce((n, u) => n + u.carry!.amount, 0);
  if (stores === 0 && depots === 0) return Math.max(0, 30 - ground - reserved);
  const cap = food ? stores * 200 : depots * 500;
  const used = keys
    .filter((k) => resourceCategory(k) === (food ? 'food' : 'material'))
    .reduce((n, k) => n + s.resources[k], 0);
  const carried = s.units
    .filter(
      (u) =>
        u.hp > 0 && u.carry && resourceCategory(u.carry.resource) === (food ? 'food' : 'material'),
    )
    .reduce((n, u) => n + u.carry!.amount, 0);
  // The original 30-place ground pile remains usable for the category with no dedicated store.
  return Math.max(0, (cap || 30) - used - carried);
}
export function addResource(s: GameState, r: Resource, n: number, reserved = false) {
  const add = Math.min(Math.max(0, n), freeCapacity(s, r) + (reserved ? n : 0));
  s.resources[r] += add;
  return add;
}
export function resourceLabel(r: Resource) {
  return RESOURCE_SPECS[r].label;
}
export function availableWords(s: GameState) {
  return Object.keys(s.words).filter((w) => WORDS[w] && hasWord(s, w));
}
