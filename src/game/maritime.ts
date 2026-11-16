import { emptyInventory, RESOURCE_ORDER, RESOURCE_SPECS } from './content';
import { canPayLocally, payLocally } from './craftMaterials';
import { fishingCapacity } from './fishing';
import { isSeaPoint, isSeaSegment } from './coastGeometry';
import { isDryLandPoint, moveOnLand, planLandRoute } from './landNavigation';
import { findShoreAccess } from './shoreAccess';
import { planSeaRoute, type SeaPoint } from './seaNavigation';
import {
  BOAT_BUILD_COST, BOAT_BUILD_SECONDS, BOAT_CARGO_CAPACITY,
  BOAT_PASSENGER_CAPACITY, BOAT_SPEED,
} from './maritimeConfig';
import { distance, log, nextId } from './runtime';
import { sectorIndex } from './worldDimensions';
import type { Boat, Building, GameState, Resource, Unit } from './types';

export { BOAT_BUILD_COST, BOAT_BUILD_SECONDS, BOAT_CARGO_CAPACITY, BOAT_SPEED };
export const BOAT_CAPACITY = BOAT_PASSENGER_CAPACITY;
export const maritimeEnabled = (state: Pick<GameState, 'mapGeneration'>) => state.mapGeneration?.maritimeRules === 1;
const EPSILON = 1e-7;
const TRANSFER_SECONDS = 2;
const food: Resource[] = ['cooked', 'cookedFish', 'food', 'meat', 'fish'];
type AssignHook = (unit: Unit) => void;
export interface MaritimeResult {
  ok: boolean;
  valid: boolean;
  message: string;
  boat?: Boat;
  unitIds: string[];
}
const result = (ok: boolean, message: string, boat?: Boat, units: Unit[] = []): MaritimeResult =>
  ({ ok, valid: ok, message, boat, unitIds: units.map((unit) => unit.id) });
