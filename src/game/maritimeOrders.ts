import { getPredicate } from './grammar';
import { RESOURCE_ORDER } from './content';
import { enforceActionLaws } from './imperial';
import { isSeaPoint } from './coastGeometry';
import { isWorldPointRevealed } from './worldDimensions';
import { distance, isPlayerBuilding } from './runtime';
import {
  assignBoarding,
  assignCargoTransfer,
  assignSailing,
  beginBoatBuild,
  canBeginBoatBuild,
  canBoardBoat,
  canSailBoat,
  canTransferCargo,
} from './maritime';
import type { Boat, GameState, Resource, Target, Unit } from './types';

export interface MaritimeOrderResult {
  handled: boolean;
  valid?: boolean;
  message?: string;
  unitIds?: string[];
}

/** The words identify the direction of an actual transfer, not an inventory
 * conversion. Preda can refer to each of the five distinct food resources. */
export function maritimeCargoResources(
  tokens: string[],
  target?: Target,
): Resource | Resource[] | undefined {
  if (target?.type === 'boat' && target.cargoResource) return target.cargoResource;
  if (tokens.includes('O_02')) return 'stone';
  if (tokens.includes('O_03')) return 'wood';
  if (tokens.includes('O_07')) return ['ore', 'ingot'];
  if (tokens.includes('O_12')) return 'coin';
  return ['cooked', 'cookedFish', 'food', 'meat', 'fish'];
}

/** Called only after normal word, slot, voice and time checks. Every physical
 * prerequisite is checked before laws or replacement orders can change state. */
export function handleMaritimeCommand(
  state: GameState,
  tokens: string[],
  target: Target | undefined,
  selectionCenter: Target | undefined,
  workers: Unit[],
  resetWorker: (unit: Unit) => void,
): MaritimeOrderResult {
  const predicate = getPredicate(tokens);
  const boatRecipe = predicate.verb === 'V_06' && predicate.args.join('|') === 'O_03|O_01';
  const steering = selectionCenter?.type === 'boat';
  const requestedBoat = target?.type === 'boat';
  if (!boatRecipe && !steering && !requestedBoat) return { handled: false };
  const fail = (message: string): MaritimeOrderResult => ({ handled: true, valid: false, message });
  if (state.mapGeneration?.maritimeRules !== 1)
    return fail('Questo mondo conserva le regole precedenti e non prevede viaggi marittimi.');
  if (predicate.condition) return fail('Le manovre della barca richiedono un ordine diretto.');
  if (['S_05', 'S_08', 'S_09'].includes(predicate.subject))
    return fail('Scegli i compagni della tribù per la barca.');
  const ownBoat = (id: string | undefined): Boat | undefined =>
    state.boats?.find((boat) => boat.id === id && boat.ownerId === 'player' && boat.hp > 0);
  const landWorkers = workers.filter(
    (unit) =>
      unit.hp > 0 &&
      unit.age >= 4 &&
      !unit.boatId &&
      (!unit.factionId || unit.factionId === 'player') &&
      !['embarking', 'disembarking', 'frontline', 'delegating'].includes(unit.action),
  );
  const approve = (ids: string[]) => enforceActionLaws(state, tokens, target, ids);
  const finish = (result: {
    ok: boolean;
    message: string;
    unitIds?: string[];
  }): MaritimeOrderResult => {
    if (result.ok)
      for (const id of result.unitIds ?? []) {
        const unit = state.units.find((candidate) => candidate.id === id);
        if (!unit) continue;
        unit.command = [...tokens];
        unit.lastOrderAt = state.time;
        unit.lastTaskResult = undefined;
      }
    return { handled: true, valid: result.ok, message: result.message, unitIds: result.unitIds };
  };
  if (boatRecipe) {
    const harbor =
      target?.type === 'building'
        ? state.buildings.find(
            (building) =>
              building.id === target.id &&
              building.kind === 'harbor' &&
              isPlayerBuilding(state, building),
          )
        : undefined;
    if (!harbor) return fail('Scegli un approdo della tribù completato e accessibile.');
    const ordered = [...landWorkers].sort((a, b) => distance(a, harbor) - distance(b, harbor));
    const worker = ordered.find((unit) => !canBeginBoatBuild(state, unit, harbor));
    if (!worker)
      return fail(
        ordered[0]
          ? canBeginBoatBuild(state, ordered[0], harbor)!
          : 'Nessun adulto disponibile può raggiungere l’approdo.',
      );
    if (!approve([worker.id])) return { handled: true, valid: false };
    return finish(beginBoatBuild(state, worker, harbor, resetWorker));
  }
  if (steering) {
    if (predicate.verb !== 'V_01' || predicate.args.join('|') !== 'O_01')
      return fail(
        'L’equipaggio guida la barca con Andare e Qui. Sbarca per affidargli lavori sulla terraferma.',
      );
    const boat = ownBoat(selectionCenter.id);
    if (!boat)
      return fail('Questa imbarcazione non appartiene alla tribù o non è più disponibile.');
    let destination: { x: number; y: number } | undefined;
    let landing: { x: number; y: number } | undefined;
    if (target?.type === 'building') {
      const harbor = state.buildings.find(
        (building) =>
          building.id === target.id &&
          building.kind === 'harbor' &&
          building.hp > 0 &&
          building.completed !== false &&
          isPlayerBuilding(state, building),
      );
      if (!harbor?.seaAccess) return fail('Scegli un approdo completato con accesso al mare.');
      destination = harbor.seaAccess;
      landing = { x: harbor.x, y: harbor.y };
    } else if (target?.type === 'point') {
      if (!isSeaPoint(state, target) && !isWorldPointRevealed(state, target.x, target.y))
        return fail('Esplora questo tratto di mare prima di scegliere uno sbarco.');
      destination = target;
    }
    if (!destination) return fail('Indica una destinazione in mare o una riva osservata.');
    const problem = canSailBoat(state, boat, destination, landing);
    if (problem) return fail(problem);
    const ids = boat.passengerIds.filter((id) =>
      state.units.some((unit) => unit.id === id && unit.hp > 0),
    );
    if (!approve(ids)) return { handled: true, valid: false };
    return finish(assignSailing(state, boat, destination, landing, resetWorker));
  }
  const boat = ownBoat(target?.id);
  if (!boat) return fail('Questa imbarcazione non appartiene alla tribù o non è più disponibile.');
  if (predicate.verb === 'V_01') {
    const problem = canBoardBoat(state, boat, landWorkers);
    if (problem) return fail(problem);
    if (!approve(landWorkers.map((unit) => unit.id))) return { handled: true, valid: false };
    return finish(assignBoarding(state, boat, landWorkers, resetWorker));
  }
  if (predicate.verb === 'V_04') {
    if (target?.cargoResource && !RESOURCE_ORDER.includes(target.cargoResource))
      return fail('Il carico scelto non è disponibile.');
    const direction = predicate.args.includes('M_02') ? 'load' : 'unload';
    const resources = maritimeCargoResources(tokens, target);
    const problem = canTransferCargo(state, boat, landWorkers, resources, direction);
    if (problem) return fail(problem);
    if (!approve(landWorkers.map((unit) => unit.id))) return { handled: true, valid: false };
    return finish(assignCargoTransfer(state, boat, landWorkers, resources, direction, resetWorker));
  }
  return fail('La barca si raggiunge con Andare e si carica o scarica con Portare.');
}
