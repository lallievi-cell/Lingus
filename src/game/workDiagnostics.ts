import { ACTION_NAMES, ADULT_AGE, BUILDING_SPECS, RESOURCE_SPECS } from './content';
import { getDogmaEffects } from './dogmas';
import { entityResource, getSeason } from './simulation';
import {
  activeUnits,
  buildingWorkers,
  canPay,
  distance,
  freeCapacity,
  isPlayerBuilding,
} from './runtime';
import type { Building, GameState, Target, Unit } from './types';

export type WorkCategory = 'idle' | 'working' | 'recovering' | 'young' | 'dead';
export interface WorkStatus {
  category: WorkCategory;
  tone: 'neutral' | 'warning' | 'danger';
  title: string;
  detail: string;
  target?: Target;
  assignment?: { buildingId: string; label: string; state: 'assigned' | 'suspended' };
}
const atBuilding = (b: Building): Target => ({ type: 'building', id: b.id, x: b.x, y: b.y });

/** Observations of the current FSM, never guesses about the reason a past order ended. */
export function getUnitWorkStatus(state: GameState, unit: Unit): WorkStatus {
  const jobId = unit.jobBuildingId ?? unit.suspendedJob?.buildingId;
  const building = state.buildings.find((b) => b.id === jobId);
  const assignment = building
    ? {
        buildingId: building.id,
        label: BUILDING_SPECS[building.kind].label,
        state: unit.jobBuildingId ? ('assigned' as const) : ('suspended' as const),
      }
    : undefined;
  const result = (
    category: WorkCategory,
    title: string,
    detail: string,
    tone: WorkStatus['tone'] = 'neutral',
    target?: Target,
  ): WorkStatus => ({ category, title, detail, tone, target, assignment });
  if (unit.hp <= 0) return result('dead', 'Vita conclusa', 'Non può ricevere incarichi.');
  if (unit.age < ADULT_AGE)
    return result('young', 'Cresce e impara', 'Non lavora. Può imparare attorno al falò.');
  if (unit.suspendedJob && building) {
    const fx = getDogmaEffects(state, { unit });
    const night = getSeason(state).isNight;
    const command = unit.suspendedJob.command;
    const resting = fx.nightWatch ? !night : night;
    const continuousFire = building.kind === 'campfire' && !['C_01', 'C_02'].includes(command[0]);
    const outsideShift = !continuousFire && (command[0] === 'C_01' ? !night : resting);
    const reasons = [
      building.hp <= 0 ? 'l’edificio è distrutto' : undefined,
      !building.active && building.kind !== 'campfire' ? 'l’edificio è inattivo' : undefined,
      unit.hunger >= 75 ? 'deve mangiare' : undefined,
      unit.temp <= 30 ? 'deve scaldarsi' : undefined,
      outsideShift || (fx.nightTaboo && night) ? 'è fuori turno' : undefined,
      (building.workerIds ?? []).filter((id) =>
        state.units.some((u) => u.id === id && u.hp > 0 && u.jobBuildingId === building.id),
      ).length >= BUILDING_SPECS[building.kind].workers
        ? 'i posti sono occupati'
        : undefined,
    ].filter(Boolean);
    return result(
      'recovering',
      'Incarico in pausa',
      `${assignment!.label}: ${reasons.length ? reasons.join('; ') : 'attende di riprendere'}. Tenterà di tornare quando è in forze, nel proprio turno e con un posto libero; leggi e dogmi possono impedirlo.`,
      reasons.some((r) => r === 'deve mangiare' || r === 'deve scaldarsi') ? 'warning' : 'neutral',
      atBuilding(building),
    );
  }
  if (unit.action === 'fleeing')
    return result(
      'recovering',
      'Cerca riparo',
      'Sta fuggendo verso il campo dopo un pericolo.',
      'danger',
    );
  if (unit.action === 'sleeping')
    return result(
      'recovering',
      'Riposa',
      'Il riposo interrompe i compiti diretti; gli incarichi salvati possono riprendere nel proprio turno.',
    );
  if (unit.action === 'resting')
    return result(
      'recovering',
      unit.temp <= 30 ? 'Cerca calore' : 'Raggiunge il riposo',
      'Si sta spostando verso un luogo di riposo o un riparo.',
      unit.temp <= 20 ? 'danger' : 'neutral',
      building ? atBuilding(building) : undefined,
    );
  if (unit.action === 'idle')
    return result(
      'idle',
      'Senza incarico',
      'Nessun ordine in esecuzione. Può cercare autonomamente cibo e riposo; un compito diretto concluso va ordinato di nuovo.',
    );
  if (unit.action === 'returning')
    return result(
      'working',
      'Consegna al campo',
      unit.carry
        ? `${RESOURCE_SPECS[unit.carry.resource].label} in viaggio: non sono ancora nelle scorte.`
        : 'Sta completando il ritorno al campo.',
      'neutral',
      { type: 'point', ...state.home },
    );
  if (building && unit.jobBuildingId) {
    if (building.hp <= 0 || !building.active)
      return result(
        'working',
        'Postazione ferma',
        'Il lavoro non produce finché l’edificio è inattivo. Controlla manutenzione e condizioni dell’addetto.',
        'warning',
        atBuilding(building),
      );
    if (distance(unit, building) > 3)
      return result(
        'working',
        'Raggiunge la postazione',
        `${assignment!.label}: è assegnato, ma deve ancora arrivare prima di contribuire.`,
        'neutral',
        atBuilding(building),
      );
    if (unit.hunger >= 75 || unit.temp <= 30)
      return result(
        'working',
        'Addetto in difficoltà',
        'Fame o freddo impediscono di contribuire al rendimento del lavoro.',
        'warning',
        atBuilding(building),
      );
    return result(
      'working',
      'Al lavoro',
      `${assignment!.label}: contribuisce quando esegue il lavoro vicino alla postazione.`,
      'neutral',
      atBuilding(building),
    );
  }
  const source = state.entities.find((e) => e.id === unit.targetId);
  if (source && ['gathering', 'hunting', 'eating', 'domesticating'].includes(unit.action)) {
    if (
      unit.command?.includes('V_04') &&
      freeCapacity(state, entityResource(source)) <= 0 &&
      !unit.carry
    )
      return result(
        'working',
        'Scorte piene',
        'Non c’è spazio per un altro carico. Libera le scorte o aumenta la capacità con una costruzione conosciuta.',
        'warning',
      );
    if (source.amount <= 0)
      return result(
        'working',
        'Bersaglio esaurito',
        'Il compito non può proseguire su questa fonte. Scegli un nuovo bersaglio.',
        'warning',
      );
    return result(
      'working',
      ACTION_NAMES[unit.action] ?? 'Al lavoro',
      'Raggiunge il bersaglio, poi esegue l’azione. Un nuovo ordine può interromperla.',
      'neutral',
      { type: 'entity', id: source.id, x: source.x, y: source.y },
    );
  }
  if (unit.craftNeedsPayment)
    return result(
      'working',
      'Prepara il prossimo manufatto',
      'Il prossimo ciclo richiede altra pietra utilizzabile e spazio nelle scorte; altrimenti il compito si conclude.',
    );
  const guardingHome =
    unit.action === 'guarding' && unit.command?.includes('O_01') && !unit.command.includes('O_05');
  return result(
    unit.action === 'eating' && !unit.command ? 'recovering' : 'working',
    guardingHome ? 'Sorveglia il campo' : (ACTION_NAMES[unit.action] ?? 'In attività'),
    unit.command
      ? 'Esegue un ordine diretto. Fame, freddo, riposo e regole possono interromperlo.'
      : 'Segue i propri bisogni o un compito della comunità.',
  );
}