const player = (unit: Unit) => !unit.factionId || unit.factionId === 'player';
const aboard = (state: GameState, unit: Unit) => state.boats?.find((boat) => boat.id === unit.boatId && boat.passengerIds.includes(unit.id));
export function boatPassengers(state: GameState, boat: Boat) {
  return boat.passengerIds.map((id) => state.units.find((unit) => unit.id === id))
    .filter((unit): unit is Unit => !!unit && unit.hp > 0 && unit.boatId === boat.id);
}
export function boatCargoAmount(state: GameState, boat: Boat) {
  return RESOURCE_ORDER.filter((resource) => resource !== 'coin')
    .reduce((sum, resource) => sum + boat.resources[resource], 0) +
    boatPassengers(state, boat).reduce((sum, unit) => sum + (unit.carry?.resource !== 'coin' ? unit.carry?.amount ?? 0 : 0), 0);
}
export const boatFreeCapacity = (state: GameState, boat: Boat) => Math.max(0, BOAT_CARGO_CAPACITY - boatCargoAmount(state, boat));
export function revealMaritimePoint(state: GameState, point: SeaPoint) {
  const sector = state.sectors.find((entry) => entry.x === sectorIndex(state, point.x) && entry.y === sectorIndex(state, point.y));
  if (sector) sector.explored = true;
  if (!state.explored.some((seen) => distance(seen, point) < 20)) state.explored.push({ ...point });
}
function clearAssignment(state: GameState, unit: Unit, hook?: AssignHook) {
  releaseMaritimeAssignment(state, unit);
  hook?.(unit);
  unit.action = 'idle'; unit.command = undefined; unit.progress = 0;
  unit.targetId = undefined; unit.tx = undefined; unit.ty = undefined;
  unit.jobBuildingId = undefined; unit.suspendedJob = undefined;
  unit.lastTaskResult = undefined;
}
/** A paid hull stays in the world when its artisan changes task or dies. */
export function releaseMaritimeAssignment(state: GameState, unit: Unit) {
  if (!maritimeEnabled(state)) return;
  for (const boat of state.boats ?? []) if (boat.builderId === unit.id) boat.builderId = undefined;
  unit.targetBoatId = undefined; unit.cargoResources = undefined;
  unit.deliveryBoatId = undefined; unit.deliveryPoint = undefined;
  unit.embarkFrom = undefined;
}
/** Death detaches the person, never destroys or duplicates the vessel's hold. */
export function detachBoatPassenger(state: GameState, unit: Unit) {
  if (!maritimeEnabled(state)) return;
  for (const boat of state.boats ?? []) boat.passengerIds = boat.passengerIds.filter((id) => id !== unit.id);
  unit.boatId = undefined;
  releaseMaritimeAssignment(state, unit);
}
function ground(state: GameState, resource: Resource, amount: number, point: SeaPoint) {
  if (!(amount > 0)) return;
  state.entities.push({ id: nextId(state, 'ground'), kind: 'ground', ...point, amount, maxAmount: amount,
    hp: 0, maxHp: 1, resource, sectorId: `sector-${sectorIndex(state, point.x)}-${sectorIndex(state, point.y)}` });
}
const ownBoat = (state: GameState, boat: Boat) => maritimeEnabled(state) && state.boats?.includes(boat) && boat.ownerId === 'player' && boat.hp > 0;
function landWorker(state: GameState, unit: Unit, destination: SeaPoint) {
  return unit.hp > 0 && unit.age >= 4 && player(unit) && !unit.boatId &&
    !['frontline', 'frontline-returning', 'delegating', 'embarking', 'disembarking'].includes(unit.action) &&
    !!planLandRoute(state, unit, destination);
}
function usableHarbor(state: GameState, harbor: Building) {
  return harbor.kind === 'harbor' && harbor.hp > 0 && harbor.active && harbor.completed !== false &&
    (!harbor.cityId || state.cities.some((city) => city.id === harbor.cityId && city.factionId === 'player'));
}
function harborAccess(state: GameState, harbor: Building) {
  if (harbor.seaAccess && isSeaPoint(state, harbor.seaAccess) && distance(harbor, harbor.seaAccess) <= 20)
    return { land: { x: harbor.x, y: harbor.y }, water: { ...harbor.seaAccess } };
  const access = findShoreAccess(state, harbor, 16);
  return access ? { land: { x: harbor.x, y: harbor.y }, water: access.water } : undefined;
}
function hullAt(state: GameState, harbor: Building) {
  return state.boats?.find((boat) => boat.status === 'building' && boat.harborId === harbor.id);
}
export function canBeginBoatBuild(state: GameState, worker: Unit, harbor: Building): string | undefined {
  if (!maritimeEnabled(state)) return 'Questo mondo conserva le precedenti regole della costa.';
  if (!usableHarbor(state, harbor)) return 'Serve un approdo completato e attivo della tribù.';
  if (!landWorker(state, worker, harbor)) return 'L’artigiano deve poter raggiungere l’approdo sulla terraferma.';
  const access = harborAccess(state, harbor);
  if (!access) return 'Questo approdo non ha un accesso sicuro al mare.';
  const hull = hullAt(state, harbor);
  if (hull) {
    const previous = state.units.find((unit) => unit.id === hull.builderId);
    if (previous && previous.id !== worker.id && previous.hp > 0 && previous.action === 'boatbuilding' && previous.targetBoatId === hull.id)
      return 'Un altro artigiano sta già lavorando a questo scafo.';
    return undefined;
  }
  if ((state.boats ?? []).some((boat) => boat.status === 'moored' && distance(boat, access.water) < 6))
    return 'L’ormeggio è occupato. Fai salpare la barca prima di preparare un altro scafo.';
  if (!canPayLocally(state, BOAT_BUILD_COST, worker)) return 'Per questo scafo servono quindici legni e un utensile realmente disponibili.';
}
export function beginBoatBuild(state: GameState, worker: Unit, harbor: Building, hook?: AssignHook): MaritimeResult {
  const error = canBeginBoatBuild(state, worker, harbor);
  if (error) return result(false, error);
  const access = harborAccess(state, harbor)!;
  let boat = hullAt(state, harbor);
  if (!boat) {
    payLocally(state, BOAT_BUILD_COST, worker);
    boat = { id: nextId(state, 'boat'), ...access.water, hp: 150, maxHp: 150, ownerId: 'player', harborId: harbor.id,
      status: 'building', passengerIds: [], resources: emptyInventory(), paidMaterials: { ...emptyInventory(), ...BOAT_BUILD_COST }, progress: 0,
      accessLand: access.land };
    (state.boats ??= []).push(boat);
  }
  clearAssignment(state, worker, hook);
  harbor.seaAccess = { ...access.water };
  boat.builderId = worker.id;
  worker.action = 'boatbuilding'; worker.targetBoatId = boat.id;
  worker.command = ['S_01', 'V_06', 'O_03', 'O_01']; worker.tx = harbor.x; worker.ty = harbor.y;
  return result(true, 'Lo scafo pagato viene lavorato realmente all’approdo; il lavoro interrotto resta riprendibile.', boat, [worker]);
}
export function canBoardBoat(state: GameState, boat: Boat, workers: Unit[]): string | undefined {
  if (!ownBoat(state, boat) || boat.status !== 'moored' || !boat.accessLand) return 'Serve una barca pronta e ormeggiata presso una riva asciutta.';
  if (!workers.length || workers.some((worker) => !landWorker(state, worker, boat.accessLand!))) return 'Il gruppo deve raggiungere l’accesso alla barca sulla terraferma.';
  const reserved = state.units.filter((unit) => unit.hp > 0 && unit.action === 'embarking' && unit.targetBoatId === boat.id && !workers.includes(unit));
  if (boatPassengers(state, boat).length + reserved.length + workers.length > BOAT_PASSENGER_CAPACITY)
    return 'La barca ha tre posti. Scegli un gruppo che trovi posto insieme ai passeggeri già a bordo.';
  const extra = [...reserved, ...workers].reduce((sum, unit) => sum + (unit.carry && unit.carry.resource !== 'coin' ? unit.carry.amount : 0), 0);
  if (extra > boatFreeCapacity(state, boat) + EPSILON) return 'Il carico delle persone supera lo spazio libero nella barca.';
}
export function assignBoarding(state: GameState, boat: Boat, workers: Unit[], hook?: AssignHook): MaritimeResult {
  const error = canBoardBoat(state, boat, workers);
  if (error) return result(false, error);
  for (const unit of workers) {
    clearAssignment(state, unit, hook);
    unit.action = 'embarking'; unit.targetBoatId = boat.id;
    unit.command = ['S_01', 'V_01']; unit.tx = boat.accessLand!.x; unit.ty = boat.accessLand!.y;
  }
  return result(true, 'Il gruppo raggiunge il pontile e sale a bordo con i propri carichi.', boat, workers);
}
function voyage(state: GameState, boat: Boat, destination: SeaPoint, landing?: SeaPoint) {
  let water = destination, land = landing;
  if (!land && isDryLandPoint(state, destination)) {
    const access = findShoreAccess(state, destination, 16);
    if (!access) return { error: 'Scegli una riva asciutta vicina al mare per sbarcare.' };
    water = access.water; land = access.land;
  }
  if (land && (!isDryLandPoint(state, land) || distance(land, water) > 20)) return { error: 'Lo sbarco deve raggiungere una riva asciutta a portata della barca.' };
  const route = planSeaRoute(state, boat, water);
  if (!route) return { error: 'La rotta deve rimanere in mare e aggirare la terraferma.' };
  return { water: { ...water }, land: land ? { ...land } : undefined, route };
}
export function canSailBoat(state: GameState, boat: Boat, destination: SeaPoint, landing?: SeaPoint): string | undefined {
  if (!ownBoat(state, boat) || boat.status === 'building' || boat.status === 'landing') return 'La barca deve essere pronta per salpare.';
  if (!boatPassengers(state, boat).some((unit) => unit.age >= 4)) return 'Serve almeno un adulto vivo a bordo per condurre la barca.';
  if (state.units.some((unit) => unit.hp > 0 && unit.targetBoatId === boat.id && unit.action === 'embarking')) return 'Attendi che tutti abbiano terminato l’imbarco.';
  return voyage(state, boat, destination, landing).error;
}
export function assignSailing(state: GameState, boat: Boat, destination: SeaPoint, landing?: SeaPoint, hook?: AssignHook): MaritimeResult {
  const error = canSailBoat(state, boat, destination, landing);
  if (error) return result(false, error);
  const plan = voyage(state, boat, destination, landing);
  const passengers = boatPassengers(state, boat);
  for (const unit of passengers) { clearAssignment(state, unit, hook); unit.action = 'sailing'; unit.command = ['S_01', 'V_01', 'O_01']; }
  boat.route = plan.route!.map((point) => ({ ...point }));
  // A zero-length voyage can still be an explicit landing at the current beach.
  if (!boat.route.length) boat.route.push({ ...plan.water! });
  boat.routeIndex = 0; boat.destination = plan.water; boat.landing = plan.land;
  boat.accessLand = undefined; boat.harborId = undefined; boat.status = 'sailing';
  return result(true, plan.land ? 'La barca segue la rotta in mare e raggiunge la riva prima dello sbarco.' : 'La barca segue la rotta in mare con persone e carichi reali.', boat, passengers);
}
const resourcesFor = (requested?: Resource | Resource[]) => requested === undefined ? [...food] : Array.isArray(requested) ? [...new Set(requested)] : [requested];
export function canTransferCargo(state: GameState, boat: Boat, workers: Unit[], requested: Resource | Resource[] | undefined, direction: 'load' | 'unload'): string | undefined {
  if (!ownBoat(state, boat) || boat.status !== 'moored' || !boat.accessLand) return 'Il trasferimento richiede una barca ormeggiata presso una riva asciutta.';
  if (!workers.length || workers.some((unit) => !landWorker(state, unit, boat.accessLand!))) return 'Gli addetti devono raggiungere la riva della barca a piedi.';
  const resources = resourcesFor(requested);
  if (!resources.length || resources.some((resource) => !RESOURCE_ORDER.includes(resource))) return 'Scegli un carico fisico conosciuto.';
  if (direction === 'unload' && !resources.some((resource) => boat.resources[resource] > 0)) return 'Questo carico non è presente nella barca.';
  if (direction === 'load' && boatFreeCapacity(state, boat) <= EPSILON) return 'La stiva è piena.';
}
export function assignCargoTransfer(state: GameState, boat: Boat, workers: Unit[], requested: Resource | Resource[] | undefined, direction: 'load' | 'unload', hook?: AssignHook): MaritimeResult {
  const error = canTransferCargo(state, boat, workers, requested, direction);
  if (error) return result(false, error);
  for (const unit of workers) {
    clearAssignment(state, unit, hook);
    unit.targetBoatId = boat.id; unit.action = direction === 'load' ? 'loadingBoat' : 'unloadingBoat';
    unit.cargoResources = resourcesFor(requested);
    unit.command = ['S_01', 'V_04', requested === 'wood' ? 'O_03' : requested === 'stone' ? 'O_02' : 'O_04', direction === 'load' ? 'M_02' : 'O_01'];
    unit.tx = boat.accessLand!.x; unit.ty = boat.accessLand!.y;
  }
  return result(true, direction === 'load' ? 'Gli addetti raccolgono scorte reali e le portano alla barca.' : 'Gli addetti scaricano dalla barca: le scorte aumentano soltanto alla consegna reale.', boat, workers);
}

