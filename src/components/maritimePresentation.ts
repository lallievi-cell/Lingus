import { RESOURCE_ORDER, RESOURCE_SPECS, WORDS } from '../game/content';
import { cognitiveSlots } from '../game/grammar';
import {
  BOAT_BUILD_SECONDS,
  BOAT_CAPACITY,
  BOAT_CARGO_CAPACITY,
  boatCargoAmount,
  boatPassengers,
} from '../game/maritime';
import { hasWord } from '../game/runtime';
import { suggestedBoardingGroup } from '../game/phrasebook';
import { isWorldPointRevealed } from '../game/worldDimensions';
import type { Boat, GameState, Resource, Target } from '../game/types';
import { describeStockQuantity, getInventoryEntries } from './campInventory';
import { resourceKnown } from './mapResourceLayout';

export interface MaritimePreparation {
  id: string;
  label: string;
  tokens: string[];
  target?: Target;
  groupAnchor?: Target;
  issue?: string;
  detail?: string;
}

export const boatTarget = (boat: Boat): Target => ({
  type: 'boat',
  id: boat.id,
  x: boat.x,
  y: boat.y,
});

/** The material is chosen explicitly, rather than being silently converted to
 * the first stock that shares its word. Unknown, unobserved goods stay hidden. */
export function getBoatCargoChoices(state: GameState, boat: Boat) {
  if (!getBoatPresentation(state, boat)?.owned) return [];
  const camp = getInventoryEntries(state);
  const aboard = getInventoryEntries(state, boat.resources);
  return RESOURCE_ORDER.flatMap((resource) => {
    const owned = (state.resources[resource] ?? 0) > 0 || (boat.resources[resource] ?? 0) > 0;
    if (!owned && !resourceKnown(state, resource)) return [];
    const entry =
      aboard.find((item) => item.resource === resource) ??
      camp.find((item) => item.resource === resource);
    return [{ resource, label: entry?.label ?? RESOURCE_SPECS[resource].label }];
  });
}

export function getSelectedCargoPreparations(
  state: GameState,
  boat: Boat,
  resource: Resource,
): MaritimePreparation[] {
  if (!getBoatCargoChoices(state, boat).some((choice) => choice.resource === resource)) return [];
  const issue =
    boat.status !== 'moored' || !boat.accessLand
      ? 'Le risorse si trasferiscono presso una riva di attracco.'
      : undefined;
  return [true, false].map((loading) =>
    maritimePreparation(
      state,
      {
        id: loading ? 'load-selected' : 'unload-selected',
        label: loading ? 'Prepara carico selezionato' : 'Prepara scarico selezionato',
        tokens: ['S_01', 'V_04', loading ? 'M_02' : 'O_01'],
        target: { ...boatTarget(boat), cargoResource: resource },
        groupAnchor: boat.accessLand ? { type: 'point', ...boat.accessLand } : undefined,
      },
      issue,
    ),
  );
}

export function boatStage(boat: Boat) {
  return boat.status === 'building'
    ? 'Scafo in costruzione'
    : boat.status === 'sailing'
      ? 'In navigazione'
      : boat.status === 'landing'
        ? 'Sbarco in corso'
        : 'Barca ormeggiata';
}

/** An order is only prepared here. No work, payment or simulation update occurs. */
export function maritimePreparation(
  state: GameState,
  action: Omit<MaritimePreparation, 'issue'>,
  issue?: string,
): MaritimePreparation {
  const missing = action.tokens.filter((id) => !hasWord(state, id));
  return {
    ...action,
    tokens: [...action.tokens],
    issue:
      missing.length > 0
        ? `Da riscoprire: ${missing.map((id) => WORDS[id]?.label ?? 'una parola').join(', ')}.`
        : action.tokens.length > cognitiveSlots(state)
          ? 'La frase richiede più spazi di pensiero di quelli disponibili.'
          : issue,
  };
}

