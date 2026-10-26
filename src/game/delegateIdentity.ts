import { activeUnits, distance } from './runtime';
import { killUnit } from './simulation';
import type { Caravan, City, GameState, Unit } from './types';

/** Anonymous cohorts need no invented person; fully represented cities send an actual Sage. */
export function chooseDelegateIdentity(state: GameState, source: City) {
  const sages = activeUnits(state).filter(
    (unit) =>
      unit.cityId === source.id &&
      (unit.caste === 'sage' || (!unit.caste && unit.strength < 7 && unit.intelligence >= 7)),
  );
  if (source.cohorts.sages - sages.length >= 1) return { available: true, unit: undefined };
  const unit = sages.find(
    (person) =>
      person.age >= 4 &&
      !person.isKing &&
      !person.carry &&
      !['frontline', 'frontline-returning', 'delegating'].includes(person.action) &&
      !state.caravans.some(
        (caravan) => caravan.delegateUnitId === person.id && caravan.population > 0,
      ) &&
      distance(person, source) <= 15,
  );
  return { available: !!unit, unit };
}

export function departDelegateIdentity(state: GameState, caravan: Caravan, unit?: Unit) {
  if (!unit) return;
  caravan.delegateUnitId = unit.id;
  caravan.x = unit.x;
  caravan.y = unit.y;
  caravan.hp = unit.hp;
  unit.cityId = undefined;
  unit.action = 'delegating';
  unit.targetId = caravan.id;
  unit.command = ['S_04', 'V_04', 'O_09', 'S_09'];
  unit.jobBuildingId = undefined;
  unit.suspendedJob = undefined;
  unit.progress = 0;
  for (const building of state.buildings)
    building.workerIds = building.workerIds?.filter((id) => id !== unit.id);
}

export function settleDelegateIdentity(state: GameState, caravan: Caravan, destination: City) {
  const unit = state.units.find((person) => person.id === caravan.delegateUnitId && person.hp > 0);
  if (!unit) return;
  unit.x = caravan.x;
  unit.y = caravan.y;
  unit.cityId = destination.id;
  unit.action = destination.factionId === 'player' ? 'idle' : 'delegating';
  unit.targetId = destination.factionId === 'player' ? undefined : caravan.id;
  unit.command = undefined;
  unit.tx = undefined;
  unit.ty = undefined;
  if (caravan.returning) caravan.delegateUnitId = undefined;
}

/** With no friendly refuge the living person remains at the actual travelled point. */
export function strandDelegateIdentity(state: GameState, caravan: Caravan) {
  const unit = state.units.find((person) => person.id === caravan.delegateUnitId && person.hp > 0);
  if (unit) {
    unit.x = caravan.x;
    unit.y = caravan.y;
    unit.action = 'idle';
    unit.targetId = undefined;
    unit.command = undefined;
  }
  caravan.delegateUnitId = undefined;
}

function endDelegateIdentity(state: GameState, caravan: Caravan) {
  if (caravan.arrived && !caravan.returning) {
    const host = state.cities.find((city) => city.id === caravan.toCityId);
    if (host) {
      host.assimilation.delegateCount = Math.max(
        0,
        host.assimilation.delegateCount - (caravan.delegateCount ?? 1),
      );
      if (!host.assimilation.delegateCount) host.assimilation.active = false;
    }
  }
  caravan.population = 0;
  caravan.delegateCount = 0;
  caravan.hp = 0;
  caravan.arrived = true;
  caravan.delegateUnitId = undefined;
}

/** killUnit already updates the actual current city's cohort, if any. */
export function onDelegateIdentityDeath(state: GameState, unit: Unit) {
  for (const caravan of state.caravans)
    if (caravan.delegateUnitId === unit.id) endDelegateIdentity(state, caravan);
}

export function travellingDelegate(state: GameState, unit: Unit) {
  return state.caravans.some(
    (caravan) =>
      caravan.kind === 'delegate' &&
      caravan.delegateUnitId === unit.id &&
      !caravan.arrived &&
      caravan.hp > 0 &&
      caravan.population > 0,
  );
}

/** Only an actual arrived mission lets a player citizen eat at a foreign host. */
export function residentForeignDelegate(state: GameState, unit: Unit, cityId: string) {
  return state.caravans.some(
    (caravan) =>
      caravan.kind === 'delegate' &&
      caravan.delegateUnitId === unit.id &&
      caravan.arrived &&
      !caravan.returning &&
      caravan.population > 0 &&
      caravan.toCityId === cityId &&
      unit.cityId === cityId,
  );
}

export function synchronizeDelegateIdentities(state: GameState) {
  for (const caravan of state.caravans) {
    if (!caravan.delegateUnitId) continue;
    const unit = state.units.find((person) => person.id === caravan.delegateUnitId);
    if (!unit || unit.hp <= 0 || (unit.factionId !== undefined && unit.factionId !== 'player')) {
      endDelegateIdentity(state, caravan);
      continue;
    }
    if (caravan.arrived) {
      if (unit.cityId !== caravan.toCityId) endDelegateIdentity(state, caravan);
      continue;
    }
    if (caravan.hp <= 0) {
      killUnit(state, unit, 'V_03');
      continue;
    }
    unit.hp = Math.min(unit.hp, caravan.hp);
    caravan.hp = unit.hp;
    unit.x = caravan.x;
    unit.y = caravan.y;
    unit.tx = caravan.target.x;
    unit.ty = caravan.target.y;
    unit.action = 'delegating';
  }
}