function idle(state: GameState, unit: Unit) {
  clearAssignment(state, unit);
}
function interpolate(unit: Unit, from: SeaPoint, to: SeaPoint, dt: number) {
  unit.progress += dt;
  const span = distance(from, to), fraction = span <= EPSILON ? 1 : Math.min(1, (unit.progress * 4) / span);
  unit.x = from.x + (to.x - from.x) * fraction; unit.y = from.y + (to.y - from.y) * fraction;
  return fraction >= 1;
}
function finishLanding(state: GameState, unit: Unit, boat: Boat) {
  boat.passengerIds = boat.passengerIds.filter((id) => id !== unit.id);
  unit.boatId = undefined;
  const land = boat.landing!;
  unit.x = land.x; unit.y = land.y;
  idle(state, unit);
  if (unit.carry && planLandRoute(state, unit, state.home)) {
    unit.action = 'returning'; unit.command = ['S_01', 'V_04'];
  } else {
    if (unit.carry) { ground(state, unit.carry.resource, unit.carry.amount, unit); unit.carry = undefined; }
    unit.deliveryBoatId = boat.id; unit.deliveryPoint = { ...land };
  }
}
/** Executes only physical work. The common unit FSM still pays hunger, cold and illness. */
export function processMaritimeWork(state: GameState, unit: Unit, dt: number): boolean {
  if (!maritimeEnabled(state) || !Number.isFinite(dt) || dt <= 0) return false;
  const boat = (state.boats ?? []).find((entry) => entry.id === (unit.boatId ?? unit.targetBoatId));
  if (unit.action === 'boatbuilding') {
    if (!boat || boat.status !== 'building' || boat.builderId !== unit.id) { idle(state, unit); return true; }
    const harbor = state.buildings.find((entry) => entry.id === boat.harborId);
    if (!harbor || !usableHarbor(state, harbor) || unit.hunger >= 75 || unit.temp <= 30) { idle(state, unit); return true; }
    if (!moveOnLand(state, unit, harbor, 4 * dt)) return true;
    boat.progress = Math.min(BOAT_BUILD_SECONDS, boat.progress + dt);
    unit.progress = boat.progress;
    if (boat.progress >= BOAT_BUILD_SECONDS) {
      boat.status = 'moored'; boat.builderId = undefined;
      revealMaritimePoint(state, boat); revealMaritimePoint(state, harbor);
      idle(state, unit);
      log(state, 'La barca è pronta all’ormeggio. Persone e carichi possono salire a bordo.', 'good');
    }
    return true;
  }
  if (unit.action === 'embarking') {
    if (!boat || boat.status !== 'moored' || !boat.accessLand) { idle(state, unit); return true; }
    if (!unit.embarkFrom) {
      if (!moveOnLand(state, unit, boat.accessLand, 4 * dt)) return true;
      unit.embarkFrom = { x: unit.x, y: unit.y }; unit.progress = 0;
      return true;
    }
    if (interpolate(unit, unit.embarkFrom, boat, dt)) {
      unit.boatId = boat.id; boat.passengerIds.push(unit.id);
      unit.targetBoatId = undefined; unit.embarkFrom = undefined; unit.progress = 0;
      unit.action = 'sailing';
      revealMaritimePoint(state, boat);
    }
    return true;
  }
  if (unit.action === 'disembarking' && boat?.landing) {
    unit.embarkFrom ??= { x: boat.x, y: boat.y };
    if (interpolate(unit, unit.embarkFrom, boat.landing, dt)) finishLanding(state, unit, boat);
    return true;
  }
  return false;
}