export function getBuildingWorkStatus(state: GameState, building: Building) {
  const spec = BUILDING_SPECS[building.kind];
  const city = state.cities.find((c) => c.id === building.cityId);
  const inventory = city && !city.capital ? city.resources : state.resources;
  const assigned = activeUnits(state).filter((u) => u.jobBuildingId === building.id);
  const suspended = activeUnits(state).filter((u) => u.suspendedJob?.buildingId === building.id);
  const contributing = assigned.filter(
    (u) =>
      distance(u, building) <= 3 &&
      u.hunger < 75 &&
      u.temp > 30 &&
      ['working', 'farming', 'smelting', 'copying', 'researching', 'guarding'].includes(u.action),
  ).length;
  const reasons: string[] = [];
  if (building.hp <= 0) reasons.push('Edificio distrutto.');
  else if (building.completed === false) reasons.push('Costruzione in corso: non produce ancora.');
  else if (!building.active)
    reasons.push(
      building.kind === 'campfire'
        ? 'Falò spento: non riscalda.'
        : 'Edificio inattivo: non produce. La manutenzione viene verificata al cambio di stagione previsto.',
    );
  if (!isPlayerBuilding(state, building)) reasons.push('Appartiene a un’altra comunità.');
  if (spec.workers > 0 && !city && building.completed !== false && building.hp > 0) {
    if (!assigned.length)
      reasons.push(
        suspended.length ? 'Gli incarichi salvati sono in pausa.' : 'Nessun addetto assegnato.',
      );
    else if (!contributing)
      reasons.push(
        'Gli addetti sono in viaggio, fuori attività o devono recuperare fame e calore.',
      );
  }
  if (building.kind === 'pen' && !(building.livestock! > 0))
    reasons.push('Il recinto non contiene bestiame.');
  if (building.kind === 'farm')
    reasons.push(
      'Il raccolto arriva alla fine dell’autunno e dipende dal lavoro svolto durante la stagione.',
    );
  if (building.kind === 'foundry') {
    const mode =
      building.productionMode ??
      (assigned.some((u) => u.command?.includes('O_08'))
        ? 'coin'
        : assigned.some((u) => u.command?.includes('V_03'))
          ? 'metalArms'
          : 'ingot');
    if (!canPay(inventory, mode === 'ingot' ? { ore: 1, wood: 2 } : { ingot: 1 }))
      reasons.push(
        mode === 'ingot'
          ? 'Per raffinare servono minerale e legna consegnati.'
          : 'Questa lavorazione richiede lingotti consegnati.',
      );
  }
  if (
    !city &&
    building.kind === 'foundry' &&
    building.productionMode !== 'coin' &&
    !assigned.some((u) => u.command?.includes('O_08')) &&
    freeCapacity(state, 'ingot') <= 0
  )
    reasons.push('Le scorte dei materiali sono piene: manca spazio per il prodotto.');
  return {
    assigned: assigned.length,
    suspended: suspended.length,
    contributing,
    required: spec.workers,
    urban: !!city,
    reasons,
    healthy: building.hp > 0 && building.active && building.completed !== false,
    observedEfficiency: city ? building.lastEfficiency : undefined,
    workersInRange: buildingWorkers(state, building),
  };
}