export function getBoatPresentation(state: GameState, boat: Boat) {
  if (
    state.mapGeneration?.maritimeRules !== 1 ||
    boat.hp <= 0 ||
    !isWorldPointRevealed(state, boat.x, boat.y)
  )
    return null;
  const owned = boat.ownerId === 'player';
  const numbered = hasWord(state, 'O_08');
  const passengers = boatPassengers(state, boat);
  const cargo = boatCargoAmount(state, boat);
  const boarding = state.units.some(
    (unit) => unit.hp > 0 && unit.action === 'embarking' && unit.targetBoatId === boat.id,
  );
  return {
    label: owned ? 'La nostra barca' : 'Imbarcazione straniera',
    stage: boatStage(boat),
    owned,
    crew: numbered
      ? `${passengers.length}/${BOAT_CAPACITY} persone a bordo`
      : passengers.length > 0
        ? 'Equipaggio a bordo'
        : 'Senza equipaggio',
    cargo: numbered
      ? `${describeStockQuantity(cargo, true, true)}/${BOAT_CARGO_CAPACITY} di carico`
      : cargo <= 0
        ? 'Stiva vuota'
        : cargo >= BOAT_CARGO_CAPACITY
          ? 'Stiva piena'
          : 'Carico nella stiva',
    construction:
      boat.status === 'building'
        ? numbered
          ? `Lavoro: ${Math.min(100, Math.floor((boat.progress / BOAT_BUILD_SECONDS) * 100))}%`
          : boat.progress > 0
            ? 'La lavorazione dello scafo è iniziata.'
            : 'Materiali già riservati allo scafo.'
        : undefined,
    boarding,
    inventory: owned
      ? getInventoryEntries(state, boat.resources).filter((entry) => entry.amount > 0)
      : [],
  };
}

export function getBoatPreparations(state: GameState, boat: Boat): MaritimePreparation[] {
  const presentation = getBoatPresentation(state, boat);
  if (!presentation?.owned) return [];
  const target = boatTarget(boat);
  const groupAnchor: Target | undefined = boat.accessLand
    ? { type: 'point', ...boat.accessLand }
    : undefined;
  const harbor = state.buildings.find(
    (building) => building.id === boat.harborId && building.kind === 'harbor' && building.hp > 0,
  );
  if (boat.status === 'building')
    return harbor
      ? [
          maritimePreparation(state, {
            id: 'resume',
            label: 'Prepara ripresa dello scafo',
            tokens: ['S_01', 'V_06', 'O_03', 'O_01'],
            target: { type: 'building', id: harbor.id, x: harbor.x, y: harbor.y },
            groupAnchor: { type: 'point', x: harbor.x, y: harbor.y },
          }),
        ]
      : [];
  const moored = boat.status === 'moored' && !!boat.accessLand;
  const boardingGroup = suggestedBoardingGroup(state, boat);
  const preparations = [
    maritimePreparation(
      state,
      {
        id: 'board',
        label: boardingGroup.crew ? 'Prepara piccolo equipaggio' : 'Prepara imbarco del gruppo',
        tokens: ['S_01', 'V_01'],
        target,
        groupAnchor: boardingGroup.groupAnchor,
        detail: boardingGroup.crew
          ? boardingGroup.crew.map((unit) => unit.name).join(' · ')
          : undefined,
      },
      !moored
        ? 'Per imbarcare occorre una riva di attracco.'
        : presentation.boarding
          ? 'Attendi che l’imbarco sia concluso.'
          : boardingGroup.issue,
    ),
    maritimePreparation(
      state,
      {
        id: 'sail',
        label: 'Prepara navigazione',
        tokens: ['S_01', 'V_01', 'O_01'],
        groupAnchor: target,
      },
      boatPassengers(state, boat).length === 0
        ? 'Imbarca un equipaggio prima di partire.'
        : presentation.boarding
          ? 'Attendi che l’imbarco sia concluso.'
          : boat.status === 'landing'
            ? 'Attendi che lo sbarco sia concluso.'
            : undefined,
    ),
  ];
  if (moored)
    for (const [word, material] of [
      ['O_03', 'legno'],
      ['O_02', 'pietra'],
      ['O_04', 'viveri'],
    ]) {
      if (!hasWord(state, word)) continue;
      for (const loading of [true, false])
        preparations.push(
          maritimePreparation(state, {
            id: `${loading ? 'load' : 'unload'}-${word}`,
            label: `Prepara ${loading ? 'carico' : 'scarico'}: ${material}`,
            tokens: ['S_01', 'V_04', word, loading ? 'M_02' : 'O_01'],
            target,
            groupAnchor,
          }),
        );
    }
  return preparations;
}