function cargoSource(state: GameState, unit: Unit, boat: Boat) {
  const allowed = unit.cargoResources ?? food;
  const piles = state.entities.filter((entity) => entity.kind === 'ground' && entity.amount > 0 && entity.resource &&
    allowed.includes(entity.resource) && distance(entity, boat.accessLand!) <= 80 && !!planLandRoute(state, unit, entity));
  piles.sort((a, b) => distance(unit, a) - distance(unit, b));
  const pile = piles[0];
  const campResource = allowed.find((resource) => state.resources[resource] > 0);
  const camp = campResource && planLandRoute(state, unit, state.home);
  if (pile && (!camp || distance(unit, pile) <= distance(unit, state.home))) return { point: pile, pile, resource: pile.resource! };
  return camp && campResource ? { point: state.home, resource: campResource } : undefined;
}
/** The shore worker carries each load; no operation transfers distant camp stocks directly. */
export function processMaritimeCargo(state: GameState, unit: Unit, dt: number): boolean {
  if (!maritimeEnabled(state) || !['loadingBoat', 'unloadingBoat'].includes(unit.action)) return false;
  const boat = state.boats?.find((entry) => entry.id === unit.targetBoatId);
  if (!boat || boat.status !== 'moored' || !boat.accessLand) { idle(state, unit); return true; }
  if (unit.action === 'loadingBoat') {
    if (!unit.carry) {
      if (boatFreeCapacity(state, boat) <= EPSILON) { idle(state, unit); return true; }
      const source = cargoSource(state, unit, boat);
      if (!source) { idle(state, unit); return true; }
      if (!moveOnLand(state, unit, source.point, 4 * dt)) { unit.progress = 0; return true; }
      unit.progress += dt;
      if (unit.progress < TRANSFER_SECONDS) return true;
      const available = source.pile ? source.pile.amount : state.resources[source.resource];
      const amount = Math.min(fishingCapacity(state), boatFreeCapacity(state, boat), available);
      if (amount <= EPSILON) { unit.progress = 0; return true; }
      if (source.pile) source.pile.amount -= amount; else state.resources[source.resource] -= amount;
      unit.carry = { resource: source.resource, amount }; unit.progress = 0;
      return true;
    }
    if (!moveOnLand(state, unit, boat.accessLand, 4 * dt)) { unit.progress = 0; return true; }
    unit.progress += dt;
    if (unit.progress >= TRANSFER_SECONDS) {
      const amount = Math.min(unit.carry.amount, unit.carry.resource === 'coin' ? unit.carry.amount : boatFreeCapacity(state, boat));
      boat.resources[unit.carry.resource] += amount; unit.carry.amount -= amount; unit.progress = 0;
      if (unit.carry.amount <= EPSILON) unit.carry = undefined;
      if (unit.carry || boatFreeCapacity(state, boat) <= EPSILON) idle(state, unit);
    }
    return true;
  }
  if (!unit.carry) {
    if (!moveOnLand(state, unit, boat.accessLand, 4 * dt)) { unit.progress = 0; return true; }
    const resource = (unit.cargoResources ?? food).find((candidate) => boat.resources[candidate] > 0);
    if (!resource) { idle(state, unit); return true; }
    unit.progress += dt;
    if (unit.progress < TRANSFER_SECONDS) return true;
    const amount = Math.min(fishingCapacity(state), boat.resources[resource]);
    boat.resources[resource] -= amount; unit.carry = { resource, amount }; unit.progress = 0;
    unit.deliveryPoint = planLandRoute(state, unit, state.home) ? { ...state.home } : { ...boat.accessLand };
    return true;
  }
  if (!unit.deliveryPoint) unit.deliveryPoint = planLandRoute(state, unit, state.home) ? { ...state.home } : { ...boat.accessLand };
  if (!moveOnLand(state, unit, unit.deliveryPoint, 4 * dt)) { unit.progress = 0; return true; }
  // The common return branch delivers into the real home store. On an island,
  // unloading instead leaves an extracted pile at the actual landing place.
  if (distance(unit.deliveryPoint, state.home) < EPSILON) {
    unit.action = 'returning'; unit.deliveryBoatId = undefined;
  } else {
    ground(state, unit.carry.resource, unit.carry.amount, unit);
    unit.carry = undefined; unit.deliveryPoint = undefined; unit.progress = 0;
  }
  return true;
}