export type TribeFilter =
  | 'all'
  | 'urgent'
  | 'idle'
  | 'working'
  | 'recovering'
  | 'custodians'
  | 'young';
export type TribeTask =
  | 'any'
  | 'transport'
  | 'gathering'
  | 'craft'
  | 'guard'
  | 'building'
  | 'assigned';
export function matchesTribeTask(unit: Unit, task: TribeTask) {
  if (task === 'any') return true;
  if (task === 'transport')
    return !!unit.carry || unit.action === 'returning' || unit.command?.includes('V_04') === true;
  if (task === 'gathering') return ['gathering', 'hunting', 'domesticating'].includes(unit.action);
  if (task === 'craft') return ['crafting', 'cooking', 'smelting'].includes(unit.action);
  if (task === 'guard') return ['guarding', 'patrolling'].includes(unit.action);
  if (task === 'building') return unit.action === 'building';
  return !!(unit.jobBuildingId || unit.suspendedJob);
}
export function matchesTribeFilter(
  state: GameState,
  unit: Unit,
  filter: TribeFilter,
  custodianIds: Set<string>,
) {
  if (filter === 'all') return true;
  if (filter === 'urgent') return unit.temp <= 20 || unit.hunger >= 75 || unit.hp <= 30;
  if (filter === 'custodians') return custodianIds.has(unit.id);
  return getUnitWorkStatus(state, unit).category === filter;
}
