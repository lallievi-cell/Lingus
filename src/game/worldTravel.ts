import { isSeaPoint, isSeaSegment } from './coastGeometry';
import { isDryLandPoint, isLandSegment, planLandRoute } from './landNavigation';
import { planSeaRoute } from './seaNavigation';
import { copy, log, nextId } from './runtime';
import { activateRegion, captureRegion, regionProjection } from './worldRuntime';
import { generateWorldRegion, validWorldRegion, worldRegionId } from './worldRegions';
import type { GameState, Target, Unit } from './types';
import type { WorldTransfer } from './worldTypes';

type Point = { x: number; y: number };
type Trace = { assignedUnitIds: string[] };
type LocalIssue = (state: GameState, tokens: string[], target?: Target, executorId?: string,
  selectionCenter?: Target, trace?: Trace) => GameState;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const close = (a: Point, b: Point) => distance(a, b) <= 1e-6;
const player = (unit: Unit) => unit.hp > 0 && (!unit.factionId || unit.factionId === 'player');

function neighbour(state: GameState, destination: string) {
  const world = state.world, from = world?.regions[world.activeRegionId];
  if (!world || !from || !/^[0-3]:[0-3]$/.test(destination)) return undefined;
  const [x, y] = destination.split(':').map(Number);
  if (!validWorldRegion(x, y) || Math.abs(x - from.x) + Math.abs(y - from.y) !== 1) return undefined;
  return { x, y, dx: x - from.x, dy: y - from.y };
}
function entryFor(exit: Point, delta: { dx: number; dy: number }): Point {
  return { x: exit.x - delta.dx * 1000, y: exit.y - delta.dy * 1000 };
}
function inward(point: Point, delta: { dx: number; dy: number }, source: boolean): Point {
  const sign = source ? -1 : 1;
  return { x: point.x + delta.dx * sign, y: point.y + delta.dy * sign };
}
function destinationGeometry(state: GameState, x: number, y: number): GameState {
  // Querying a public route suggestion neither visits nor generates a region.
  return { ...state, mapGeneration: { ...state.mapGeneration!, regionX: x, regionY: y }, sectors: [] };
}
function boundaryValid(state: GameState, target: Target, boat: boolean) {
  if (target.type !== 'point' || !target.regionId || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return undefined;
  const delta = neighbour(state, target.regionId);
  if (!delta) return undefined;
  const expected = delta.dx === 1 ? target.x === 1000 : delta.dx === -1 ? target.x === 0 :
    delta.dy === 1 ? target.y === 1000 : target.y === 0;
  const along = delta.dx ? target.y : target.x;
  if (!expected || along < 4 || along > 996) return undefined;
  const entry = entryFor(target, delta), destination = destinationGeometry(state, delta.x, delta.y);
  const sourceInside = inward(target, delta, true), destinationInside = inward(entry, delta, false);
  const valid = boat
    ? isSeaPoint(state, target) && isSeaPoint(destination, entry) &&
      isSeaSegment(state, sourceInside, target) && isSeaSegment(destination, entry, destinationInside)
    : isDryLandPoint(state, target) && isDryLandPoint(destination, entry) &&
      isLandSegment(state, sourceInside, target) && isLandSegment(destination, entry, destinationInside);
  return valid ? { ...delta, entry } : undefined;
}

/** Public preparation only: coordinates are the actual shared edge, never a teleport. */
export function worldBoundaryTargets(state: GameState, toRegionId: string, boatId?: string): Target[] {
  const delta = neighbour(state, toRegionId);
  if (!delta) return [];
  const boat = boatId ? state.boats?.find((candidate) => candidate.id === boatId && candidate.hp > 0 && candidate.ownerId === 'player' && candidate.status !== 'building') : undefined;
  if (boatId && !boat) return [];
  const workers = state.units.filter((unit) => player(unit) && unit.age >= 4 && !unit.boatId && !unit.cityId);
  if (!boat && !workers.length) return [];
  const origin = boat ?? workers[0];
  const along = delta.dx ? origin.y : origin.x;
  const samples = Array.from({ length: 50 }, (_, index) => 10 + index * 20)
    .sort((a, b) => Math.abs(a - along) - Math.abs(b - along));
  const targets: Target[] = [];
  for (const value of samples) {
    const target: Target = { type: 'point', x: delta.dx ? (delta.dx > 0 ? 1000 : 0) : value,
      y: delta.dy ? (delta.dy > 0 ? 1000 : 0) : value, regionId: toRegionId };
    if (!boundaryValid(state, target, !!boat)) continue;
    if (boat ? !planSeaRoute(state, boat, target) : !workers.some((unit) => !!planLandRoute(state, unit, target))) continue;
    targets.push(target);
    if (targets.length === 3) break;
  }
  return targets;
}

/** Ordinary grammar/laws/Voice run exactly once; only accepted real movers are registered. */
export function issueWorldTravel(state: GameState, tokens: string[], target: Target, executorId?: string,
  selectionCenter?: Target, trace?: Trace, localIssue?: LocalIssue): GameState {
  const reject = (message: string) => { const result = copy(state); log(result, message, 'warning'); return result; };
  if (!state.world || !localIssue) return reject('Questo salvataggio non contiene regioni collegate.');
  if (tokens.join('|') !== 'S_01|V_01|O_01') return reject('Per attraversare il confine prepara Gruppo, Andare e Qui.');
  const boatId = selectionCenter?.type === 'boat' ? selectionCenter.id : undefined;
  const geometry = boundaryValid(state, target, !!boatId);
  if (!geometry) return reject('Scegli un confine vicino con passaggio continuo sulla terra o nel mare.');
  const boat = boatId ? state.boats?.find((item) => item.id === boatId) : undefined;
  if (boatId && (!boat || boat.passengerIds.length === 0)) return reject('Serve una barca pronta con un equipaggio a bordo.');
  const localTarget: Target = { type: 'point', id: `world-boundary:${target.regionId}`, x: target.x, y: target.y };
  const receipt: Trace = { assignedUnitIds: [] };
  const result = localIssue(state, tokens, localTarget, executorId, selectionCenter, receipt);
  if (result.stats.commands !== state.stats.commands + 1 || !receipt.assignedUnitIds.length) return result;
  const assigned = receipt.assignedUnitIds.map((id) => result.units.find((unit) => unit.id === id));
  if (assigned.some((unit) => !unit || !player(unit) || unit.cityId))
    return reject('I trasferimenti fra regioni riguardano i compagni della tribù; i contingenti cittadini restano nella propria regione.');
  if (receipt.assignedUnitIds.some((id) => state.units.find((unit) => unit.id === id)?.paidConstruction))
    return reject('Concludi prima la costruzione già pagata prima di attraversare il confine.');
  if (!boatId && assigned.some((unit) => !planLandRoute(result, unit!, target)))
    return reject('Tutti i compagni scelti devono poter raggiungere fisicamente il passaggio.');
  if (boatId && assigned.some((unit) => unit!.boatId !== boatId)) return reject('L’equipaggio deve essere interamente a bordo.');
  generateWorldRegion(result, geometry.x, geometry.y);
  const actorIds = boatId ? [boatId, ...receipt.assignedUnitIds] : [...receipt.assignedUnitIds];
  const world = result.world!;
  world.transfers = world.transfers.filter((transfer) => !transfer.actorIds.some((id) => actorIds.includes(id)));
  world.transfers.push({ id: nextId(result, 'world-transfer'), from: world.activeRegionId, to: target.regionId!,
    kind: boatId ? 'boat' : 'people', actorIds, exit: { x: target.x, y: target.y }, entry: geometry.entry });
  trace?.assignedUnitIds.push(...receipt.assignedUnitIds);
  log(result, 'Il gruppo raggiungerà il confine prima di entrare nella regione vicina.', 'info');
  return result;
}
function cleanTraveller(unit: Unit, entry: Point, boatId?: string) {
  unit.x = entry.x; unit.y = entry.y;
  unit.action = boatId ? 'sailing' : 'idle';
  unit.targetId = undefined; unit.tx = undefined; unit.ty = undefined; unit.command = undefined;
  unit.progress = 0; unit.jobBuildingId = undefined; unit.suspendedJob = undefined;
  unit.workOrigin = undefined; unit.targetBoatId = undefined; unit.deliveryBoatId = undefined;
  unit.deliveryPoint = undefined; unit.embarkFrom = undefined; unit.cargoResources = undefined;
  unit.lastTaskResult = undefined;
}
function persistProjection(root: GameState, id: string, projection: GameState) {
  if (id !== root.world!.activeRegionId) root.world!.regions[id].snapshot = captureRegion(projection);
}
function transferStatus(source: GameState, transfer: WorldTransfer): 'cancel' | 'wait' | 'ready' {
  if (transfer.kind === 'boat') {
    const boat = source.boats?.find((item) => item.id === transfer.actorIds[0]);
    const expected = transfer.actorIds.slice(1);
    if (!boat || boat.hp <= 0 || boat.passengerIds.length !== expected.length || expected.some((id) => !boat.passengerIds.includes(id))) return 'cancel';
    if (expected.some((id) => !source.units.some((unit) => unit.id === id && player(unit) && unit.boatId === boat.id))) return 'cancel';
    if (close(boat, transfer.exit) && boat.status === 'moored') return 'ready';
    return boat.status === 'sailing' && boat.destination && close(boat.destination, transfer.exit) ? 'wait' : 'cancel';
  }
  const units = transfer.actorIds.map((id) => source.units.find((unit) => unit.id === id));
  if (units.some((unit) => !unit || !player(unit) || unit.boatId || unit.cityId || unit.action !== 'moving' ||
    unit.targetId !== `world-boundary:${transfer.to}` || unit.tx !== transfer.exit.x || unit.ty !== transfer.exit.y)) return 'cancel';
  return units.every((unit) => close(unit!, transfer.exit)) ? 'ready' : 'wait';
}

/** Called after physical regional steps; the only translation is 1000→0 on the same world point. */
export function advanceWorldTransfers(state: GameState): void {
  const world = state.world;
  if (!world) return;
  for (const transfer of [...world.transfers]) {
    const source = regionProjection(state, transfer.from), destination = regionProjection(state, transfer.to);
    if (!source || !destination) { world.transfers = world.transfers.filter((item) => item.id !== transfer.id); continue; }
    const status = transferStatus(source, transfer);
    if (status === 'wait') continue;
    world.transfers = world.transfers.filter((item) => item.id !== transfer.id);
    if (status === 'cancel') continue;
    const boat = transfer.kind === 'boat' ? source.boats!.find((item) => item.id === transfer.actorIds[0]) : undefined;
    const ids = new Set(boat ? transfer.actorIds.slice(1) : transfer.actorIds);
    const travellers = source.units.filter((unit) => ids.has(unit.id));
    source.units = source.units.filter((unit) => !ids.has(unit.id));
    for (const building of source.buildings) if (building.workerIds) building.workerIds = building.workerIds.filter((id) => !ids.has(id));
    for (const unit of travellers) cleanTraveller(unit, transfer.entry, boat?.id);
    destination.units.push(...travellers);
    if (boat) {
      source.boats = source.boats!.filter((item) => item.id !== boat.id);
      boat.x = transfer.entry.x; boat.y = transfer.entry.y; boat.status = 'moored';
      boat.harborId = undefined; boat.builderId = undefined; boat.route = undefined; boat.routeIndex = undefined;
      boat.destination = undefined; boat.landing = undefined; boat.accessLand = undefined;
      (destination.boats ??= []).push(boat);
    }
    world.regions[transfer.to].discovered = true;
    destination.explored.push({ ...transfer.entry });
    const sector = destination.sectors.find((item) => item.x === Math.min(9, Math.floor(transfer.entry.x / 100)) && item.y === Math.min(9, Math.floor(transfer.entry.y / 100)));
    if (sector) sector.explored = true;
    persistProjection(state, transfer.from, source); persistProjection(state, transfer.to, destination);
    if (world.activeRegionId === transfer.from) activateRegion(state, transfer.to);
    log(state, 'Il gruppo ha attraversato il confine con persone e carichi intatti.', 'good');
  }
}