/** An expedition's gathered load returns to its waiting vessel, not across the sea on foot. */
export function processBoatDelivery(state: GameState, unit: Unit, dt: number): boolean {
  if (!maritimeEnabled(state) || !unit.deliveryBoatId || !unit.carry) return false;
  const boat = state.boats?.find((entry) => entry.id === unit.deliveryBoatId && entry.status === 'moored' && entry.accessLand);
  if (!boat) {
    ground(state, unit.carry.resource, unit.carry.amount, unit); unit.carry = undefined; idle(state, unit);
    return true;
  }
  if (!moveOnLand(state, unit, boat.accessLand!, 4 * dt)) { unit.progress = 0; return true; }
  unit.progress += dt;
  if (unit.progress < TRANSFER_SECONDS) return true;
  const amount = Math.min(unit.carry.amount, unit.carry.resource === 'coin' ? unit.carry.amount : boatFreeCapacity(state, boat));
  boat.resources[unit.carry.resource] += amount; unit.carry.amount -= amount; unit.progress = 0;
  if (unit.carry.amount <= EPSILON) unit.carry = undefined;
  if (unit.carry) { ground(state, unit.carry.resource, unit.carry.amount, unit); unit.carry = undefined; }
  // The ordinary guided gather loop can choose its next paid local trip.
  return true;
}
export function expeditionBoat(state: GameState, unit: Unit) {
  if (!maritimeEnabled(state) || planLandRoute(state, unit, state.home)) return undefined;
  return (state.boats ?? []).filter((boat) => boat.ownerId === 'player' && boat.status === 'moored' && boat.accessLand &&
    !!planLandRoute(state, unit, boat.accessLand)).sort((a, b) => distance(unit, a.accessLand!) - distance(unit, b.accessLand!))[0];
}

/** Vessels advance after the shared biological update, with finite speed and no foot shortcuts. */
export function updateMaritime(state: GameState, dt: number) {
  if (!maritimeEnabled(state) || state.paused || !Number.isFinite(dt) || dt <= 0) return;
  for (const unit of state.units) if (unit.hp <= 0) detachBoatPassenger(state, unit);
  for (const boat of state.boats ?? []) {
    const builder = state.units.find((unit) => unit.id === boat.builderId);
    if (boat.builderId && (!builder || builder.hp <= 0 || builder.action !== 'boatbuilding' || builder.targetBoatId !== boat.id)) boat.builderId = undefined;
    if (boat.harborId && !state.buildings.some((building) => building.id === boat.harborId && building.hp > 0)) boat.harborId = undefined;
    boat.passengerIds = boatPassengers(state, boat).map((unit) => unit.id);
    const passengers = boatPassengers(state, boat);
    if (boat.status === 'sailing') {
      if (!passengers.some((unit) => unit.age >= 4)) {
        boat.status = 'moored'; boat.route = undefined; boat.routeIndex = undefined; boat.destination = undefined; boat.landing = undefined;
      } else {
        let remaining = BOAT_SPEED * dt;
        while (remaining > EPSILON && boat.route && (boat.routeIndex ?? 0) < boat.route.length) {
          const target = boat.route[boat.routeIndex ?? 0], length = distance(boat, target);
          if (!isSeaSegment(state, boat, target)) { boat.status = 'moored'; boat.route = undefined; boat.routeIndex = undefined; boat.destination = undefined; boat.landing = undefined; break; }
          const step = Math.min(length, remaining);
          if (length > EPSILON) { boat.x += ((target.x - boat.x) / length) * step; boat.y += ((target.y - boat.y) / length) * step; }
          remaining -= step;
          if (step >= length - EPSILON) { boat.x = target.x; boat.y = target.y; boat.routeIndex = (boat.routeIndex ?? 0) + 1; }
          else break;
        }
        if (boat.status === 'sailing' && boat.route && (boat.routeIndex ?? 0) >= boat.route.length) {
          if (boat.landing) {
            boat.status = 'landing';
            for (const unit of passengers) { unit.action = 'disembarking'; unit.embarkFrom = { x: boat.x, y: boat.y }; unit.progress = 0; }
          } else boat.status = 'moored';
          boat.route = undefined; boat.routeIndex = undefined; boat.destination = undefined;
        }
      }
    }
    for (const unit of passengers) if (unit.action !== 'disembarking') {
      unit.x = boat.x; unit.y = boat.y; unit.action = 'sailing'; revealMaritimePoint(state, unit);
    }
    if (boat.status === 'landing' && boat.passengerIds.length === 0 && boat.landing) {
      boat.accessLand = { ...boat.landing };
      boat.harborId = state.buildings.find((building) => building.kind === 'harbor' && building.hp > 0 && distance(building, boat.landing!) < 1)?.id;
      boat.landing = undefined; boat.status = 'moored';
    }
  }
}

/** Stock access remains on its landmass; an island cannot pay with a distant camp. */
export function hasLandCampAccess(state: GameState, unit: Unit) {
  return !maritimeEnabled(state) || (!unit.boatId && !!planLandRoute(state, unit, state.home));
}
